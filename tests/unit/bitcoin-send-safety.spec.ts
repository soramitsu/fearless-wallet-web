import * as bitcoin from 'bitcoinjs-lib';

import {
  BitcoinBroadcastError,
  BitcoinEsploraClient,
  type BitcoinEsploraUtxo,
} from '@extension-base/services/bitcoin-indexer-service';
import {
  createStorageBitcoinPendingSendStore,
  resolveBitcoinPendingSends,
  type BitcoinPendingSend,
} from '@extension-base/api/bitcoin/pendingSends';
import { makeBitcoinTransfer, quoteBitcoinTransfer } from '@extension-base/api/bitcoin/transfer';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import {
  BITCOIN_MAX_FEE_RATE_SAT_PER_VBYTE,
  prepareBitcoinSend,
  quoteBitcoinSend,
  selectBitcoinFeeRateSatPerVbyte,
  summarizeBitcoinSpendable,
} from '@/util/bitcoinSend';
import { estimateBitcoinTransactionVSize } from '@/util/bitcoinTransaction';

const mnemonic = vectors.vectors[0].mnemonic;
const mainnetAddress = vectors.vectors[0].expected.bitcoin.mainnet.firstReceiveAddress;
const testnetAddress = vectors.vectors[0].expected.bitcoin.testnet.firstReceiveAddress;
const recipient = vectors.vectors[1].expected.bitcoin.mainnet.firstReceiveAddress;
const taprootRecipient = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
const legacyRecipient = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
const originalBitcoinFlag = process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS;

const utxo = (value: number, txid: string, vout = 0, confirmed = true): BitcoinEsploraUtxo => ({
  status: confirmed ? { confirmed: true, block_height: 100 } : { confirmed: false },
  txid,
  value,
  vout,
});

const network = (): NetworkJson =>
  ({
    active: true,
    assets: [],
    chainId: 'bitcoin:mainnet',
    ecosystem: 'bitcoin',
    key: 'Bitcoin',
    name: 'Bitcoin',
    nodes: [],
    options: [],
    providers: {},
  }) as unknown as NetworkJson;

const createState = () =>
  ({
    balanceService: { fetchBalance: vi.fn(async () => []) },
    keyringService: {
      exportMnemonic: vi.fn(() => ({ seed: mnemonic })),
      getAllAccounts: vi.fn(() => [
        {
          address: 'stored-account',
          meta: {
            bitcoinAddress: mainnetAddress,
            bitcoinTestnetAddress: testnetAddress,
            walletEcosystem: WalletEcosystem.Substrate,
          },
        },
      ]),
    },
    networkService: { networkMap: { Bitcoin: network() } },
  }) as unknown as State;

const addressStats = (address: string) => {
  const used = address === mainnetAddress;

  return {
    address,
    chain_stats: { funded_txo_count: used ? 1 : 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: used ? 1 : 0 },
    mempool_stats: { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 },
  };
};

const memoryPendingStore = (initial: BitcoinPendingSend[] = []) => {
  let records = [...initial];

  return {
    list: vi.fn(async () => records),
    remove: vi.fn(async (txids: string[]) => {
      records = records.filter(({ txid }) => !txids.includes(txid));
    }),
    save: vi.fn(async (record: BitcoinPendingSend) => {
      records = [...records.filter(({ txid }) => txid !== record.txid), record];
    }),
    get records() {
      return records;
    },
  };
};

const transferClient = ({
  broadcast,
  outspends = {},
  statuses = {},
  utxos = [utxo(100_000, '11'.repeat(32)), utxo(60_000, '22'.repeat(32), 1)],
}: {
  broadcast?: (txHex: string, txid?: string) => Promise<string>;
  outspends?: Record<string, { spent: boolean; txid?: string }>;
  statuses?: Record<string, { confirmed: boolean } | null>;
  utxos?: BitcoinEsploraUtxo[];
} = {}) => ({
  broadcastTransaction: vi.fn(broadcast ?? (async (txHex: string) => bitcoin.Transaction.fromHex(txHex).getId())),
  getAddress: vi.fn(async (address: string) => addressStats(address)),
  getFeeEstimates: vi.fn(async () => ({ 1: 4, 2: 3 })),
  getOutspend: vi.fn(async (txid: string, vout: number) => outspends[`${txid}:${vout}`] ?? { spent: false }),
  getTransactionStatus: vi.fn(async (txid: string) => statuses[txid] ?? null),
  getUtxos: vi.fn(async (address: string) => (address === mainnetAddress ? utxos : [])),
});

