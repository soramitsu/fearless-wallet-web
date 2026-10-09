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
const TAIRA_CHAIN_ID = 'fc56984b-2be7-431d-840e-21514d1883f0';
const NEXUS_CHAIN_ID = 'sora:nexus:global';
const TAIRA_XOR_ASSET_ID = '6TEAJqbb8oEPmLncoNiMRbLEK6tw';
const HASH_1 = '11'.repeat(32);
// Iroha marks canonical hashes by forcing the low bit, so the final nibble is odd.
const HASH_2 = `${'22'.repeat(31)}23`;
const COMPLETE_FANOUT_HEADERS = {
  'x-iroha-fanout-routes-attempted': '1',
  'x-iroha-fanout-routes-succeeded': '1',
  'x-iroha-fanout-routes-failed': '0',
  'x-iroha-fanout-routes-denied': '0',
  'x-iroha-fanout-routes-unavailable': '0',
  'x-iroha-fanout-routes-not-found': '0',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...COMPLETE_FANOUT_HEADERS },
    status,
  });
}

function rpcResult(result: unknown, id: number | string = 1): Response {
  if (typeof result === 'object' && result !== null) {
    const structuredContent = (result as { structuredContent?: unknown }).structuredContent;

    if (typeof structuredContent === 'object' && structuredContent !== null) {
      const body = (structuredContent as { body?: unknown }).body;

      if (typeof body === 'object' && body !== null) {
        const page = body as { items?: unknown; pagination?: unknown };

        if (Array.isArray(page.items) && page.pagination === undefined) {
          page.pagination = {
            page: 1,
            per_page: 100,
            total_pages: page.items.length === 0 ? 0 : 1,
            total_items: page.items.length,
          };
        }
      }
    }
  }

  return jsonResponse({
    jsonrpc: '2.0',
    id,
    result,
  });
}

function tairaDefinitionResponse(scale: number | null = 9): Response {
  return jsonResponse({
    id: TAIRA_XOR_ASSET_ID,
    name: 'XOR',
    spec: { scale },
  });
}

