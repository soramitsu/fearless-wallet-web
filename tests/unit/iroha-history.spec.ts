import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';

import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { HistoryElement } from '@/interfaces';
import { fetchHistory } from '@/history/fetchingHistory';
import { getFormattedHistory, getHistoryValue } from '@/helpers/history';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

vi.mock('@/extension/messaging', () => ({
  getHistory: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));

vi.mock('@/extension/messaging/price', () => ({
  getFiats: vi.fn(),
}));

const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../docs/universal-wallet-v2-vectors.json'), 'utf8')) as {
  vectors: Array<{
    expected: {
      iroha: {
        nexus: { i105: string };
        taira: { i105: string };
      };
    };
  }>;
};

const WALLET = fixture.vectors[0].expected.iroha.taira.i105;
const NEXUS_WALLET = fixture.vectors[0].expected.iroha.nexus.i105;
const COUNTERPARTY = fixture.vectors[1].expected.iroha.taira.i105;
const NEXUS_COUNTERPARTY = fixture.vectors[1].expected.iroha.nexus.i105;
const TAIRA_CHAIN_ID = 'fc56984b-2be7-431d-840e-21514d1883f0';
const NEXUS_CHAIN_ID = 'sora:nexus:global';
const TAIRA_XOR_ASSET_ID = '6TEAJqbb8oEPmLncoNiMRbLEK6tw';
const OTHER_ASSET_ID = '5HFTUK41MFWnFdeHo5XySHC7PQun';
const HASH_1 = '11'.repeat(32);
// Iroha marks canonical hashes by forcing the low bit, so the final nibble is odd.
const HASH_2 = `${'22'.repeat(31)}23`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    status,
  });
}

function tairaDefinitionResponse(scale: number | null = 9): Response {
  return jsonResponse({ id: TAIRA_XOR_ASSET_ID, name: 'XOR', spec: { scale } });
}

function movement(overrides: Record<string, unknown> = {}) {
  return {
    account_id: WALLET,
    amount: '1.25',
    asset_definition_id: TAIRA_XOR_ASSET_ID,
    asset_id: `${TAIRA_XOR_ASSET_ID}#${WALLET}`,
    block_height: 12,
    block_index: 0,
    counterparty_account_id: COUNTERPARTY,
    direction: 'outgoing',
    id: `${HASH_1}:${WALLET}:0`,
    movement_index: 0,
    result_ok: true,
    source: 'transaction',
    status: 'SUCCESS',
    timestamp_ms: 1782259200000,
    tx_hash: HASH_1,
    type: 'TRANSFER',
    ...overrides,
  };
}

function historyRouter(pages: Array<{ items: unknown[]; next_cursor?: string | null }>) {
  const historyRequests: URL[] = [];
  const queue = [...pages];
  const fetchFn = vi.fn(async (input: string | URL) => {
    const url = new URL(input.toString());

    if (url.pathname.startsWith('/v1/assets/definitions/')) return tairaDefinitionResponse();

    historyRequests.push(url);

    const page = queue.shift() ?? { items: [] };

    return jsonResponse({ next_cursor: null, ...page });
  });

  return { fetchFn, historyRequests };
}

function fetchTairaHistory() {
  return fetchHistory(
    'https://taira.sora.org',
    WALLET,
    'iroha',
    'Taira Testnet',
    TAIRA_XOR_ASSET_ID,
    true,
    undefined,
    TAIRA_CHAIN_ID
  );
}