const params = (state = createState(), overrides: Record<string, unknown> = {}) => ({
  amount: '0.0005',
  callback: vi.fn(),
  from: 'stored-account',
  networkKey: 'Bitcoin',
  state,
  to: recipient,
  ...overrides,
});

const discovery = { gapLimit: 2, maxLookahead: 20 };

const pendingRecord = (overrides: Partial<BitcoinPendingSend> = {}): BitcoinPendingSend => ({
  accountAddress: 'stored-account',
  amountSat: 1,
  createdAt: 1,
  network: 'mainnet',
  outpoints: [{ txid: '22'.repeat(32), vout: 1 }],
  recipient,
  txHex: '00',
  txid: 'aa'.repeat(32),
  ...overrides,
});

const inputsOf = (tx: bitcoin.Transaction) =>
  tx.ins.map(({ hash, index }) => `${Buffer.from(hash).reverse().toString('hex')}:${index}`);

beforeEach(() => {
  process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = 'true';
});

afterEach(() => {
  if (originalBitcoinFlag === undefined) delete process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS;
  else process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS = originalBitcoinFlag;
});

describe('Bitcoin fee bounds', () => {
  it('raises a below-relay estimate to 1 sat/vB and caps an inflated one at 1,000 sat/vB', () => {
    expect(selectBitcoinFeeRateSatPerVbyte({ 2: 0.4 })).toBe(1);
    expect(selectBitcoinFeeRateSatPerVbyte({ 2: 3.016 })).toBe(3.016);
    expect(selectBitcoinFeeRateSatPerVbyte({ 2: 5_000 })).toBe(BITCOIN_MAX_FEE_RATE_SAT_PER_VBYTE);
    expect(() => selectBitcoinFeeRateSatPerVbyte({ 2: 10_001 })).toThrow('invalid_fee_rate');
  });

  it('refuses a caller-supplied fee rate outside the bounds', async () => {
    const base = {
      amountSat: 50_000,
      client: transferClient(),
      mnemonicOrSeed: mnemonic,
      sources: [{ address: mainnetAddress }],
      toAddress: recipient,
    };

    await expect(prepareBitcoinSend({ ...base, feeRateSatPerVbyte: 0.5 })).rejects.toMatchObject({ code: 'invalid_fee_rate' });
    await expect(prepareBitcoinSend({ ...base, feeRateSatPerVbyte: 1_001 })).rejects.toMatchObject({
      code: 'invalid_fee_rate',
    });
  });
});