function instruction(overrides: Record<string, unknown> = {}) {
  const defaultPayload = {
    value: {
      destination: COUNTERPARTY,
      object: '1.25',
      source: `${TAIRA_XOR_ASSET_ID}#${WALLET}`,
    },
    variant: 'Asset',
  };
  const requestedBox = overrides['box'];
  const requestedJson =
    typeof requestedBox === 'object' && requestedBox !== null
      ? (requestedBox as { json?: unknown }).json
      : undefined;
  const requestedPayload =
    typeof requestedJson === 'object' && requestedJson !== null
      ? (requestedJson as { payload?: unknown }).payload
      : undefined;
  const payload = requestedPayload ?? defaultPayload;
  const variant =
    typeof payload === 'object' && payload !== null ? (payload as { variant?: unknown }).variant : undefined;
  const box =
    requestedBox === undefined
      ? {
          encoded: '0x00',
          framed_sha256: `0x${'00'.repeat(32)}`,
          json: {
            kind: 'Transfer',
            payload,
            wire_id: 'iroha.transfer',
            encoded: '00',
          },
        }
      : requestedPayload === undefined
        ? requestedBox
        : {
            encoded: '0x00',
            framed_sha256: `0x${'00'.repeat(32)}`,
            ...(requestedBox as Record<string, unknown>),
            json: {
              kind: 'Transfer',
              wire_id: variant === 'AssetBatch' ? 'iroha.transfer_batch' : 'iroha.transfer',
              encoded: '00',
              ...(requestedJson as Record<string, unknown>),
              payload,
            },
          };

  return {
    authority: WALLET,
    block: 12,
    created_at: '2026-06-24T00:00:00Z',
    index: 0,
    kind: 'Transfer',
    transaction_hash: HASH_1,
    transaction_status: 'Committed',
    ...overrides,
    'box': box,
  };
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

  it('normalizes committed Iroha asset transfer instructions from Torii MCP', async () => {
    const requests: unknown[] = [];
    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

      const request = JSON.parse(init?.body as string);

      requests.push(request);

      return rpcResult({
        isError: false,
        structuredContent: {
          body: {
            items: [
              instruction(),
              instruction({
                'box': {
                  json: {
                    payload: {
                      value: {
                        destination: WALLET,
                        object: '4.56',
                        source: `${TAIRA_XOR_ASSET_ID}#${COUNTERPARTY}`,
                      },
                      variant: 'Asset',
                    },
                  },
                },
                created_at: '2024-06-24T00:00:00Z',
                transaction_hash: HASH_2,
              }),
            ],
          },
          content_type: 'application/json',
          headers: COMPLETE_FANOUT_HEADERS,
          status: 200,
        },
      });
    });
    vi.stubGlobal('fetch', fetchFn);

    const result = await fetchHistory(
      'https://taira.sora.org',
      WALLET,
      'iroha',
      'Taira Testnet',
      TAIRA_XOR_ASSET_ID,
      true,
      undefined,
      TAIRA_CHAIN_ID
    );

    expect(fetchFn).toHaveBeenCalledWith('https://taira.sora.org/v1/mcp', expect.objectContaining({ method: 'POST' }));
    expect(fetchFn).toHaveBeenCalledWith(
      `https://taira.sora.org/v1/assets/definitions/${TAIRA_XOR_ASSET_ID}`,
      expect.objectContaining({ method: 'GET' })
    );
    expect(requests[0]).toMatchObject({
      method: 'tools/call',
      params: {
        name: 'iroha.instructions.list',
        arguments: {
          account: WALLET,
          accept: 'application/json',
          asset_id: TAIRA_XOR_ASSET_ID,
          kind: 'Transfer',
          page: 1,
          per_page: 100,
          transaction_status: 'committed',
        },
      },
    });
    expect(result).toEqual([
      {
        address: WALLET,
        blockHash: HASH_1,
        blockHeight: 12,
        extrinsicHash: HASH_1,
        id: `${HASH_1}:0`,
        success: true,
        timestamp: '1782259200',
        transfer: {
          amount: '1250000000',
          fee: null,
          from: WALLET,
          to: COUNTERPARTY,
        },
      },
      {
        address: WALLET,
        blockHash: HASH_2,
        blockHeight: 12,
        extrinsicHash: HASH_2,
        id: `${HASH_2}:0`,
        success: true,
        timestamp: '1719187200',
        transfer: {
          amount: '4560000000',
          fee: null,
          from: COUNTERPARTY,
          to: WALLET,
        },
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

  it('parses the canonical Torii AssetBatch shape', async () => {
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

      return rpcResult({
        isError: false,
        structuredContent: {
          status: 200,
          headers: COMPLETE_FANOUT_HEADERS,
          content_type: 'application/json',
          body: {
            items: [
              instruction({
                'box': {
                  json: {
                    payload: {
                      variant: 'AssetBatch',
                      value: {
                        mode: { mode: 'Atomic', value: null },
                        entries: [
                          {
                            leg_id: 'outgoing',
                            from: WALLET,
                            to: COUNTERPARTY,
                            asset_definition: TAIRA_XOR_ASSET_ID,
                            amount: '2.5',
                          },
                          {
                            leg_id: 'incoming',
                            from: COUNTERPARTY,
                            to: WALLET,
                            asset_definition: TAIRA_XOR_ASSET_ID,
                            amount: '3.75',
                          },
                        ],
                      },
                    },
                  },
                },
              }),
            ],
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetchFn);

    const result = await fetchHistory(
      'https://taira.sora.org',
      WALLET,
      'iroha',
      'Taira Testnet',
      TAIRA_XOR_ASSET_ID,
      true,
      undefined,
      TAIRA_CHAIN_ID
    );

    expect((result as HistoryElement[]).map((item) => item.transfer)).toEqual([
      { amount: '2500000000', fee: null, from: WALLET, to: COUNTERPARTY },
      { amount: '3750000000', fee: null, from: COUNTERPARTY, to: WALLET },
    ]);
  });

  it('rejects alias-only and conflicting transfer payload fields', async () => {
    const canonicalSingle = {
      source: `${TAIRA_XOR_ASSET_ID}#${WALLET}`,
      destination: COUNTERPARTY,
      object: '1.25',
    };
    const canonicalBatchEntry = {
      leg_id: 'leg',
      from: WALLET,
      to: COUNTERPARTY,
      asset_definition: TAIRA_XOR_ASSET_ID,
      amount: '1.25',
    };
    const payloads = [
      { variant: 'Asset', value: { ...canonicalSingle, source: undefined, source_id: canonicalSingle.source } },
      { variant: 'Asset', value: { ...canonicalSingle, source_id: canonicalSingle.source } },
      { variant: 'Asset', value: { ...canonicalSingle, destination: undefined, to: COUNTERPARTY } },
      { variant: 'Asset', value: { ...canonicalSingle, object: undefined, amount: '1.25' } },
      {
        variant: 'AssetBatch',
        value: { mode: { mode: 'Atomic', value: null }, transfers: [canonicalBatchEntry] },
      },
      {
        variant: 'AssetBatch',
        value: { mode: { mode: 'Atomic', value: null }, entries: [canonicalSingle] },
      },
      {
        variant: 'AssetBatch',
        value: {
          mode: { mode: 'Atomic', value: null },
          entries: [{ ...canonicalBatchEntry, leg_id: undefined }],
        },
      },
      {
        variant: 'AssetBatch',
        value: {
          mode: { mode: 'Atomic', value: null },
          entries: [{ ...canonicalBatchEntry, unexpected: true }],
        },
      },
      {
        variant: 'AssetBatch',
        value: {
          mode: { mode: 'Atomic', value: null },
          entries: [{ ...canonicalBatchEntry, asset_id: TAIRA_XOR_ASSET_ID }],
        },
      },
      { variant: 'AssetBatch', value: { mode: 'Atomic', entries: [canonicalBatchEntry] } },
      {
        variant: 'AssetBatch',
        value: { mode: { mode: 'Independent', value: null }, entries: [canonicalBatchEntry] },
      },
      {
        variant: 'AssetBatch',
        value: { mode: { mode: 'Atomic', value: {} }, entries: [canonicalBatchEntry] },
      },
      {
        variant: 'AssetBatch',
        value: { mode: { mode: 'Atomic' }, entries: [canonicalBatchEntry] },
      },
      {
        variant: 'AssetBatch',
        value: { mode: { mode: 'Atomic', value: null, unexpected: true }, entries: [canonicalBatchEntry] },
      },
      {
        variant: 'AssetBatch',
        value: {
          mode: { mode: 'Atomic', value: null },
          entries: [{ ...canonicalBatchEntry, leg_id: 'é'.repeat(129) }],
        },
      },
      { variant: 'Asset', value: { ...canonicalSingle, unexpected: true } },
    ];

    for (const payload of payloads) {
      const fetchFn = vi.fn(async (input: string | URL) => {
        if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

        return rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: COMPLETE_FANOUT_HEADERS,
            content_type: 'application/json',
            body: {
              items: [instruction({ 'box': { json: { payload } } })],
            },
          },
        });
      });
      vi.stubGlobal('fetch', fetchFn);

      const result = await fetchHistory(
        'https://taira.sora.org',
        WALLET,
        'iroha',
        'Taira Testnet',
        TAIRA_XOR_ASSET_ID,
        true,
        undefined,
        TAIRA_CHAIN_ID
      );

      expect(result).toBeUndefined();
    }
  });

  it('converts very large exact Torii decimals to base units without rounding', async () => {
    const quantity = '340282366920938463463374607431768211455.000000001';
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

      return rpcResult({
        isError: false,
        structuredContent: {
          status: 200,
          headers: COMPLETE_FANOUT_HEADERS,
          content_type: 'application/json',
          body: {
            items: [
              instruction({
                'box': {
                  json: {
                    payload: {
                      variant: 'Asset',
                      value: {
                        destination: COUNTERPARTY,
                        object: quantity,
                        source: `${TAIRA_XOR_ASSET_ID}#${WALLET}`,
                      },
                    },
                  },
                },
              }),
            ],
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetchFn);

    const result = await fetchHistory(
      'https://taira.sora.org',
      WALLET,
      'iroha',
      'Taira Testnet',
      TAIRA_XOR_ASSET_ID,
      true,
      undefined,
      TAIRA_CHAIN_ID
    );

    expect(result?.[0]?.transfer).toMatchObject({
      amount: '340282366920938463463374607431768211455000000001',
      fee: null,
    });
  });

  it('accepts only canonical 512-bit Iroha quantity strings', async () => {
    const maxQuantity = (1n << 511n) - 1n;
    const fetchAmount = async (amount: unknown) => {
      const fetchFn = vi.fn(async (input: string | URL) => {
        if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

        return rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: COMPLETE_FANOUT_HEADERS,
            content_type: 'application/json',
            body: {
              items: [
                instruction({
                  'box': {
                    json: {
                      payload: {
                        variant: 'Asset',
                        value: {
                          source: `${TAIRA_XOR_ASSET_ID}#${WALLET}`,
                          destination: COUNTERPARTY,
                          object: amount,
                        },
                      },
                    },
                  },
                }),
              ],
            },
          },
        });
      });
      vi.stubGlobal('fetch', fetchFn);

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
    };

    await expect(fetchAmount(maxQuantity.toString())).resolves.toEqual([
      expect.objectContaining({
        transfer: expect.objectContaining({ amount: (maxQuantity * 1_000_000_000n).toString() }),
      }),
    ]);

    for (const amount of [
      '1.0',
      '1.20',
      1,
      { mantissa: '1', scale: 0 },
      (maxQuantity + 1n).toString(),
      '9'.repeat(200),
    ]) {
      await expect(fetchAmount(amount)).resolves.toBeUndefined();
    }
  });

  it('requires canonical DTO identity, time, kind, wire binding, and I105 accounts', async () => {
    const canonicalPayload = {
      variant: 'Asset',
      value: {
        source: `${TAIRA_XOR_ASSET_ID}#${WALLET}`,
        destination: COUNTERPARTY,
        object: '1.25',
      },
    };
    const invalidItems = [
      instruction({ transaction_hash: `${'ab'.repeat(31)}a1`.toUpperCase() }),
      instruction({ transaction_hash: `0x${HASH_1}` }),
      instruction({ transaction_hash: 'a'.repeat(64) }),
      instruction({ transaction_hash: '1'.repeat(63) }),
      instruction({ created_at: '1719187200' }),
      instruction({ created_at: '2024-02-30T00:00:00Z' }),
      instruction({ created_at: '2024-01-01T00:00:00+00:00' }),
      instruction({ created_at: '2024-01-01T00:00:00.10Z' }),
      instruction({ index: undefined }),
      instruction({ index: -1 }),
      instruction({ index: 1.5 }),
      instruction({ index: 0x1_0000_0000 }),
      instruction({ kind: 'Mint' }),
      instruction({ authority: 'not-i105' }),
      instruction({ block: 0 }),
      instruction({ unexpected: true }),
      instruction({ 'r#box': { json: { payload: canonicalPayload } } }),
      instruction({
        'box': { json: { payload: canonicalPayload, wire_id: 'iroha.transfer_batch' } },
      }),
      instruction({
        'box': { json: { payload: canonicalPayload, unexpected: true } },
      }),
      instruction({
        'box': {
          json: {
            payload: {
              ...canonicalPayload,
              value: { ...canonicalPayload.value, source: `${TAIRA_XOR_ASSET_ID}#junk#${WALLET}` },
            },
          },
        },
      }),
      instruction({
        'box': {
          json: {
            payload: {
              ...canonicalPayload,
              value: { ...canonicalPayload.value, destination: 'not-i105' },
            },
          },
        },
      }),
    ];

    for (const item of invalidItems) {
      const fetchFn = vi.fn(async (input: string | URL) => {
        if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

        return rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: COMPLETE_FANOUT_HEADERS,
            content_type: 'application/json',
            body: { items: [item] },
          },
        });
      });
      vi.stubGlobal('fetch', fetchFn);

      await expect(
        fetchHistory(
          'https://taira.sora.org',
          WALLET,
          'iroha',
          'Taira Testnet',
          TAIRA_XOR_ASSET_ID,
          true,
          undefined,
          TAIRA_CHAIN_ID
        )
      ).resolves.toBeUndefined();
    }
  });

  it('uses stable DTO instruction indexes and batch leg ids without collisions', async () => {
    const batchPayload = {
      variant: 'AssetBatch',
      value: {
        mode: { mode: 'Atomic', value: null },
        entries: [
          {
            leg_id: 'outgoing',
            from: WALLET,
            to: COUNTERPARTY,
            asset_definition: TAIRA_XOR_ASSET_ID,
            amount: '2',
          },
          {
            leg_id: 'incoming',
            from: COUNTERPARTY,
            to: WALLET,
            asset_definition: TAIRA_XOR_ASSET_ID,
            amount: '3',
          },
        ],
      },
    };
    const items = [
      instruction({ index: 0 }),
      instruction({ index: 1 }),
      instruction({ index: 2, transaction_hash: HASH_2, 'box': { json: { payload: batchPayload } } }),
    ];
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

      return rpcResult({
        isError: false,
        structuredContent: {
          status: 200,
          headers: COMPLETE_FANOUT_HEADERS,
          content_type: 'application/json',
          body: { items },
        },
      });
    });
    vi.stubGlobal('fetch', fetchFn);

    const result = await fetchHistory(
      'https://taira.sora.org',
      WALLET,
      'iroha',
      'Taira Testnet',
      TAIRA_XOR_ASSET_ID,
      true,
      undefined,
      TAIRA_CHAIN_ID
    );

    expect((result as HistoryElement[]).map(({ id }) => id)).toEqual([
      `${HASH_1}:0`,
      `${HASH_1}:1`,
      `${HASH_2}:2:outgoing`,
      `${HASH_2}:2:incoming`,
    ]);

    const duplicateLeg = structuredClone(items[2]) as Record<string, unknown>;
    const duplicateBox = duplicateLeg['box'] as {
      json: { payload: { value: { entries: Array<{ leg_id: string }> } } };
    };
    duplicateBox.json.payload.value.entries[1].leg_id = 'outgoing';
    const duplicateFetch = vi.fn(async (input: string | URL) => {
      if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

      return rpcResult({
        isError: false,
        structuredContent: {
          status: 200,
          headers: COMPLETE_FANOUT_HEADERS,
          content_type: 'application/json',
          body: { items: [duplicateLeg] },
        },
      });
    });
    vi.stubGlobal('fetch', duplicateFetch);

    await expect(
      fetchHistory(
        'https://taira.sora.org',
        WALLET,
        'iroha',
        'Taira Testnet',
        TAIRA_XOR_ASSET_ID,
        true,
        undefined,
        TAIRA_CHAIN_ID
      )
    ).resolves.toBeUndefined();
  });

  it('requires coherent Torii pagination and follows all bounded pages', async () => {
    const pageRequests: number[] = [];
    const pagedFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

      const request = JSON.parse(init?.body as string);
      const page = request.params.arguments.page as number;
      const items =
        page === 1
          ? Array.from({ length: 100 }, (_, index) => instruction({ index }))
          : [instruction({ index: 100 })];
      pageRequests.push(page);

      return rpcResult({
        isError: false,
        structuredContent: {
          status: 200,
          headers: COMPLETE_FANOUT_HEADERS,
          content_type: 'application/json',
          body: {
            items,
            pagination: { page, per_page: 100, total_pages: 2, total_items: 101 },
          },
        },
      }, request.id);
    });
    vi.stubGlobal('fetch', pagedFetch);

    const result = await fetchHistory(
      'https://taira.sora.org',
      WALLET,
      'iroha',
      'Taira Testnet',
      TAIRA_XOR_ASSET_ID,
      true,
      undefined,
      TAIRA_CHAIN_ID
    );

    expect(pageRequests).toEqual([1, 2]);
    expect(result).toHaveLength(101);

    const malformedPages = [
      null,
      { page: 2, per_page: 100, total_pages: 1, total_items: 1 },
      { page: 1, per_page: 99, total_pages: 1, total_items: 1 },
      { page: 1, per_page: 100, total_pages: 2, total_items: 1 },
      { page: 1, per_page: 100, total_pages: 1, total_items: 2 },
    ];

    for (const pagination of malformedPages) {
      const invalidFetch = vi.fn(async (input: string | URL) => {
        if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

        return rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: COMPLETE_FANOUT_HEADERS,
            content_type: 'application/json',
            body: { items: [instruction()], pagination },
          },
        });
      });
      vi.stubGlobal('fetch', invalidFetch);

      await expect(
        fetchHistory(
          'https://taira.sora.org',
          WALLET,
          'iroha',
          'Taira Testnet',
          TAIRA_XOR_ASSET_ID,
          true,
          undefined,
          TAIRA_CHAIN_ID
        )
      ).resolves.toBeUndefined();
    }
  });

  it('rejects asset sources that only contain the wallet address as a substring', async () => {
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

      return rpcResult({
        isError: false,
        structuredContent: {
          status: 200,
          headers: COMPLETE_FANOUT_HEADERS,
          content_type: 'application/json',
          body: {
            items: [
              instruction({
                'box': {
                  json: {
                    payload: {
                      variant: 'Asset',
                      value: {
                        destination: COUNTERPARTY,
                        object: '1.25',
                        source: `${TAIRA_XOR_ASSET_ID}#prefix${WALLET}suffix`,
                      },
                    },
                  },
                },
              }),
            ],
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetchFn);

    const result = await fetchHistory(
      'https://taira.sora.org',
      WALLET,
      'iroha',
      'Taira Testnet',
      TAIRA_XOR_ASSET_ID,
      true,
      undefined,
      TAIRA_CHAIN_ID
    );

    expect(result).toBeUndefined();
  });

  it('rejects case-mutated noncanonical I105 source accounts', async () => {
    const caseMutatedWallet = `T${WALLET.slice(1)}`;
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

      return rpcResult({
        isError: false,
        structuredContent: {
          status: 200,
          headers: COMPLETE_FANOUT_HEADERS,
          content_type: 'application/json',
          body: {
            items: [
              instruction({
                'box': {
                  json: {
                    payload: {
                      variant: 'Asset',
                      value: {
                        destination: COUNTERPARTY,
                        object: '1.25',
                        source: `${TAIRA_XOR_ASSET_ID}#${caseMutatedWallet}`,
                      },
                    },
                  },
                },
              }),
            ],
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetchFn);

    const result = await fetchHistory(
      'https://taira.sora.org',
      WALLET,
      'iroha',
      'Taira Testnet',
      TAIRA_XOR_ASSET_ID,
      true,
      undefined,
      TAIRA_CHAIN_ID
    );

    expect(result).toBeUndefined();
  });

  it('rejects source asset ids with a second separator', async () => {
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

      return rpcResult({
        isError: false,
        structuredContent: {
          status: 200,
          headers: COMPLETE_FANOUT_HEADERS,
          content_type: 'application/json',
          body: {
            items: [
              instruction({
                'box': {
                  json: {
                    payload: {
                      variant: 'Asset',
                      value: {
                        destination: COUNTERPARTY,
                        object: '1.25',
                        source: `${TAIRA_XOR_ASSET_ID}#${WALLET}#dataspace:7`,
                      },
                    },
                  },
                },
              }),
            ],
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetchFn);

    await expect(
      fetchHistory(
        'https://taira.sora.org',
        WALLET,
        'iroha',
        'Taira Testnet',
        TAIRA_XOR_ASSET_ID,
        true,
        undefined,
        TAIRA_CHAIN_ID
      )
    ).resolves.toBeUndefined();
  });

  it('fails closed on every noncanonical committed transaction status', async () => {
    for (const transactionStatus of [undefined, 'Pending', 'Expired', 'Commited']) {
      const fetchFn = vi.fn(async (input: string | URL) => {
        if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

        return rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: COMPLETE_FANOUT_HEADERS,
            content_type: 'application/json',
            body: { items: [instruction({ transaction_status: transactionStatus })] },
          },
        });
      });
      vi.stubGlobal('fetch', fetchFn);

      await expect(
        fetchHistory(
          'https://taira.sora.org',
          WALLET,
          'iroha',
          'Taira Testnet',
          TAIRA_XOR_ASSET_ID,
          true,
          undefined,
          TAIRA_CHAIN_ID
        )
      ).resolves.toBeUndefined();
    }
  });

  it('rejects legacy and ambiguous top-level history field aliases', async () => {
    const aliasedItems = [
      instruction({ transaction_status: undefined, status: 'Committed' }),
      instruction({ transactionStatus: 'Committed' }),
      instruction({ transactionHash: HASH_2 }),
      instruction({ createdAt: '2026-06-24T00:00:00Z' }),
    ];

    for (const item of aliasedItems) {
      const fetchFn = vi.fn(async (input: string | URL) => {
        if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

        return rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: COMPLETE_FANOUT_HEADERS,
            content_type: 'application/json',
            body: { items: [item] },
          },
        });
      });
      vi.stubGlobal('fetch', fetchFn);

      await expect(
        fetchHistory(
          'https://taira.sora.org',
          WALLET,
          'iroha',
          'Taira Testnet',
          TAIRA_XOR_ASSET_ID,
          true,
          undefined,
          TAIRA_CHAIN_ID
        )
      ).resolves.toBeUndefined();
    }
  });

  it('fails closed when a valid history route omits its items array', async () => {
    for (const body of [{}, { items: null }, { items: {} }]) {
      const fetchFn = vi.fn(async (input: string | URL) => {
        if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

        return rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: COMPLETE_FANOUT_HEADERS,
            content_type: 'application/json',
            body,
          },
        });
      });
      vi.stubGlobal('fetch', fetchFn);

      await expect(
        fetchHistory(
          'https://taira.sora.org',
          WALLET,
          'iroha',
          'Taira Testnet',
          TAIRA_XOR_ASSET_ID,
          true,
          undefined,
          TAIRA_CHAIN_ID
        )
      ).resolves.toBeUndefined();
    }
  });

  it('invalidates history containing malformed or unsafe Iroha instruction payloads', async () => {
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

      return rpcResult({
        isError: false,
        structuredContent: {
          body: {
            items: [
              instruction({ 'box': { json: { payload: { variant: 'Domain', value: {} } } } }),
              instruction({
                'box': {
                  json: {
                    payload: {
                      variant: 'Asset',
                      value: { destination: WALLET, object: '-1', source: `${TAIRA_XOR_ASSET_ID}#${COUNTERPARTY}` },
                    },
                  },
                },
              }),
              instruction({
                'box': {
                  json: {
                    payload: {
                      variant: 'Asset',
                      value: { destination: WALLET, object: ' 1.5 ', source: `${TAIRA_XOR_ASSET_ID}#${COUNTERPARTY}` },
                    },
                  },
                },
              }),
              instruction({
                'box': {
                  json: {
                    payload: {
                      variant: 'Asset',
                      value: {
                        destination: WALLET,
                        object: '1.0000000001',
                        source: `${TAIRA_XOR_ASSET_ID}#${COUNTERPARTY}`,
                      },
                    },
                  },
                },
              }),
              instruction({
                'box': {
                  json: {
                    payload: {
                      variant: 'Asset',
                      value: { destination: WALLET, object: '1', source: `bad#sora#${COUNTERPARTY}` },
                    },
                  },
                },
              }),
              instruction({
                'box': {
                  json: {
                    payload: {
                      variant: 'Asset',
                      value: {
                        destination: COUNTERPARTY,
                        object: '1',
                        source: `${TAIRA_XOR_ASSET_ID}#${COUNTERPARTY}`,
                      },
                    },
                  },
                },
              }),
              instruction({ created_at: 'not-a-date' }),
              instruction({ 'box': { json: {} } }),
            ],
          },
          content_type: 'application/json',
          headers: COMPLETE_FANOUT_HEADERS,
          status: 200,
        },
      });
    });
    vi.stubGlobal('fetch', fetchFn);

    await expect(
      fetchHistory(
        'https://taira.sora.org',
        WALLET,
        'iroha',
        'Taira Testnet',
        TAIRA_XOR_ASSET_ID,
        true,
        undefined,
        TAIRA_CHAIN_ID
      )
    ).resolves.toBeUndefined();
  });

  it('rejects a null canonical Taira XOR scale before querying instructions', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchFn = vi.fn(async (_input: RequestInfo | URL) => tairaDefinitionResponse(null));
    vi.stubGlobal('fetch', fetchFn);

    await expect(
      fetchHistory(
        'https://taira.sora.org',
        WALLET,
        'iroha',
        'Taira Testnet',
        TAIRA_XOR_ASSET_ID,
        true,
        undefined,
        TAIRA_CHAIN_ID
      )
    ).resolves.toBeUndefined();

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
    expect(fetchFn.mock.calls[0]?.[0].toString()).toContain(
      'https://minamoto.sora.org/v1/assets/definitions/'
    );
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