describe('Iroha history fetching', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
      get length() {
        return values.size;
      },
    });
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes Taira account movements read directly from Torii', async () => {
    const { fetchFn, historyRequests } = historyRouter([
      {
        items: [
          movement(),
          movement({
            amount: '4.56',
            direction: 'incoming',
            id: `${HASH_2}:${WALLET}:1`,
            movement_index: 1,
            timestamp_ms: 1719187200999,
            tx_hash: HASH_2,
          }),
        ],
      },
    ]);
    vi.stubGlobal('fetch', fetchFn);

    const result = await fetchTairaHistory();

    expect(fetchFn).toHaveBeenCalledWith(
      `https://taira.sora.org/v1/assets/definitions/${TAIRA_XOR_ASSET_ID}`,
      expect.objectContaining({ method: 'GET' })
    );
    expect(historyRequests).toHaveLength(1);
    expect(decodeURIComponent(historyRequests[0].pathname)).toBe(`/v1/accounts/${WALLET}/history`);
    expect(historyRequests[0].searchParams.get('filter')).toBe(
      `asset_definition_id = "${TAIRA_XOR_ASSET_ID}" and type = "TRANSFER"`
    );
    expect(historyRequests[0].searchParams.get('limit')).toBe('100');
    expect(fetchFn.mock.calls.every(([input]) => !input.toString().includes('/v1/mcp'))).toBe(true);
    expect(result).toEqual([
      {
        address: WALLET,
        blockHash: HASH_1,
        blockHeight: 12,
        extrinsicHash: HASH_1,
        id: `${HASH_1}:outgoing:0`,
        success: true,
        timestamp: '1782259200',
        transfer: { amount: '1250000000', fee: null, from: WALLET, to: COUNTERPARTY },
      },
      {
        address: WALLET,
        blockHash: HASH_2,
        blockHeight: 12,
        extrinsicHash: HASH_2,
        id: `${HASH_2}:incoming:1`,
        success: true,
        timestamp: '1719187200',
        transfer: { amount: '4560000000', fee: null, from: COUNTERPARTY, to: WALLET },
      },
    ]);

    useAccountsStore().balances = [
      {
        groupId: TAIRA_XOR_ASSET_ID,
        symbol: 'XOR',
        balances: [{ id: TAIRA_XOR_ASSET_ID, name: 'Taira Testnet', precision: 9, symbol: 'XOR' }],
      } as unknown as TokenGroup,
    ];
    useNetworksStore().allNetworks = [
      {
        name: 'Taira Testnet',
        chainId: TAIRA_CHAIN_ID,
        externalApi: { history: { type: 'iroha', url: 'https://taira.sora.org' } },
        assets: [],
      } as unknown as NetworkJson,
    ];
    const [firstHistoryElement] = result as HistoryElement[];

    expect(getHistoryValue(firstHistoryElement, TAIRA_XOR_ASSET_ID, 'Taira Testnet', WALLET, true)).toEqual({
      signTransfer: '-',
      value: 1.25,
    });
  });

  it('follows Torii cursors and stops at the page bound with the newest movements', async () => {
    const pages = Array.from({ length: 12 }, (_, page) => ({
      items: [
        movement({
          id: `${HASH_1}:${WALLET}:${page}`,
          movement_index: page,
        }),
      ],
      next_cursor: `page-${page + 1}`,
    }));
    const { fetchFn, historyRequests } = historyRouter(pages);
    vi.stubGlobal('fetch', fetchFn);

    const result = (await fetchTairaHistory()) as HistoryElement[];

    expect(historyRequests).toHaveLength(10);
    expect(historyRequests[0].searchParams.get('cursor')).toBeNull();
    expect(historyRequests[1].searchParams.get('cursor')).toBe('page-1');
    expect(result.map(({ id }) => id)).toEqual(Array.from({ length: 10 }, (_, index) => `${HASH_1}:outgoing:${index}`));
  });

  it('marks failed movements unsuccessful and ignores non-transfer or foreign-asset rows', async () => {
    const { fetchFn } = historyRouter([
      {
        items: [
          movement({ result_ok: false, status: 'FAILED' }),
          movement({ id: 'mint', movement_index: 1, type: 'MINT' }),
          movement({ asset_definition_id: OTHER_ASSET_ID, movement_index: 2 }),
          {
            account_id: WALLET,
            block_height: 58,
            direction: 'affected',
            id: `${HASH_2}:${WALLET}:0`,
            movement_index: 0,
            result_ok: true,
            source: 'transaction',
            status: 'SUCCESS',
            timestamp_ms: 1792679154784,
            tx_hash: HASH_2,
            type: 'RAW_ON_CHAIN',
          },
        ],
      },
    ]);
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchTairaHistory()).resolves.toEqual([
      expect.objectContaining({ id: `${HASH_1}:outgoing:0`, success: false }),
    ]);
  });

  it('converts very large exact Torii decimals to base units without rounding', async () => {
    const { fetchFn } = historyRouter([{ items: [movement({ amount: '340282366920938463463.374607431' })] }]);
    vi.stubGlobal('fetch', fetchFn);

    const [element] = (await fetchTairaHistory()) as HistoryElement[];

    expect(element.transfer?.amount).toBe('340282366920938463463374607431');
  });

  it.each([
    ['a missing field', (item: Record<string, unknown>) => delete item.tx_hash],
    ['another account', (item: Record<string, unknown>) => (item.account_id = COUNTERPARTY)],
    ['a Nexus counterparty', (item: Record<string, unknown>) => (item.counterparty_account_id = NEXUS_COUNTERPARTY)],
    ['an unknown direction', (item: Record<string, unknown>) => (item.direction = 'sideways')],
    ['an uppercase hash', (item: Record<string, unknown>) => (item.tx_hash = `${'AB'.repeat(31)}A1`)],
    ['an unmarked hash', (item: Record<string, unknown>) => (item.tx_hash = `${'ab'.repeat(31)}a0`)],
    ['more decimals than the asset scale', (item: Record<string, unknown>) => (item.amount = '1.0000000001')],
    ['a noncanonical quantity', (item: Record<string, unknown>) => (item.amount = '1.50')],
    ['a zero block height', (item: Record<string, unknown>) => (item.block_height = 0)],
    ['a string result flag', (item: Record<string, unknown>) => (item.result_ok = 'true')],
    ['a negative timestamp', (item: Record<string, unknown>) => (item.timestamp_ms = -1)],
  ])('fails the whole history closed on %s', async (_label, mutate) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const item = movement() as Record<string, unknown>;

    mutate(item);

    const { fetchFn } = historyRouter([{ items: [item] }]);
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchTairaHistory()).resolves.toBeUndefined();
    info.mockRestore();
  });

  it('rejects duplicated movements across pages', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { fetchFn } = historyRouter([
      { items: [movement()], next_cursor: 'page-2' },
      { items: [movement()] },
    ]);
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchTairaHistory()).resolves.toBeUndefined();
    info.mockRestore();
  });

  it('rejects a null canonical Taira XOR scale before querying movements', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchFn = vi.fn(async (_input: RequestInfo | URL) => tairaDefinitionResponse(null));
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchTairaHistory()).resolves.toBeUndefined();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0].toString()).toBe(
      `https://taira.sora.org/v1/assets/definitions/${TAIRA_XOR_ASSET_ID}`
    );
    info.mockRestore();
  });

  it('uses Minamoto for an exact Nexus chain id and fails closed when definitions are unavailable', async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL) => {
      throw new Error('minamoto_unavailable');
    });
    vi.stubGlobal('fetch', fetchFn);

    await expect(
      fetchHistory('', NEXUS_WALLET, 'iroha', 'SORA Nexus', 'xor#sora', true, undefined, NEXUS_CHAIN_ID)
    ).resolves.toBeUndefined();
    expect(fetchFn.mock.calls[0]?.[0].toString()).toContain('https://minamoto.sora.org/v1/assets/definitions/');
  });

  it('rejects ambiguous Iroha networks before issuing a request', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);

    await expect(
      fetchHistory('https://taira.sora.org', WALLET, 'iroha', 'Taira Testnet', TAIRA_XOR_ASSET_ID, true)
    ).resolves.toBeUndefined();
    expect(fetchFn).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it('formats Iroha history arrays for store pagination shape', () => {
    const formatted = getFormattedHistory(
      [
        {
          address: WALLET,
          id: HASH_1,
          success: true,
          timestamp: '1719187200',
          transfer: {
            amount: '1',
            fee: '0',
            from: '',
            to: WALLET,
          },
        },
      ],
      'iroha'
    );

    expect(formatted).toMatchObject({
      nodes: [expect.objectContaining({ id: HASH_1 })],
      pageInfo: { endCursor: '', startCursor: '' },
    });
  });
});