describe('Bitcoin coin selection', () => {
  it('skips coins that cost more to spend than they hold', async () => {
    const client = transferClient({ utxos: [utxo(600, '33'.repeat(32)), utxo(80_000, '44'.repeat(32))] });
    const prepared = await prepareBitcoinSend({
      amountSat: 79_000,
      client,
      feeRateSatPerVbyte: 10,
      mnemonicOrSeed: mnemonic,
      sources: [{ address: mainnetAddress }],
      toAddress: recipient,
    }).catch((error) => error);

    // 600 sat is below the 680-sat cost of spending it at 10 sat/vB, so only the
    // 80,000-sat coin is usable and it cannot cover 79,000 plus the fee.
    expect(prepared).toMatchObject({ code: 'insufficient_funds' });
  });

  it('pays any recipient type with change back to the wallet change address', async () => {
    const changeAddress = vectors.vectors[0].expected.bitcoin.mainnet.firstReceiveAddress;

    for (const toAddress of [recipient, taprootRecipient, legacyRecipient]) {
      const prepared = await prepareBitcoinSend({
        amountSat: 50_000,
        changeAddress,
        client: transferClient(),
        feeRateSatPerVbyte: 2,
        mnemonicOrSeed: mnemonic,
        sources: [{ address: mainnetAddress }],
        toAddress,
      });
      const tx = bitcoin.Transaction.fromHex(prepared.txHex);

      expect(tx.outs.map(({ value }) => value)).toEqual([50_000, prepared.change]);
      expect(prepared.inputTotal).toBe(50_000 + prepared.change + prepared.fee);
      expect(prepared.fee).toBe(Math.ceil(estimateBitcoinTransactionVSize(1, [prepared.recipientType, 'p2wpkh']) * 2));
    }
  });

  it('sends exactly the quoted maximum with no change and no leftover', async () => {
    const client = transferClient();
    const quote = await quoteBitcoinSend({
      client,
      feeRateSatPerVbyte: 3,
      sources: [{ address: mainnetAddress }],
      toAddress: taprootRecipient,
    });
    const prepared = await prepareBitcoinSend({
      amountSat: quote.maxSendableSat,
      client,
      feeRateSatPerVbyte: 3,
      mnemonicOrSeed: mnemonic,
      sources: [{ address: mainnetAddress }],
      toAddress: taprootRecipient,
    });

    expect(quote.spendableSat).toBe(160_000);
    expect(prepared.change).toBe(0);
    expect(prepared.absorbedDustSat).toBe(0);
    expect(prepared.amountSat + prepared.fee).toBe(160_000);
    expect(bitcoin.Transaction.fromHex(prepared.txHex).outs).toHaveLength(1);
  });

  it('separates spendable, awaiting-confirmation and uneconomical coins', () => {
    const summary = summarizeBitcoinSpendable({
      feeRateSatPerVbyte: 5,
      recipientType: 'p2wpkh',
      utxos: [
        { confirmed: true, txid: '11'.repeat(32), value: 50_000, vout: 0 },
        { confirmed: false, txid: '22'.repeat(32), value: 20_000, vout: 0 },
        { confirmed: true, txid: '33'.repeat(32), value: 300, vout: 0 },
      ],
    });

    expect(summary).toEqual({
      awaitingConfirmationSat: 20_000,
      maxSendableSat: 50_000 - Math.ceil(estimateBitcoinTransactionVSize(1, ['p2wpkh']) * 5),
      spendableSat: 50_000,
      uneconomicalSat: 300,
    });
  });

  it('quotes the fee for an amount and explains when it cannot be covered', async () => {
    const client = transferClient();
    const covered = await quoteBitcoinSend({
      amountSat: 50_000,
      client,
      sources: [{ address: mainnetAddress }],
      toAddress: recipient,
    });
    const tooMuch = await quoteBitcoinSend({
      amountSat: 159_999,
      client,
      sources: [{ address: mainnetAddress }],
      toAddress: recipient,
    });

    expect(covered).toMatchObject({ feeRateSatPerVbyte: 3, feeSat: estimateBitcoinTransactionVSize(1, ['p2wpkh', 'p2wpkh']) * 3 });
    expect(covered.unavailableReason).toBeUndefined();
    expect(tooMuch.unavailableReason).toBe('insufficient_funds');
  });
});

describe('Bitcoin send kill switch', () => {
  it('honours a remote veto before touching keys or the indexer', async () => {
    const state = Object.assign(createState(), {
      sendKillSwitchService: { assertSendEnabled: vi.fn(async () => Promise.reject(new Error('bitcoin_transfer_disabled'))) },
    }) as unknown as State;
    const client = transferClient();

    await expect(makeBitcoinTransfer(params(state), client, discovery, memoryPendingStore())).rejects.toThrow(
      'bitcoin_transfer_disabled'
    );
    await expect(quoteBitcoinTransfer(params(state), client, discovery, memoryPendingStore())).rejects.toThrow(
      'bitcoin_transfer_disabled'
    );
    expect(state.keyringService.exportMnemonic).not.toHaveBeenCalled();
    expect(client.getAddress).not.toHaveBeenCalled();
  });
});

