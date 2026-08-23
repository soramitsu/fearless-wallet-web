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
const HASH_2 = '22'.repeat(32);
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

function rpcResult(result: unknown): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id: 1,
    result,
  });
}

function tairaDefinitionResponse(scale: number | null = 9): Response {
  return jsonResponse({
    has_more: false,
    items: [{ id: TAIRA_XOR_ASSET_ID, name: 'XOR', spec: { scale } }],
  });
}

function instruction(overrides: Record<string, unknown> = {}) {
  return {
    authority: WALLET,
    block: 12,
    box: {
      encoded: '0x00',
      json: {
        payload: {
          value: {
            destination: COUNTERPARTY,
            object: '1.25',
            source: `${TAIRA_XOR_ASSET_ID}#${WALLET}`,
          },
          variant: 'Asset',
        },
      },
    },
    created_at: '2026-06-24T00:00:00Z',
    index: 0,
    kind: 'Transfer',
    transaction_hash: HASH_1,
    transaction_status: 'Committed',
    ...overrides,
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
                box: {
                  json: {
                    payload: {
                      value: {
                        destination: WALLET,
                        object: {
                          mantissa: '456',
                          scale: 2,
                        },
                        source: `${TAIRA_XOR_ASSET_ID}#${COUNTERPARTY}`,
                      },
                      variant: 'Asset',
                    },
                  },
                },
                created_at: '1719187200',
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
    expect(requests[0]).toMatchObject({
      method: 'tools/call',
      params: {
        name: 'iroha.instructions.list',
        arguments: {
          account: WALLET,
          accept: 'application/json',
          asset_id: TAIRA_XOR_ASSET_ID,
          kind: 'Transfer',
          page: 0,
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
        id: HASH_1,
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
        id: HASH_2,
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
                box: {
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
                box: {
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

    expect(result).toEqual([]);
  });

  it('drops malformed, unrelated, and unsafe Iroha instruction payloads', async () => {
    const fetchFn = vi.fn(async (input: string | URL) => {
      if (!input.toString().endsWith('/v1/mcp')) return tairaDefinitionResponse();

      return rpcResult({
        isError: false,
        structuredContent: {
          body: {
            items: [
              instruction({ box: { json: { payload: { variant: 'Domain', value: {} } } } }),
              instruction({
                box: {
                  json: {
                    payload: {
                      variant: 'Asset',
                      value: { destination: WALLET, object: '-1', source: `${TAIRA_XOR_ASSET_ID}#${COUNTERPARTY}` },
                    },
                  },
                },
              }),
              instruction({
                box: {
                  json: {
                    payload: {
                      variant: 'Asset',
                      value: { destination: WALLET, object: ' 1.5 ', source: `${TAIRA_XOR_ASSET_ID}#${COUNTERPARTY}` },
                    },
                  },
                },
              }),
              instruction({
                box: {
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
                box: {
                  json: {
                    payload: {
                      variant: 'Asset',
                      value: { destination: WALLET, object: '1', source: `bad#sora#${COUNTERPARTY}` },
                    },
                  },
                },
              }),
              instruction({
                box: {
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
              instruction({ box: { json: {} } }),
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
    ).resolves.toEqual([]);
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
    ).resolves.toEqual([]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0].toString()).toContain('/v1/assets/definitions?');
    info.mockRestore();
  });

  it('uses Minamoto for an exact Nexus chain id and fails closed when definitions are unavailable', async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL) => {
      throw new Error('minamoto_unavailable');
    });
    vi.stubGlobal('fetch', fetchFn);

    await expect(
      fetchHistory('', NEXUS_WALLET, 'iroha', 'SORA Nexus', 'xor#sora', true, undefined, NEXUS_CHAIN_ID)
    ).resolves.toEqual([]);
    expect(fetchFn.mock.calls[0]?.[0].toString()).toContain('https://minamoto.sora.org/v1/assets/definitions?');
  });

  it('rejects ambiguous Iroha networks before issuing a request', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);

    await expect(
      fetchHistory('https://taira.sora.org', WALLET, 'iroha', 'Taira Testnet', TAIRA_XOR_ASSET_ID, true)
    ).resolves.toEqual([]);
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
