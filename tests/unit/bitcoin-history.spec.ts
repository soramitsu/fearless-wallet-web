import type { HistoryElement } from '@/interfaces';
import { fetchHistory } from '@/history/fetchingHistory';
import { getFormattedHistory } from '@/helpers/history';

vi.mock('@/extension/messaging', () => ({
  getHistory: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));

vi.mock('@/extension/messaging/price', () => ({
  getFiats: vi.fn(),
}));

const WALLET = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const TESTNET_WALLET = 'tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl';
const COUNTERPARTY = 'bc1q6rz28mcfaxtmd6v789l9rrlrusdprr9pkv76kj';
const TXID_1 = '11'.repeat(32);
const TXID_2 = '22'.repeat(32);
const TXID_3 = '33'.repeat(32);
const BLOCK_HASH = 'aa'.repeat(32);
const ESPLORA_PAGE_SIZE = 25;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function bitcoinTx(overrides: Record<string, unknown> = {}) {
  return {
    fee: 141,
    locktime: 0,
    size: 140,
    status: {
      block_hash: BLOCK_HASH,
      block_height: 100,
      block_time: 1_710_000_000,
      confirmed: true,
    },
    txid: TXID_1,
    version: 2,
    vin: [],
    vout: [],
    weight: 561,
    ...overrides,
  };
}

function txidAt(index: number): string {
  return index.toString(16).padStart(64, '0');
}

function outgoingBitcoinTx(index: number) {
  return bitcoinTx({
    txid: txidAt(index),
    vin: [{ prevout: { scriptpubkey_address: WALLET, value: 100_000 } }],
    vout: [
      { scriptpubkey_address: COUNTERPARTY, value: 60_000 },
      { scriptpubkey_address: WALLET, value: 39_859 },
    ],
  });
}

function asBitcoinHistory(history: Awaited<ReturnType<typeof fetchHistory>>): HistoryElement[] {
  return history as HistoryElement[];
}

describe('Bitcoin history fetching', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes outgoing and incoming BTC transactions from Esplora', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse([
        bitcoinTx({
          vin: [{ prevout: { scriptpubkey_address: WALLET, value: 100_000 } }],
          vout: [
            { scriptpubkey_address: COUNTERPARTY, value: 60_000 },
            { scriptpubkey_address: WALLET, value: 39_859 },
          ],
        }),
        bitcoinTx({
          fee: 200,
          status: { confirmed: false },
          txid: TXID_2,
          vin: [{ prevout: { scriptpubkey_address: COUNTERPARTY, value: 75_200 } }],
          vout: [{ scriptpubkey_address: WALLET, value: 75_000 }],
        }),
        bitcoinTx({
          txid: TXID_3,
          vin: [{ prevout: { scriptpubkey_address: COUNTERPARTY, value: 10_000 } }],
          vout: [{ scriptpubkey_address: COUNTERPARTY, value: 9_900 }],
        }),
      ])
    );
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchHistory('https://blockstream.info/api', WALLET, 'bitcoin', 'Bitcoin', 'BTC', true)).resolves.toEqual([
      {
        address: WALLET,
        blockHash: BLOCK_HASH,
        blockHeight: 100,
        extrinsicHash: TXID_1,
        id: TXID_1,
        success: true,
        timestamp: '1710000000',
        transfer: {
          amount: '60000',
          fee: '141',
          from: WALLET,
          to: COUNTERPARTY,
        },
      },
      {
        address: WALLET,
        blockHash: TXID_2,
        blockHeight: undefined,
        extrinsicHash: TXID_2,
        id: TXID_2,
        success: true,
        timestamp: '0',
        transfer: {
          amount: '75000',
          fee: '0',
          from: COUNTERPARTY,
          to: WALLET,
        },
      },
    ]);
    expect(fetchFn).toHaveBeenCalledWith(`https://blockstream.info/api/address/${WALLET}/txs`);
  });

  it('filters non-native assets and malformed no-movement transactions', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse([
        bitcoinTx({
          vin: [{ prevout: { scriptpubkey_address: WALLET, value: '1000' } }],
          vout: [{ scriptpubkey_address: WALLET, value: '900' }],
        }),
        bitcoinTx({
          txid: TXID_2,
          vin: [{ prevout: { scriptpubkey_address: WALLET, value: 1000 } }],
          vout: [{ scriptpubkey_address: WALLET, value: 859 }],
        }),
      ])
    );
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchHistory('https://blockstream.info/api', WALLET, 'bitcoin', 'Bitcoin', 'USDC', false)).resolves.toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();

    await expect(fetchHistory('https://blockstream.info/api', WALLET, 'bitcoin', 'Bitcoin', 'BTC', true)).resolves.toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('uses testnet validation and rejects wrong-network addresses before fetch', async () => {
    const fetchFn = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal('fetch', fetchFn);

    await expect(
      fetchHistory('https://blockstream.info/testnet/api', TESTNET_WALLET, 'bitcoin', 'Bitcoin Testnet', 'BTC', true)
    ).resolves.toEqual([]);
    expect(fetchFn).toHaveBeenCalledWith(`https://blockstream.info/testnet/api/address/${TESTNET_WALLET}/txs`);

    fetchFn.mockClear();

    await expect(
      fetchHistory('https://blockstream.info/testnet/api', WALLET, 'bitcoin', 'Bitcoin Testnet', 'BTC', true)
    ).resolves.toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches Bitcoin history pages until Esplora returns a short page', async () => {
    const firstPage = Array.from({ length: ESPLORA_PAGE_SIZE }, (_, index) => outgoingBitcoinTx(index + 1));
    const secondPage = [outgoingBitcoinTx(26), outgoingBitcoinTx(27)];
    const fetchFn = vi.fn(async (input: string | URL) => {
      const url = input.toString();

      if (url.endsWith(`/address/${WALLET}/txs`)) return jsonResponse(firstPage);
      if (url.endsWith(`/address/${WALLET}/txs/chain/${txidAt(25)}`)) return jsonResponse(secondPage);

      return jsonResponse([], 404);
    });
    vi.stubGlobal('fetch', fetchFn);

    const history = asBitcoinHistory(
      await fetchHistory('https://blockstream.info/api', WALLET, 'bitcoin', 'Bitcoin', 'BTC', true)
    );

    expect(history).toHaveLength(27);
    expect(history.map(({ id }) => id)).toEqual(Array.from({ length: 27 }, (_, index) => txidAt(index + 1)));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenNthCalledWith(1, `https://blockstream.info/api/address/${WALLET}/txs`);
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      `https://blockstream.info/api/address/${WALLET}/txs/chain/${txidAt(25)}`
    );
  });

  it('deduplicates repeated Bitcoin history pages and stops on a duplicate cursor', async () => {
    const repeatedPage = Array.from({ length: ESPLORA_PAGE_SIZE }, (_, index) => outgoingBitcoinTx(index + 1));
    const fetchFn = vi.fn(async () => jsonResponse(repeatedPage));
    vi.stubGlobal('fetch', fetchFn);

    const history = asBitcoinHistory(
      await fetchHistory('https://blockstream.info/api', WALLET, 'bitcoin', 'Bitcoin', 'BTC', true)
    );

    expect(history).toHaveLength(25);
    expect(history.map(({ id }) => id)).toEqual(Array.from({ length: 25 }, (_, index) => txidAt(index + 1)));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenNthCalledWith(2, `https://blockstream.info/api/address/${WALLET}/txs/chain/${txidAt(25)}`);
  });

  it('caps Bitcoin history pagination when every page is full', async () => {
    const fetchFn = vi.fn(async () => {
      const offset = (fetchFn.mock.calls.length - 1) * ESPLORA_PAGE_SIZE;

      return jsonResponse(
        Array.from({ length: ESPLORA_PAGE_SIZE }, (_, index) => outgoingBitcoinTx(offset + index + 1))
      );
    });
    vi.stubGlobal('fetch', fetchFn);

    const history = asBitcoinHistory(
      await fetchHistory('https://blockstream.info/api', WALLET, 'bitcoin', 'Bitcoin', 'BTC', true)
    );

    expect(history).toHaveLength(300);
    expect(history[0]?.id).toBe(txidAt(1));
    expect(history[history.length - 1]?.id).toBe(txidAt(300));
    expect(fetchFn).toHaveBeenCalledTimes(12);
    expect(fetchFn).toHaveBeenNthCalledWith(
      12,
      `https://blockstream.info/api/address/${WALLET}/txs/chain/${txidAt(275)}`
    );
  });

  it('returns undefined on Bitcoin indexer outage so cached history can be preserved', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchFn = vi.fn(async () => jsonResponse({ error: 'unavailable' }, 503));
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchHistory('https://blockstream.info/api', WALLET, 'bitcoin', 'Bitcoin', 'BTC', true)).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledWith(`https://blockstream.info/api/address/${WALLET}/txs`);

    info.mockRestore();
  });

  it('formats Bitcoin history arrays for store pagination shape', () => {
    const formatted = getFormattedHistory(
      [
        {
          address: WALLET,
          id: TXID_1,
          success: true,
          timestamp: '1710000000',
          transfer: {
            amount: '1',
            fee: '0',
            from: '',
            to: WALLET,
          },
        },
      ],
      'bitcoin'
    );

    expect(formatted).toMatchObject({
      nodes: [expect.objectContaining({ id: TXID_1 })],
      pageInfo: { endCursor: '', startCursor: '' },
    });
  });
});