describe('Bitcoin ambiguous broadcast guard', () => {
  it('keeps the signed transaction when no endpoint confirmed the broadcast', async () => {
    const store = memoryPendingStore();
    const client = transferClient({
      broadcast: async () => {
        throw new BitcoinBroadcastError('bitcoin_broadcast_ambiguous', true);
      },
    });

    await expect(makeBitcoinTransfer(params(), client, discovery, store)).rejects.toThrow('bitcoin_broadcast_ambiguous');
    expect(store.records).toHaveLength(1);
    expect(store.records[0]).toMatchObject({ accountAddress: 'stored-account', amountSat: 50_000, network: 'mainnet' });
  });

  it('forgets a transaction every endpoint definitively rejected', async () => {
    const store = memoryPendingStore();
    const client = transferClient({
      broadcast: async () => {
        throw new BitcoinBroadcastError('bitcoin_broadcast_rejected', false, 'min relay fee not met');
      },
    });

    await expect(makeBitcoinTransfer(params(), client, discovery, store)).rejects.toThrow('bitcoin_broadcast_rejected');
    expect(store.records).toEqual([]);
  });

  it('makes a retry spend the same coins so the two transactions conflict', async () => {
    const store = memoryPendingStore();
    let attempt = 0;
    const broadcasts: string[] = [];
    const client = transferClient({
      broadcast: async (txHex) => {
        broadcasts.push(txHex);
        attempt += 1;
        if (attempt === 1) throw new BitcoinBroadcastError('bitcoin_broadcast_ambiguous', true);

        return bitcoin.Transaction.fromHex(txHex).getId();
      },
    });

    await expect(makeBitcoinTransfer(params(), client, discovery, store)).rejects.toThrow('bitcoin_broadcast_ambiguous');
    // The retry pays a different (smaller) amount; the largest coin would be
    // enough on its own, yet the earlier coin must be spent again.
    await makeBitcoinTransfer(params(createState(), { amount: '0.0001' }), client, discovery, store);

    const [first, second] = broadcasts.map((hex) => bitcoin.Transaction.fromHex(hex));

    expect(inputsOf(second)).toEqual(expect.arrayContaining(inputsOf(first)));
    expect(store.records).toEqual([]);
  });

  it('sends nothing new while the earlier transaction waits in the mempool', async () => {
    const store = memoryPendingStore([pendingRecord()]);
    // Esplora no longer lists a coin spent by a mempool transaction, so a new
    // transaction could not conflict with it.
    const client = transferClient({ statuses: { ['aa'.repeat(32)]: { confirmed: false } }, utxos: [utxo(100_000, '11'.repeat(32))] });

    await expect(makeBitcoinTransfer(params(), client, discovery, store)).rejects.toThrow('bitcoin_previous_send_unconfirmed');
    expect(client.broadcastTransaction).not.toHaveBeenCalled();
    expect(store.records).toHaveLength(1);
  });

  it('lets a new send proceed normally once the earlier transaction confirmed', async () => {
    const store = memoryPendingStore([pendingRecord()]);
    const client = transferClient({ statuses: { ['aa'.repeat(32)]: { confirmed: true } }, utxos: [utxo(100_000, '11'.repeat(32))] });

    await makeBitcoinTransfer(params(), client, discovery, store);

    const tx = bitcoin.Transaction.fromHex(client.broadcastTransaction.mock.calls[0][0]);

    expect(tx.ins).toHaveLength(1);
    expect(store.records).toEqual([]);
  });

  it('never pays twice when the retry follows the first transaction into the mempool', async () => {
    const store = memoryPendingStore();
    let utxos = [utxo(100_000, '11'.repeat(32)), utxo(100_000, '22'.repeat(32), 1)];
    const statuses: Record<string, { confirmed: boolean } | null> = {};
    const broadcasts: string[] = [];
    const client = transferClient({
      broadcast: async (txHex) => {
        broadcasts.push(txHex);
        // The first send reached an endpoint but every response was lost.
        if (broadcasts.length === 1) throw new BitcoinBroadcastError('bitcoin_broadcast_ambiguous', true);

        return bitcoin.Transaction.fromHex(txHex).getId();
      },
      statuses,
    });

    client.getUtxos.mockImplementation(async (address: string) => (address === mainnetAddress ? utxos : []));

    await expect(makeBitcoinTransfer(params(), client, discovery, store)).rejects.toThrow('bitcoin_broadcast_ambiguous');

    // The first transaction is now in the mempool: Esplora reports it and no
    // longer lists the coin it spends.
    const first = bitcoin.Transaction.fromHex(broadcasts[0]);

    statuses[first.getId()] = { confirmed: false };
    utxos = utxos.filter(({ txid, vout }) => !inputsOf(first).includes(`${txid}:${vout}`));

    await expect(makeBitcoinTransfer(params(), client, discovery, store)).rejects.toThrow('bitcoin_previous_send_unconfirmed');
    expect(broadcasts).toHaveLength(1);
    expect(store.records.map(({ txid }) => txid)).toEqual([first.getId()]);
  });

  it('refuses to build from other coins when a coin of an unresolved send is not listed', async () => {
    // Outcome unknown, yet the UTXO list (another endpoint's view, or a coin
    // already spent in the mempool) no longer contains the earlier coin.
    const store = memoryPendingStore([pendingRecord({ outpoints: [{ txid: '33'.repeat(32), vout: 0 }] })]);
    const client = transferClient();

    await expect(makeBitcoinTransfer(params(), client, discovery, store)).rejects.toThrow('bitcoin_previous_send_pending');
    expect(client.broadcastTransaction).not.toHaveBeenCalled();
    expect(store.records).toHaveLength(1);
  });

  it('keeps the guard when the indexer cannot be asked about the earlier send', async () => {
    const store = memoryPendingStore([pendingRecord({ outpoints: [{ txid: '33'.repeat(32), vout: 0 }] })]);
    const client = transferClient();

    client.getTransactionStatus.mockRejectedValue(new Error('bitcoin_indexer_http_429'));

    await expect(makeBitcoinTransfer(params(), client, discovery, store)).rejects.toThrow('bitcoin_previous_send_pending');
    expect(client.broadcastTransaction).not.toHaveBeenCalled();
    expect(store.records).toHaveLength(1);
  });

  it('spends an unconfirmed coin of an unresolved send again', async () => {
    const store = memoryPendingStore([pendingRecord({ outpoints: [{ txid: '33'.repeat(32), vout: 0 }] })]);
    const client = transferClient({ utxos: [utxo(100_000, '11'.repeat(32)), utxo(30_000, '33'.repeat(32), 0, false)] });

    await makeBitcoinTransfer(params(), client, discovery, store);

    const tx = bitcoin.Transaction.fromHex(client.broadcastTransaction.mock.calls[0][0]);

    expect(inputsOf(tx)).toContain(`${'33'.repeat(32)}:0`);
    expect(store.records).toEqual([]);
  });

  it('refuses coin control that leaves out a coin of an unresolved transaction', async () => {
    const store = memoryPendingStore([pendingRecord()]);

    await expect(
      makeBitcoinTransfer(
        params(createState(), { bitcoinSelectedOutpoints: [{ txid: '11'.repeat(32), vout: 0 }] }),
        transferClient(),
        discovery,
        store
      )
    ).rejects.toThrow('bitcoin_previous_send_pending');
  });

  it('reports a pending earlier send in the quote', async () => {
    const store = memoryPendingStore([pendingRecord({ amountSat: 40_000 })]);
    const quote = await quoteBitcoinTransfer(params(), transferClient(), discovery, store);

    expect(quote).toMatchObject({
      pendingPreviousSend: true,
      previousSend: { amount: '0.0004', inMempool: false, recipient, txid: 'aa'.repeat(32) },
      recipientType: 'p2wpkh',
      spendable: '0.0016',
    });
    expect(quote.unavailableReason).toBeUndefined();
  });

  it('quotes an earlier send waiting in the mempool as blocking, with its details', async () => {
    const store = memoryPendingStore([pendingRecord({ amountSat: 40_000 })]);
    const client = transferClient({ statuses: { ['aa'.repeat(32)]: { confirmed: false } }, utxos: [utxo(100_000, '11'.repeat(32))] });

    for (const amount of ['0', '0.0005']) {
      const quote = await quoteBitcoinTransfer(params(createState(), { amount }), client, discovery, store);

      expect(quote).toMatchObject({
        pendingPreviousSend: false,
        previousSend: { amount: '0.0004', inMempool: true, recipient, txid: 'aa'.repeat(32) },
        unavailableReason: 'bitcoin_previous_send_unconfirmed',
      });
    }
  });

  it('does not claim the coins are reused when one of them is not listed', async () => {
    const store = memoryPendingStore([pendingRecord({ outpoints: [{ txid: '33'.repeat(32), vout: 0 }] })]);

    for (const amount of ['0', '0.0005']) {
      const quote = await quoteBitcoinTransfer(params(createState(), { amount }), transferClient(), discovery, store);

      expect(quote).toMatchObject({ pendingPreviousSend: false, unavailableReason: 'bitcoin_previous_send_pending' });
    }
  });

  it('resolves pending sends only when the indexer proves the outcome', async () => {
    const record = (txid: string): BitcoinPendingSend => pendingRecord({ accountAddress: 'a', txid });
    const client = {
      getOutspend: vi.fn(async (): Promise<{ spent: boolean; txid?: string }> => ({ spent: false })),
      getTransactionStatus: vi.fn(async (txid: string) => {
        if (txid === 'aa'.repeat(32)) return { confirmed: true };
        if (txid === 'dd'.repeat(32)) return { confirmed: false };
        if (txid === 'cc'.repeat(32)) throw new Error('offline');

        return null;
      }),
    };
    const txids = (records: BitcoinPendingSend[]) => records.map(({ txid }) => txid);

    const { inMempool, resolved, unresolved } = await resolveBitcoinPendingSends(
      [record('aa'.repeat(32)), record('bb'.repeat(32)), record('cc'.repeat(32)), record('dd'.repeat(32))],
      client
    );

    expect(txids(resolved)).toEqual(['aa'.repeat(32)]);
    expect(txids(inMempool)).toEqual(['dd'.repeat(32)]);
    expect(txids(unresolved)).toEqual(['bb'.repeat(32), 'cc'.repeat(32)]);

    // A coin spent by a different transaction: this one can never confirm.
    client.getOutspend.mockResolvedValue({ spent: true, txid: 'ee'.repeat(32) });
    expect(txids((await resolveBitcoinPendingSends([record('bb'.repeat(32))], client)).resolved)).toEqual(['bb'.repeat(32)]);
    // A coin spent by this very transaction: it is in the mempool.
    client.getOutspend.mockResolvedValue({ spent: true, txid: 'bb'.repeat(32) });
    expect(txids((await resolveBitcoinPendingSends([record('bb'.repeat(32))], client)).inMempool)).toEqual(['bb'.repeat(32)]);
    // Spent, but the indexer does not say by what: still unknown.
    client.getOutspend.mockResolvedValue({ spent: true });
    expect(txids((await resolveBitcoinPendingSends([record('bb'.repeat(32))], client)).unresolved)).toEqual(['bb'.repeat(32)]);
  });

  it('persists pending sends through extension storage without losing concurrent writes', async () => {
    let stored: unknown = {};
    const backend = {
      get: vi.fn(async () => ({ bitcoinPendingSends: stored })),
      set: vi.fn(async (value: { bitcoinPendingSends?: unknown }) => {
        stored = value.bitcoinPendingSends;
      }),
    };
    const store = createStorageBitcoinPendingSendStore(backend as never);
    const record = (txid: string): BitcoinPendingSend => ({
      accountAddress: 'a',
      amountSat: 1,
      createdAt: 1,
      network: 'mainnet',
      outpoints: [{ txid: '11'.repeat(32), vout: 0 }],
      recipient,
      txHex: '00',
      txid,
    });

    expect(await store.list()).toEqual([]);
    await Promise.all([store.save(record('aa'.repeat(32))), store.save(record('bb'.repeat(32)))]);
    expect((await store.list()).map(({ txid }) => txid)).toEqual(['aa'.repeat(32), 'bb'.repeat(32)]);
    await store.remove(['aa'.repeat(32)]);
    expect((await store.list()).map(({ txid }) => txid)).toEqual(['bb'.repeat(32)]);
  });
});

