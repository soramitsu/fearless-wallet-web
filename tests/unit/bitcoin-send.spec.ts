import * as bitcoin from 'bitcoinjs-lib';

import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type { BitcoinEsploraUtxo } from '@extension-base/services/bitcoin-indexer-service';
import {
  BitcoinSendError,
  prepareBitcoinSend,
  selectBitcoinFeeRateSatPerVbyte,
  sendBitcoinTransaction,
  type BitcoinSendClient,
} from '@/util/bitcoinSend';
import { deriveBitcoinReceiveAddress, getBitcoinReceivePath } from '@/util/bitcoinKeyring';
import { estimateP2wpkhTransactionVSize } from '@/util/bitcoinTransaction';

const mnemonic = vectors.vectors[0].mnemonic;
const mainnetAddress = vectors.vectors[0].expected.bitcoin.mainnet.firstReceiveAddress;
const mainnetRecipient = vectors.vectors[1].expected.bitcoin.mainnet.firstReceiveAddress;
const testnetAddress = vectors.vectors[0].expected.bitcoin.testnet.firstReceiveAddress;
const txid = '11'.repeat(32);
const secondTxid = '22'.repeat(32);

const confirmedUtxo = (value: number, vout = 0, id = txid): BitcoinEsploraUtxo => ({
  status: { confirmed: true, block_hash: '22'.repeat(32), block_height: 100, block_time: 1_700_000_000 },
  txid: id,
  value,
  vout,
});

const unconfirmedUtxo = (value: number, vout = 0, id = '33'.repeat(32)): BitcoinEsploraUtxo => ({
  status: { confirmed: false },
  txid: id,
  value,
  vout,
});

const mockClient = ({
  estimates = { 1: 5, 3: 2 },
  txidFromBroadcast = true,
  utxos = [confirmedUtxo(100_000)],
}: {
  estimates?: Record<string, number>;
  txidFromBroadcast?: boolean;
  utxos?: BitcoinEsploraUtxo[] | ((address: string) => BitcoinEsploraUtxo[]);
} = {}): BitcoinSendClient => ({
  broadcastTransaction: vi.fn(async (txHex: string) =>
    txidFromBroadcast ? bitcoin.Transaction.fromHex(txHex).getId() : '44'.repeat(32)
  ),
  getFeeEstimates: vi.fn(async () => estimates),
  getUtxos: vi.fn(async (address: string) => (typeof utxos === 'function' ? utxos(address) : utxos)),
});

const expectBitcoinSendError = async (action: Promise<unknown>, code: string): Promise<void> => {
  await expect(action).rejects.toMatchObject({
    code,
    name: 'BitcoinSendError',
  });
};

