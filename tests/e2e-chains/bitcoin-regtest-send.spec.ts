// @vitest-environment node
/**
 * Bitcoin send end-to-end against a local `bitcoind -regtest` only, through the
 * Esplora-compatible shim in scripts/local-chains. Drives the wallet's real
 * background send code (`makeBitcoinTransfer`, `quoteBitcoinTransfer`) and real
 * Esplora client. Run with `node scripts/test-local-chain-sends.mjs`; skipped
 * otherwise.
 */
import { makeBitcoinTransfer, quoteBitcoinTransfer } from '@extension-base/api/bitcoin/transfer';
import { BitcoinBroadcastError, BitcoinEsploraClient } from '@extension-base/services/bitcoin-indexer-service';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import { createBitcoindRpc } from '../../scripts/local-chains/bitcoind-rpc.mjs';
import { toRegtestAddress, toTestnetAddress } from '../../scripts/local-chains/esplora-regtest-shim.mjs';
import type { BitcoinPendingSend } from '@extension-base/api/bitcoin/pendingSends';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { deriveBitcoinReceiveAddress, getBitcoinReceivePath } from '@/util/bitcoinKeyring';

// Modules see Vite's `process` polyfill; the runner's variables live on Node's own process.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const ESPLORA_URL = env.FEARLESS_E2E_ESPLORA_URL;
const mnemonic = vectors.vectors[0].mnemonic;
const NETWORK_KEY = 'Bitcoin Testnet';
const SATS = 100_000_000;

type RpcTx = {
  confirmations?: number;
  txid: string;
  vin: Array<{ sequence: number; txid: string; vout: number }>;
  vout: Array<{ n: number; scriptPubKey: { address?: string }; value: number }>;
  vsize: number;
};

const toSats = (btc: number) => Math.round(btc * SATS);