describe('Esplora endpoint failover', () => {
  const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it('moves to the next indexer on throttling and honours Retry-After between rounds', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchFn = vi.fn(async (url: string | URL) => {
      if (url.toString().startsWith('https://a.example')) {
        return new Response('slow down', { headers: { 'retry-after': '2' }, status: 429 });
      }

      return fetchFn.mock.calls.length < 3 ? new Response('busy', { status: 503 }) : okJson({ 2: 3 });
    });
    const client = new BitcoinEsploraClient({
      baseUrls: ['https://a.example/api', 'https://b.example/api'],
      failover: { sleep },
      fetchFn,
    });

    await expect(client.getFeeEstimates()).resolves.toEqual({ 2: 3 });
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('does not fail over on a definite answer such as 400', async () => {
    const fetchFn = vi.fn(async () => new Response('bad address', { status: 400 }));
    const client = new BitcoinEsploraClient({ baseUrls: ['https://a.example/api', 'https://b.example/api'], fetchFn });

    await expect(client.getUtxos(mainnetAddress)).rejects.toMatchObject({ status: 400 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('uses blockstream.info and mempool.space for mainnet by default', () => {
    expect(new BitcoinEsploraClient().baseUrls).toEqual(['https://blockstream.info/api', 'https://mempool.space/api']);
    expect(new BitcoinEsploraClient({ network: 'testnet' }).baseUrls).toEqual([
      'https://blockstream.info/testnet/api',
      'https://mempool.space/testnet/api',
    ]);
  });

  it('classifies broadcast outcomes without ever calling a possibly-relayed transaction failed', async () => {
    const txid = 'ab'.repeat(32);
    const respond = (responses: Array<Response | Error>) => {
      let index = 0;

      return vi.fn(async () => {
        const next = responses[Math.min(index, responses.length - 1)];

        index += 1;
        if (next instanceof Error) throw next;

        return next;
      });
    };
    const clientWith = (fetchFn: ReturnType<typeof respond>) =>
      new BitcoinEsploraClient({ baseUrls: ['https://a.example/api', 'https://b.example/api'], fetchFn });

    // Timeout on the first indexer, accepted by the second: success.
    await expect(
      clientWith(respond([new TypeError('network'), new Response(txid)])).broadcastTransaction('00aa', txid)
    ).resolves.toBe(txid);
    // The second indexer already has it: success.
    await expect(
      clientWith(
        respond([new TypeError('network'), new Response('sendrawtransaction RPC error: txn-already-in-mempool', { status: 400 })])
      ).broadcastTransaction('00aa', txid)
    ).resolves.toBe(txid);
    // Both definitively reject: rejected, nothing relayed.
    await expect(
      clientWith(respond([new Response('min relay fee not met', { status: 400 })])).broadcastTransaction('00aa', txid)
    ).rejects.toMatchObject({ ambiguous: false, message: 'bitcoin_broadcast_rejected' });
    // One timed out, one rejected: the first may have relayed it, so ambiguous.
    await expect(
      clientWith(respond([new TypeError('network'), new Response('bad-txns-inputs-missingorspent', { status: 400 })])).broadcastTransaction(
        '00aa',
        txid
      )
    ).rejects.toMatchObject({ ambiguous: true, message: 'bitcoin_broadcast_ambiguous' });
  });
});