describe('Bitcoin send service', () => {
  it('prepares and broadcasts a confirmed mainnet spend with estimated fees', async () => {
    const client = mockClient();
    const result = await sendBitcoinTransaction({
      amountSat: 50_000,
      client,
      feeTargetBlocks: 2,
      mnemonicOrSeed: mnemonic,
      sources: [{ address: mainnetAddress }],
      toAddress: mainnetRecipient,
    });
    const tx = bitcoin.Transaction.fromHex(result.txHex);

    expect(result.broadcastTxid).toBe(result.txid);
    expect(result.feeRateSatPerVbyte).toBe(2);
    expect(result.feeTargetBlocks).toBe(2);
    expect(result.fee).toBe(estimateP2wpkhTransactionVSize(1, 2) * 2);
    expect(result.change).toBe(100_000 - 50_000 - result.fee);
    expect(result.changeAddress).toBe(mainnetAddress);
    expect(result.selectedUtxos).toEqual([
      expect.objectContaining({
        address: mainnetAddress,
        txid,
        value: 100_000,
        vout: 0,
      }),
    ]);
    expect(result.sourceAddresses).toEqual([mainnetAddress]);
    expect(tx.getId()).toBe(result.txid);
    expect(tx.outs.map(({ value }) => value)).toEqual([50_000, result.change]);
    expect(client.getFeeEstimates).toHaveBeenCalledTimes(1);
    expect(client.getUtxos).toHaveBeenCalledWith(mainnetAddress);
    expect(client.broadcastTransaction).toHaveBeenCalledWith(result.txHex);
  });

  it('selects deterministic spendable UTXOs across discovered receive addresses', async () => {
    const secondPath = getBitcoinReceivePath('mainnet', 1);
    const secondAddress = deriveBitcoinReceiveAddress({ mnemonicOrSeed: mnemonic, path: secondPath });
    const client = mockClient({
      utxos: (address) =>
        address === mainnetAddress
          ? [unconfirmedUtxo(200_000)]
          : [confirmedUtxo(80_000, 1, '55'.repeat(32))],
    });
    const result = await prepareBitcoinSend({
      amountSat: 30_000,
      client,
      feeRateSatPerVbyte: 1,
      mnemonicOrSeed: mnemonic,
      sources: [
        { address: mainnetAddress },
        { address: secondAddress, derivationPath: secondPath },
      ],
      toAddress: mainnetRecipient,
    });

    expect(result.selectedUtxos).toEqual([
      expect.objectContaining({
        address: secondAddress,
        derivationPath: secondPath,
        txid: '55'.repeat(32),
      }),
    ]);
    expect(result.sourceAddresses).toEqual([mainnetAddress, secondAddress]);
    expect(client.getUtxos).toHaveBeenCalledTimes(2);
  });

  it('spends exactly the requested coin-control outpoints without auto-adding larger UTXOs', async () => {
    const client = mockClient({
      utxos: [
        confirmedUtxo(250_000, 0, txid),
        confirmedUtxo(60_000, 1, secondTxid),
      ],
    });
    const result = await prepareBitcoinSend({
      amountSat: 50_000,
      client,
      feeRateSatPerVbyte: 1,
      mnemonicOrSeed: mnemonic,
      selectedOutpoints: [{ txid: secondTxid, vout: 1 }],
      sources: [{ address: mainnetAddress }],
      toAddress: mainnetRecipient,
    });

    expect(result.selectedUtxos).toEqual([
      expect.objectContaining({
        txid: secondTxid,
        value: 60_000,
        vout: 1,
      }),
    ]);
    expect(result.change).toBe(60_000 - 50_000 - result.fee);
    expect(result.inputTotal).toBe(60_000);
  });

  it('rejects malformed, duplicate, unavailable, and insufficient selected outpoints', async () => {
    const client = mockClient({
      utxos: [
        confirmedUtxo(20_000, 0, txid),
        confirmedUtxo(250_000, 1, secondTxid),
      ],
    });
    const base = {
      amountSat: 50_000,
      client,
      feeRateSatPerVbyte: 1,
      mnemonicOrSeed: mnemonic,
      sources: [{ address: mainnetAddress }],
      toAddress: mainnetRecipient,
    };

    await expectBitcoinSendError(
      prepareBitcoinSend({
        ...base,
        selectedOutpoints: [{ txid: 'zz', vout: 0 }],
      }),
      'invalid_selected_outpoint'
    );
    await expectBitcoinSendError(
      prepareBitcoinSend({
        ...base,
        selectedOutpoints: [
          { txid, vout: 0 },
          { txid, vout: 0 },
        ],
      }),
      'duplicate_selected_outpoint'
    );
    await expectBitcoinSendError(
      prepareBitcoinSend({
        ...base,
        selectedOutpoints: [{ txid: '66'.repeat(32), vout: 0 }],
      }),
      'selected_utxo_unavailable'
    );
    await expectBitcoinSendError(
      prepareBitcoinSend({
        ...base,
        selectedOutpoints: [{ txid, vout: 0 }],
      }),
      'insufficient_funds'
    );
  });

  it('requires explicitly selected unconfirmed coins to opt in to unconfirmed spending', async () => {
    const client = mockClient({ utxos: [unconfirmedUtxo(100_000, 0, secondTxid)] });
    const base = {
      amountSat: 50_000,
      client,
      feeRateSatPerVbyte: 1,
      mnemonicOrSeed: mnemonic,
      selectedOutpoints: [{ txid: secondTxid, vout: 0 }],
      sources: [{ address: mainnetAddress }],
      toAddress: mainnetRecipient,
    };

    await expectBitcoinSendError(prepareBitcoinSend(base), 'selected_utxo_unavailable');
    await expect(prepareBitcoinSend({ ...base, includeUnconfirmed: true })).resolves.toMatchObject({
      selectedUtxos: [expect.objectContaining({ txid: secondTxid })],
    });
  });

  it('absorbs uneconomical dust change into the transaction fee', async () => {
    const noChangeFee = estimateP2wpkhTransactionVSize(1, 1);
    const client = mockClient({ utxos: [confirmedUtxo(50_000 + noChangeFee + 100)] });
    const result = await prepareBitcoinSend({
      amountSat: 50_000,
      client,
      feeRateSatPerVbyte: 1,
      mnemonicOrSeed: mnemonic,
      sources: [{ address: mainnetAddress }],
      toAddress: mainnetRecipient,
    });
    const tx = bitcoin.Transaction.fromHex(result.txHex);

    expect(result.absorbedDustSat).toBe(100);
    expect(result.change).toBe(0);
    expect(result.changeAddress).toBeUndefined();
    expect(result.fee).toBe(noChangeFee + 100);
    expect(tx.outs).toHaveLength(1);
  });

  it('supports opt-in unconfirmed UTXOs', async () => {
    const client = mockClient({ utxos: [unconfirmedUtxo(100_000)] });

    await expectBitcoinSendError(
      prepareBitcoinSend({
        amountSat: 50_000,
        client,
        feeRateSatPerVbyte: 1,
        mnemonicOrSeed: mnemonic,
        sources: [{ address: mainnetAddress }],
        toAddress: mainnetRecipient,
      }),
      'no_spendable_utxos'
    );

    await expect(
      prepareBitcoinSend({
        amountSat: 50_000,
        client,
        feeRateSatPerVbyte: 1,
        includeUnconfirmed: true,
        mnemonicOrSeed: mnemonic,
        sources: [{ address: mainnetAddress }],
        toAddress: mainnetRecipient,
      })
    ).resolves.toMatchObject({
      amountSat: 50_000,
      selectedUtxos: [expect.objectContaining({ txid: '33'.repeat(32) })],
    });
  });

  it('selects exact, next-slower, or slowest available fee estimates safely', () => {
    expect(selectBitcoinFeeRateSatPerVbyte({ 1: 9, 2: 4, 6: 2 }, 2)).toBe(4);
    expect(selectBitcoinFeeRateSatPerVbyte({ 1: 9, 6: 2 }, 2)).toBe(2);
    expect(selectBitcoinFeeRateSatPerVbyte({ 1: 9, 6: 2 }, 10)).toBe(2);
    expect(() => selectBitcoinFeeRateSatPerVbyte({}, 2)).toThrow(BitcoinSendError);
    expect(() => selectBitcoinFeeRateSatPerVbyte({ 2: 1 }, 0)).toThrow(BitcoinSendError);
    expect(() => selectBitcoinFeeRateSatPerVbyte({ 2: 10_001 }, 2)).toThrow(BitcoinSendError);
  });

  it('rejects unsafe send parameters before broadcast', async () => {
    const client = mockClient();
    const base = {
      amountSat: 50_000,
      client,
      feeRateSatPerVbyte: 1,
      mnemonicOrSeed: mnemonic,
      sources: [{ address: mainnetAddress }],
      toAddress: mainnetRecipient,
    };

    await expectBitcoinSendError(prepareBitcoinSend({ ...base, amountSat: 1 }), 'amount_below_dust');
    await expectBitcoinSendError(prepareBitcoinSend({ ...base, changeAddress: testnetAddress }), 'invalid_change_address');
    await expectBitcoinSendError(prepareBitcoinSend({ ...base, feeRateSatPerVbyte: 0 }), 'invalid_fee_rate');
    await expectBitcoinSendError(prepareBitcoinSend({ ...base, feeTargetBlocks: 0 }), 'invalid_fee_target');
    await expectBitcoinSendError(prepareBitcoinSend({ ...base, maxInputs: 0 }), 'invalid_max_inputs');
    await expectBitcoinSendError(prepareBitcoinSend({ ...base, mnemonicOrSeed: '   ' }), 'mnemonic_required');
    await expectBitcoinSendError(prepareBitcoinSend({ ...base, network: 'testnet' }), 'invalid_source_address');
    await expectBitcoinSendError(prepareBitcoinSend({ ...base, sources: [] }), 'sources_required');
    await expectBitcoinSendError(
      prepareBitcoinSend({ ...base, sources: [{ address: mainnetAddress }, { address: mainnetAddress }] }),
      'duplicate_source_address'
    );
    await expectBitcoinSendError(
      prepareBitcoinSend({ ...base, sources: [{ address: mainnetAddress, derivationPath: '../bad' }] }),
      'invalid_derivation_path'
    );
    await expectBitcoinSendError(prepareBitcoinSend({ ...base, toAddress: testnetAddress }), 'invalid_recipient_address');
    expect(client.broadcastTransaction).not.toHaveBeenCalled();
  });

  it('rejects insufficient funds, too many required inputs, and broadcast mismatches', async () => {
    await expectBitcoinSendError(
      prepareBitcoinSend({
        amountSat: 50_000,
        client: mockClient({ utxos: [confirmedUtxo(30_000)] }),
        feeRateSatPerVbyte: 1,
        mnemonicOrSeed: mnemonic,
        sources: [{ address: mainnetAddress }],
        toAddress: mainnetRecipient,
      }),
      'insufficient_funds'
    );

    await expectBitcoinSendError(
      prepareBitcoinSend({
        amountSat: 90_000,
        client: mockClient({ utxos: [confirmedUtxo(40_000, 0), confirmedUtxo(40_000, 1), confirmedUtxo(40_000, 2)] }),
        feeRateSatPerVbyte: 1,
        maxInputs: 1,
        mnemonicOrSeed: mnemonic,
        sources: [{ address: mainnetAddress }],
        toAddress: mainnetRecipient,
      }),
      'too_many_inputs_required'
    );

    await expectBitcoinSendError(
      sendBitcoinTransaction({
        amountSat: 50_000,
        client: mockClient({ txidFromBroadcast: false }),
        feeRateSatPerVbyte: 1,
        mnemonicOrSeed: mnemonic,
        sources: [{ address: mainnetAddress }],
        toAddress: mainnetRecipient,
      }),
      'broadcast_txid_mismatch'
    );
  });
});