describe.skipIf(!ESPLORA_URL)('Bitcoin send on local regtest', () => {
  const rpc = createBitcoindRpc({
    password: env.FEARLESS_E2E_BITCOIND_PASSWORD,
    url: env.FEARLESS_E2E_BITCOIND_RPC_URL,
    user: env.FEARLESS_E2E_BITCOIND_USER,
  });
  const walletAddress = deriveBitcoinReceiveAddress({
    mnemonicOrSeed: mnemonic,
    network: 'testnet',
    path: getBitcoinReceivePath('testnet', 0),
  });
  const changeAddresses = Array.from({ length: 12 }, (_, index) =>
    toRegtestAddress(
      deriveBitcoinReceiveAddress({ mnemonicOrSeed: mnemonic, network: 'testnet', path: getBitcoinReceivePath('testnet', index, 1) })
    )
  );
  const state = {
    balanceService: { fetchBalance: vi.fn(async () => []) },
    keyringService: {
      exportMnemonic: vi.fn(() => ({ seed: mnemonic })),
      getAllAccounts: vi.fn(() => [
        {
          address: 'e2e-account',
          meta: { bitcoinTestnetAddress: walletAddress, walletEcosystem: WalletEcosystem.Substrate },
        },
      ]),
    },
    networkService: {
      networkMap: {
        [NETWORK_KEY]: {
          chainId: 'bitcoin:testnet',
          ecosystem: 'bitcoin',
          key: NETWORK_KEY,
          name: NETWORK_KEY,
          options: ['testnet'],
        } as unknown as NetworkJson,
      },
    },
  } as unknown as State;
  const discovery = { gapLimit: 5, maxLookahead: 40 };
  let minerAddress: string;
  let pendingRecords: BitcoinPendingSend[] = [];
  const pendingStore = {
    list: async () => pendingRecords,
    remove: async (txids: string[]) => {
      pendingRecords = pendingRecords.filter(({ txid }) => !txids.includes(txid));
    },
    save: async (record: BitcoinPendingSend) => {
      pendingRecords = [...pendingRecords.filter(({ txid }) => txid !== record.txid), record];
    },
  };

  const esplora = () => new BitcoinEsploraClient({ baseUrl: ESPLORA_URL, network: 'testnet' });
  const recording = (client = esplora()) => {
    const broadcasts: string[] = [];
    const broadcastTransaction = client.broadcastTransaction.bind(client);

    return {
      broadcasts,
      client: Object.assign(client, {
        broadcastTransaction: async (txHex: string, txid?: string) => {
          broadcasts.push(txHex);

          return broadcastTransaction(txHex, txid);
        },
      }),
    };
  };
  const mine = (blocks = 1) => rpc.call('generatetoaddress', [blocks, minerAddress]);
  const newRecipient = async (type: 'bech32' | 'bech32m' | 'legacy' | 'p2sh-segwit') =>
    toTestnetAddress(await rpc.call('getnewaddress', ['', type], 'recipient'));
  const received = async (address: string) =>
    toSats(await rpc.call('getreceivedbyaddress', [toRegtestAddress(address), 1], 'recipient'));
  const decode = async (txHex: string): Promise<RpcTx> => rpc.call('decoderawtransaction', [txHex]);
  const send = (to: string, amount: string, client: BitcoinEsploraClient, extra: Record<string, unknown> = {}) =>
    makeBitcoinTransfer(
      { amount, callback: vi.fn(), from: 'e2e-account', networkKey: NETWORK_KEY, state, to, ...extra },
      client,
      discovery,
      pendingStore
    );
  const quote = (to: string, amount: string) =>
    quoteBitcoinTransfer({ amount, from: 'e2e-account', networkKey: NETWORK_KEY, state, to }, esplora(), discovery, pendingStore);

  beforeAll(async () => {
    process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'true';
    await rpc.call('createwallet', ['miner']);
    await rpc.call('createwallet', ['recipient']);
    minerAddress = await rpc.call('getnewaddress', [], 'miner');
    await mine(101);
    await rpc.call('sendtoaddress', [toRegtestAddress(walletAddress), 1], 'miner');
    await rpc.call('sendtoaddress', [toRegtestAddress(walletAddress), 0.5], 'miner');
    await mine(1);
  });

  it('pays a P2WPKH recipient with change to the wallet change address and the quoted fee', async () => {
    const recipient = await newRecipient('bech32');
    const quoted = await quote(recipient, '0.1');
    const { broadcasts, client } = recording();

    expect(quoted).toMatchObject({ awaitingConfirmation: '0', spendable: '1.5' });
    expect(quoted.unavailableReason).toBeUndefined();

    await send(recipient, '0.1', client, { bitcoinFeeRateSatPerVbyte: quoted.feeRateSatPerVbyte });

    const tx = await decode(broadcasts[0]);
    const inputs = await Promise.all(
      tx.vin.map(async ({ txid, vout }) => toSats((await rpc.call('getrawtransaction', [txid, true])).vout[vout].value))
    );
    const payment = tx.vout.find(({ scriptPubKey }) => scriptPubKey.address === toRegtestAddress(recipient))!;
    const change = tx.vout.find(({ scriptPubKey }) => scriptPubKey.address !== toRegtestAddress(recipient))!;
    const fee = inputs.reduce((total, value) => total + value, 0) - tx.vout.reduce((total, { value }) => total + toSats(value), 0);

    expect(toSats(payment.value)).toBe(10_000_000);
    expect(changeAddresses).toContain(change.scriptPubKey.address);
    expect(fee).toBe(toSats(Number(quoted.fee)));
    expect(fee / tx.vsize).toBeGreaterThanOrEqual(quoted.feeRateSatPerVbyte);
    expect(tx.vin.every(({ sequence }) => sequence === 0xfffffffd)).toBe(true);
    expect(pendingRecords).toEqual([]);

    await mine(1);
    expect(await received(recipient)).toBe(10_000_000);
    expect((await rpc.call('getrawtransaction', [tx.txid, true])).confirmations).toBe(1);
  });

  it.each([
    ['Taproot', 'bech32m'],
    ['legacy P2PKH', 'legacy'],
    ['P2SH', 'p2sh-segwit'],
  ] as const)('pays a %s recipient', async (_label, type) => {
    const recipient = await newRecipient(type);
    const { client } = recording();

    await send(recipient, '0.01', client);
    await mine(1);

    expect(await received(recipient)).toBe(1_000_000);
  });

  it('refuses an amount below the dust limit before signing or broadcasting', async () => {
    const recipient = await newRecipient('bech32');
    const { broadcasts, client } = recording();

    await expect(send(recipient, '0.000001', client)).rejects.toThrow('bitcoin_amount_below_dust');
    expect(broadcasts).toEqual([]);
  });

  it('retries a lost broadcast with the same coins so only one payment can ever confirm', async () => {
    const first = await newRecipient('bech32');
    const second = await newRecipient('bech32');
    const lost: string[] = [];
    const losing = Object.assign(esplora(), {
      broadcastTransaction: async (txHex: string) => {
        lost.push(txHex);
        throw new BitcoinBroadcastError('bitcoin_broadcast_ambiguous', true);
      },
    });

    await expect(send(first, '0.03', losing)).rejects.toThrow('bitcoin_broadcast_ambiguous');
    expect(pendingRecords).toHaveLength(1);

    const { broadcasts, client } = recording();

    await send(second, '0.02', client);

    const lostTx = await decode(lost[0]);
    const retryTx = await decode(broadcasts[0]);
    const outpoints = (tx: RpcTx) => tx.vin.map(({ txid, vout }) => `${txid}:${vout}`);

    expect(outpoints(retryTx)).toEqual(expect.arrayContaining(outpoints(lostTx)));
    expect(pendingRecords).toEqual([]);

    await mine(1);
    // The earlier transaction surfacing late can no longer confirm.
    await expect(rpc.call('sendrawtransaction', [lost[0]])).rejects.toThrow(/missing|spent|conflict/iu);
    await mine(1);
    expect(await received(first)).toBe(0);
    expect(await received(second)).toBe(2_000_000);
  });

  it('recognises an ambiguous broadcast that did reach the network', async () => {
    const first = await newRecipient('bech32');
    const second = await newRecipient('bech32');
    const relaying = esplora();
    const relay = relaying.broadcastTransaction.bind(relaying);

    relaying.broadcastTransaction = async (txHex: string, txid?: string) => {
      await relay(txHex, txid);
      throw new BitcoinBroadcastError('bitcoin_broadcast_ambiguous', true);
    };

    await expect(send(first, '0.004', relaying)).rejects.toThrow('bitcoin_broadcast_ambiguous');
    expect(pendingRecords).toHaveLength(1);

    await mine(1);
    // The indexer now proves the first transaction landed, so the record is
    // resolved and the next, deliberate payment is not blocked.
    await send(second, '0.005', recording().client);
    expect(pendingRecords).toEqual([]);

    await mine(1);
    expect(await received(first)).toBe(400_000);
    expect(await received(second)).toBe(500_000);
  });

  it('sends nothing new while a relayed transaction waits in the mempool, so a retry cannot pay twice', async () => {
    const first = await newRecipient('bech32');
    const relaying = esplora();
    const relay = relaying.broadcastTransaction.bind(relaying);

    relaying.broadcastTransaction = async (txHex: string, txid?: string) => {
      await relay(txHex, txid);
      throw new BitcoinBroadcastError('bitcoin_broadcast_ambiguous', true);
    };

    await expect(send(first, '0.006', relaying)).rejects.toThrow('bitcoin_broadcast_ambiguous');

    // The user tries the same payment again before a block is mined. The
    // indexer no longer lists the relayed transaction's coins, so the wallet
    // refuses instead of paying from other coins.
    const retry = recording();

    await expect(send(first, '0.006', retry.client)).rejects.toThrow('bitcoin_previous_send_unconfirmed');
    expect(retry.broadcasts).toEqual([]);
    await expect(quote(first, '0.006')).resolves.toMatchObject({
      pendingPreviousSend: false,
      previousSend: { amount: '0.006', inMempool: true, recipient: first },
      unavailableReason: 'bitcoin_previous_send_unconfirmed',
    });

    await mine(1);
    // Confirmed: the record is resolved and a deliberate new payment goes through.
    await send(first, '0.001', recording().client);
    expect(pendingRecords).toEqual([]);

    await mine(1);
    expect(await received(first)).toBe(700_000);
  });

  it('sends exactly the quoted maximum, leaving nothing spendable', async () => {
    await mine(1);

    const recipient = await newRecipient('bech32m');
    const quoted = await quote(recipient, '0');
    const maxSats = toSats(Number(quoted.maxSendable));

    expect(maxSats).toBeGreaterThan(0);

    const { broadcasts, client } = recording();

    await send(recipient, quoted.maxSendable, client, { bitcoinFeeRateSatPerVbyte: quoted.feeRateSatPerVbyte });

    const tx = await decode(broadcasts[0]);

    expect(tx.vout).toHaveLength(1);
    expect(toSats(tx.vout[0].value)).toBe(maxSats);

    await mine(1);
    expect(await received(recipient)).toBe(maxSats);
    expect((await quote(recipient, '0')).spendable).toBe('0');
  });
});
