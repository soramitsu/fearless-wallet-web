import * as bitcoin from 'bitcoinjs-lib';

import vectors from '../../docs/universal-wallet-v2-vectors.json';
import {
  BITCOIN_P2WPKH_DUST_SAT,
  BitcoinTransactionError,
  buildBitcoinP2wpkhTransaction,
  estimateP2wpkhTransactionVSize,
} from '@/util/bitcoinTransaction';

const mnemonic = vectors.vectors[0].mnemonic;
const mainnetAddress = vectors.vectors[0].expected.bitcoin.mainnet.firstReceiveAddress;
const mainnetRecipient = vectors.vectors[1].expected.bitcoin.mainnet.firstReceiveAddress;
const testnetAddress = vectors.vectors[0].expected.bitcoin.testnet.firstReceiveAddress;
const txid = '11'.repeat(32);

const errorCodeOf = (action: () => unknown): string => {
  try {
    action();
  } catch (error) {
    if (error instanceof BitcoinTransactionError) return error.code;

    throw error;
  }

  throw new Error('expected BitcoinTransactionError');
};

describe('Bitcoin BIP84 transaction builder', () => {
  it('builds and signs a mainnet P2WPKH transaction with deterministic change', () => {
    const result = buildBitcoinP2wpkhTransaction({
      mnemonicOrSeed: mnemonic,
      inputs: [
        {
          address: mainnetAddress,
          txid,
          value: 100_000,
          vout: 1,
        },
      ],
      outputs: [
        {
          address: mainnetRecipient,
          value: 50_000,
        },
      ],
      changeAddress: mainnetAddress,
      feeRateSatPerVbyte: 2,
    });
    const tx = bitcoin.Transaction.fromHex(result.txHex);

    expect(result.fee).toBe(estimateP2wpkhTransactionVSize(1, 2) * 2);
    expect(result.change).toBe(49_718);
    expect(result.inputTotal).toBe(100_000);
    expect(result.outputTotal).toBe(50_000);
    expect(result.txid).toBe(tx.getId());
    expect(result.vsize).toBe(tx.virtualSize());
    expect(tx.ins).toHaveLength(1);
    expect(tx.ins[0].hash.toString('hex')).toBe(Buffer.from(txid, 'hex').reverse().toString('hex'));
    expect(tx.ins[0].index).toBe(1);
    expect(tx.ins[0].witness.length).toBeGreaterThan(0);
    expect(tx.outs.map(({ value }) => value)).toEqual([50_000, 49_718]);
  });

  it('supports explicit-fee spends with no change output', () => {
    const result = buildBitcoinP2wpkhTransaction({
      mnemonicOrSeed: mnemonic,
      inputs: [
        {
          txid: '22'.repeat(32),
          value: 51_000,
          vout: 0,
        },
      ],
      outputs: [
        {
          address: mainnetRecipient,
          value: 50_000,
        },
      ],
      feeSat: 1_000,
    });
    const tx = bitcoin.Transaction.fromHex(result.txHex);

    expect(result.change).toBe(0);
    expect(result.fee).toBe(1_000);
    expect(tx.outs).toHaveLength(1);
    expect(tx.outs[0].value).toBe(50_000);
  });

  it('rejects unsafe UTXOs, outputs, fees, and change handling before signing', () => {
    const base = {
      mnemonicOrSeed: mnemonic,
      inputs: [{ txid, value: 100_000, vout: 0 }],
      outputs: [{ address: mainnetRecipient, value: 50_000 }],
      feeSat: 1_000,
    };

    expect(errorCodeOf(() => buildBitcoinP2wpkhTransaction({ ...base, inputs: [] }))).toBe('inputs_required');
    expect(
      errorCodeOf(() =>
        buildBitcoinP2wpkhTransaction({
          ...base,
          inputs: [{ txid: 'zz', value: 100_000, vout: 0 }],
        })
      )
    ).toBe('invalid_txid');
    expect(
      errorCodeOf(() =>
        buildBitcoinP2wpkhTransaction({
          ...base,
          inputs: [
            { txid, value: 100_000, vout: 0 },
            { txid, value: 100_000, vout: 0 },
          ],
        })
      )
    ).toBe('duplicate_utxo');
    expect(
      errorCodeOf(() =>
        buildBitcoinP2wpkhTransaction({
          ...base,
          outputs: [{ address: testnetAddress, value: 50_000 }],
        })
      )
    ).toBe('invalid_output_address');
    expect(
      errorCodeOf(() =>
        buildBitcoinP2wpkhTransaction({
          ...base,
          outputs: [{ address: mainnetRecipient, value: BITCOIN_P2WPKH_DUST_SAT - 1 }],
        })
      )
    ).toBe('invalid_output_value');
    expect(errorCodeOf(() => buildBitcoinP2wpkhTransaction({ ...base, feeSat: 0 }))).toBe('invalid_fee');
    expect(
      errorCodeOf(() =>
        buildBitcoinP2wpkhTransaction({
          ...base,
          feeSat: undefined,
          feeRateSatPerVbyte: 0,
        })
      )
    ).toBe('invalid_fee_rate');
    expect(
      errorCodeOf(() =>
        buildBitcoinP2wpkhTransaction({
          ...base,
          inputs: [{ txid, value: 50_500, vout: 0 }],
        })
      )
    ).toBe('insufficient_funds');
    expect(
      errorCodeOf(() =>
        buildBitcoinP2wpkhTransaction({
          ...base,
          inputs: [{ txid, value: 52_000, vout: 0 }],
        })
      )
    ).toBe('change_address_required');
    expect(
      errorCodeOf(() =>
        buildBitcoinP2wpkhTransaction({
          ...base,
          changeAddress: mainnetAddress,
          feeSat: 800,
          inputs: [{ txid, value: 50_900, vout: 0 }],
        })
      )
    ).toBe('change_below_dust');
  });

  it('rejects UTXOs that do not match the derived BIP84 key or witness script', () => {
    expect(
      errorCodeOf(() =>
        buildBitcoinP2wpkhTransaction({
          mnemonicOrSeed: mnemonic,
          inputs: [
            {
              address: mainnetRecipient,
              txid,
              value: 51_000,
              vout: 0,
            },
          ],
          outputs: [{ address: mainnetRecipient, value: 50_000 }],
          feeSat: 1_000,
        })
      )
    ).toBe('utxo_address_mismatch');

    expect(
      errorCodeOf(() =>
        buildBitcoinP2wpkhTransaction({
          mnemonicOrSeed: mnemonic,
          inputs: [
            {
              scriptPubKey: `0014${'00'.repeat(20)}`,
              txid,
              value: 51_000,
              vout: 0,
            },
          ],
          outputs: [{ address: mainnetRecipient, value: 50_000 }],
          feeSat: 1_000,
        })
      )
    ).toBe('utxo_script_mismatch');
  });
});
