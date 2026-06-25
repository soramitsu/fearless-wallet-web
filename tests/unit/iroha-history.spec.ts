import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fetchHistory } from '@/history/fetchingHistory';
import { getFormattedHistory } from '@/helpers/history';

vi.mock('@/extension/messaging', () => ({
  getHistory: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));

vi.mock('@/extension/messaging/price', () => ({
  getFiats: vi.fn(),
}));

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../docs/universal-wallet-v2-vectors.json'), 'utf8')
) as {
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
const HASH_1 = '11'.repeat(32);
const HASH_2 = '22'.repeat(32);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
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
            object: '123',
            source: `xor#sora#${WALLET}`,
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes committed Iroha asset transfer instructions from Torii MCP', async () => {
    const requests: unknown[] = [];
    const fetchFn = vi.fn(async (_input: string | URL, init?: RequestInit) => {
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
                          scale: 0,
                        },
                        source: `xor#sora#${COUNTERPARTY}`,
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
          headers: {},
          status: 200,
        },
      });
    });
    vi.stubGlobal('fetch', fetchFn);

    const result = await fetchHistory('https://taira.sora.org', WALLET, 'iroha', 'Taira Testnet', 'xor#sora', true);

    expect(fetchFn).toHaveBeenCalledWith('https://taira.sora.org/v1/mcp', expect.objectContaining({ method: 'POST' }));
    expect(requests[0]).toMatchObject({
      method: 'tools/call',
      params: {
        name: 'iroha.instructions.list',
        arguments: {
          account: WALLET,
          accept: 'application/json',
          asset_id: 'xor#sora',
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
          amount: '123',
          fee: '0',
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
          amount: '456',
          fee: '0',
          from: COUNTERPARTY,
          to: WALLET,
        },
      },
    ]);
  });

  it('drops malformed, unrelated, and unsafe Iroha instruction payloads', async () => {
    const fetchFn = vi.fn(async () =>
      rpcResult({
        isError: false,
        structuredContent: {
          body: {
            items: [
              instruction({ box: { json: { payload: { variant: 'Domain', value: {} } } } }),
              instruction({ box: { json: { payload: { variant: 'Asset', value: { destination: WALLET, object: '-1', source: `xor#sora#${COUNTERPARTY}` } } } } }),
              instruction({ box: { json: { payload: { variant: 'Asset', value: { destination: WALLET, object: '1.5', source: `xor#sora#${COUNTERPARTY}` } } } } }),
              instruction({ box: { json: { payload: { variant: 'Asset', value: { destination: WALLET, object: '1', source: `bad#sora#${COUNTERPARTY}` } } } } }),
              instruction({ box: { json: { payload: { variant: 'Asset', value: { destination: COUNTERPARTY, object: '1', source: `xor#sora#${COUNTERPARTY}` } } } } }),
              instruction({ created_at: 'not-a-date' }),
              instruction({ box: { json: {} } }),
            ],
          },
          status: 200,
        },
      })
    );
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchHistory('https://taira.sora.org', WALLET, 'iroha', 'Taira Testnet', 'xor#sora', true)).resolves.toEqual([]);
  });

  it('uses Minamoto for Nexus history by default and fails closed when unavailable', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('minamoto_unavailable');
    });
    vi.stubGlobal('fetch', fetchFn);

    await expect(fetchHistory('', NEXUS_WALLET, 'iroha', 'SORA Nexus', 'xor#sora', true)).resolves.toEqual([]);
    expect(fetchFn).toHaveBeenCalledWith('https://minamoto.sora.org/v1/mcp', expect.objectContaining({ method: 'POST' }));
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
