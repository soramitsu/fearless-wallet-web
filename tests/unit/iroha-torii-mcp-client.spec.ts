import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  IROHA_MCP_PROTOCOL_VERSION,
  IrohaToriiMcpClient,
  IrohaToriiMcpError,
  IrohaToriiWalletClient,
  createIrohaToriiMcpClient,
  createIrohaToriiWalletClient,
} from '@extension-base/services/iroha-torii-service';

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

const TAIRA_ACCOUNT_ID = fixture.vectors[0].expected.iroha.taira.i105;
const NEXUS_ACCOUNT_ID = fixture.vectors[0].expected.iroha.nexus.i105;
const HASH = 'a'.repeat(64);

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

describe('IrohaToriiMcpClient', () => {
  it('uses the Taira MCP endpoint by default and speaks JSON-RPC 2.0', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), init });

      if (init?.method === 'GET') {
        return jsonResponse({
          protocolVersion: IROHA_MCP_PROTOCOL_VERSION,
          serverInfo: { name: 'iroha-torii-mcp' },
          capabilities: { tools: { count: 1, listChanged: false, toolsetVersion: 'abc' } },
        });
      }

      const request = JSON.parse(init?.body as string);

      if (request.method === 'initialize') {
        return rpcResult({
          protocolVersion: IROHA_MCP_PROTOCOL_VERSION,
          serverInfo: { name: 'iroha-torii-mcp' },
          capabilities: { tools: { count: 1, listChanged: false, toolsetVersion: 'abc' } },
        });
      }

      if (request.method === 'tools/list') {
        return rpcResult({
          tools: [{ name: 'iroha.accounts.get', inputSchema: { type: 'object' } }],
          nextCursor: null,
          listChanged: true,
          toolsetVersion: 'abc',
        });
      }

      return rpcResult({
        isError: false,
        structuredContent: { status: 200, body: { account: request.params.arguments.id } },
      });
    });
    const client = new IrohaToriiMcpClient({ fetchFn });

    await client.getCapabilities();
    await client.initialize();
    await client.listTools({ cursor: '0', toolsetVersion: 'old' });
    const result = await client.callTool('iroha.accounts.get', { id: 'alice@wonderland.universal' });

    expect(result.structuredContent).toEqual({ status: 200, body: { account: 'alice@wonderland.universal' } });
    expect(calls.every(({ url }) => url === 'https://taira.sora.org/v1/mcp')).toBe(true);
    expect(calls[1]?.init?.headers).toEqual({ 'content-type': 'application/json' });

    const listBody = JSON.parse(calls[2]?.init?.body as string);
    expect(listBody).toEqual({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {
        cursor: '0',
        toolsetVersion: 'old',
      },
    });

    const callBody = JSON.parse(calls[3]?.init?.body as string);
    expect(callBody).toEqual({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'iroha.accounts.get',
        arguments: {
          id: 'alice@wonderland.universal',
        },
      },
    });
  });

  it('normalizes roots and allows explicit localhost endpoints for tests', async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL) => {
      calls.push(input.toString());
      return rpcResult({});
    });

    await new IrohaToriiMcpClient({ baseUrl: 'https://taira.sora.org/', fetchFn }).ping();
    await new IrohaToriiMcpClient({ baseUrl: 'https://taira.sora.org/v1/mcp', fetchFn }).ping();
    await new IrohaToriiMcpClient({ baseUrl: 'http://localhost:18080', fetchFn }).ping();

    expect(calls).toEqual([
      'https://taira.sora.org/v1/mcp',
      'https://taira.sora.org/v1/mcp',
      'http://localhost:18080/v1/mcp',
    ]);
  });

  it('uses Minamoto for Nexus by default and allows explicit runtime Torii roots', async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL) => {
      calls.push(input.toString());
      return rpcResult({});
    });
    await createIrohaToriiMcpClient('nexus', { fetchFn }).ping();
    await createIrohaToriiMcpClient('nexus', { baseUrl: 'https://nexus.example.org', fetchFn }).ping();

    expect(calls).toEqual([
      'https://minamoto.sora.org/v1/mcp',
      'https://nexus.example.org/v1/mcp',
    ]);
  });

  it('rejects unsafe URLs, non-curated tools, bad arguments, and unsupported headers before fetch', async () => {
    expect(() => new IrohaToriiMcpClient({ baseUrl: 'http://taira.sora.org', fetchFn: vi.fn() })).toThrow(
      IrohaToriiMcpError
    );

    const fetchFn = vi.fn();
    const client = new IrohaToriiMcpClient({ fetchFn });

    await expect(client.callTool('torii.get_v1_accounts', {})).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.callTool('iroha../accounts.get', {})).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.callTool('iroha.accounts.get', [] as never)).rejects.toThrow(IrohaToriiMcpError);
    expect(() => client.callToolBatch([])).toThrow(IrohaToriiMcpError);
    expect(() => client.callToolBatch(new Array(26).fill({ name: 'iroha.health', arguments: {} }))).toThrow(
      IrohaToriiMcpError
    );
    expect(() => client.listTools({ cursor: '../1' })).toThrow(IrohaToriiMcpError);
    expect(() => client.getJob('../bad')).toThrow(IrohaToriiMcpError);
    await expect(new IrohaToriiMcpClient({ fetchFn, headers: { host: 'bad' } as never }).ping()).rejects.toThrow(
      IrohaToriiMcpError
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('surfaces HTTP, malformed JSON, JSON-RPC, and tool-level failures as typed errors', async () => {
    const httpFailure = new IrohaToriiMcpClient({
      fetchFn: vi.fn(async () => jsonResponse({ error: 'disabled' }, 404)),
    });

    await expect(httpFailure.ping()).rejects.toMatchObject({
      name: 'IrohaToriiMcpError',
      status: 404,
      body: { error: 'disabled' },
    });

    const malformed = new IrohaToriiMcpClient({
      fetchFn: vi.fn(async () => new Response('{not-json', { status: 200 })),
    });

    await expect(malformed.ping()).rejects.toMatchObject({
      name: 'IrohaToriiMcpError',
      message: 'invalid_json',
    });

    const jsonRpcFailure = new IrohaToriiMcpClient({
      fetchFn: vi.fn(async () =>
        jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32602,
            message: 'tool not found',
            data: { error_code: 'tool_not_found' },
          },
        })
      ),
    });

    await expect(jsonRpcFailure.callTool('iroha.accounts.get')).rejects.toMatchObject({
      name: 'IrohaToriiMcpError',
      code: -32602,
      data: { error_code: 'tool_not_found' },
    });

    const toolFailure = new IrohaToriiMcpClient({
      fetchFn: vi.fn(async () =>
        rpcResult({
          isError: true,
          structuredContent: {
            status: 503,
            error_code: 'route_unavailable',
          },
        })
      ),
    });

    await expect(toolFailure.callTool('iroha.transactions.submit')).rejects.toMatchObject({
      name: 'IrohaToriiMcpError',
      message: 'iroha_mcp_tool_error',
      data: {
        status: 503,
        error_code: 'route_unavailable',
      },
    });
  });

  it('sends the initialized notification and runtime-only auth headers', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), init });
      return new Response(null, { status: 202 });
    });
    const client = new IrohaToriiMcpClient({
      fetchFn,
      headers: {
        authorization: 'Bearer runtime-token',
      },
    });

    await client.notifyInitialized({
      headers: {
        'x-iroha-api-version': '1',
      },
    });

    expect(calls[0]?.url).toBe('https://taira.sora.org/v1/mcp');
    expect(calls[0]?.init?.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer runtime-token',
      'x-iroha-api-version': '1',
    });
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
  });
});

describe('IrohaToriiWalletClient', () => {
  it('reads Taira account details and assets through curated MCP tools', async () => {
    const calls: unknown[] = [];
    const fetchFn = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const request = JSON.parse(init?.body as string);
      calls.push(request);

      if (request.params.name === 'iroha.accounts.get') {
        return rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            content_type: 'application/json',
            body: {
              id: request.params.arguments.account_id,
            },
          },
        });
      }

      return rpcResult({
        isError: false,
        structuredContent: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          content_type: 'application/json',
          body: {
            items: [
              {
                asset_id: 'xor#wonderland',
                value: '1000000000',
              },
            ],
          },
        },
      });
    });
    const client = new IrohaToriiWalletClient({ network: 'taira', fetchFn });

    const account = await client.getAccount<{ id: string }>(TAIRA_ACCOUNT_ID);
    const assets = await client.getAccountAssets<{ items: Array<{ asset_id: string; value: string }> }>(
      TAIRA_ACCOUNT_ID,
      {
        assetId: 'xor#wonderland',
        limit: 50,
        offset: 10,
      }
    );

    expect(account).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      contentType: 'application/json',
      body: {
        id: TAIRA_ACCOUNT_ID,
      },
    });
    expect(assets.body.items[0]).toEqual({ asset_id: 'xor#wonderland', value: '1000000000' });
    expect(calls).toMatchObject([
      {
        method: 'tools/call',
        params: {
          name: 'iroha.accounts.get',
          arguments: {
            account_id: TAIRA_ACCOUNT_ID,
            accept: 'application/json',
          },
        },
      },
      {
        method: 'tools/call',
        params: {
          name: 'iroha.accounts.assets',
          arguments: {
            account_id: TAIRA_ACCOUNT_ID,
            accept: 'application/json',
            asset_id: 'xor#wonderland',
            limit: 50,
            offset: 10,
          },
        },
      },
    ]);
  });

  it('fetches an account snapshot with one batch call', async () => {
    const calls: unknown[] = [];
    const fetchFn = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const request = JSON.parse(init?.body as string);
      calls.push(request);

      return rpcResult({
        results: request.params.calls.map((call: { name: string }) => ({
          result: {
            isError: false,
            structuredContent: {
              status: 200,
              headers: {},
              content_type: 'application/json',
              body: call.name === 'iroha.accounts.get' ? { id: TAIRA_ACCOUNT_ID } : { items: [] },
            },
          },
        })),
      });
    });
    const client = createIrohaToriiWalletClient('taira', { fetchFn });

    const snapshot = await client.getAccountSnapshot(TAIRA_ACCOUNT_ID, { limit: 5 });

    expect(snapshot.account.body).toEqual({ id: TAIRA_ACCOUNT_ID });
    expect(snapshot.assets.body).toEqual({ items: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'tools/call_batch',
      params: {
        calls: [
          {
            name: 'iroha.accounts.get',
            arguments: {
              account_id: TAIRA_ACCOUNT_ID,
              accept: 'application/json',
            },
          },
          {
            name: 'iroha.accounts.assets',
            arguments: {
              account_id: TAIRA_ACCOUNT_ID,
              accept: 'application/json',
              limit: 5,
            },
          },
        ],
      },
    });
  });

  it('lists Iroha transfer instructions through curated MCP tools', async () => {
    const calls: unknown[] = [];
    const fetchFn = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const request = JSON.parse(init?.body as string);
      calls.push(request);

      return rpcResult({
        isError: false,
        structuredContent: {
          status: 200,
          headers: {},
          content_type: 'application/json',
          body: {
            items: [
              {
                transaction_hash: HASH,
                kind: 'Transfer',
              },
            ],
          },
        },
      });
    });
    const client = new IrohaToriiWalletClient({ network: 'taira', fetchFn });

    await expect(
      client.getInstructions<{ items: Array<{ transaction_hash: string }> }>({
        account: TAIRA_ACCOUNT_ID,
        assetId: 'xor#sora',
        kind: 'Transfer',
        page: 0,
        perPage: 100,
        transactionHash: `0x${HASH}`,
        transactionStatus: 'committed',
      })
    ).resolves.toMatchObject({
      body: {
        items: [{ transaction_hash: HASH }],
      },
    });

    expect(calls).toMatchObject([
      {
        method: 'tools/call',
        params: {
          name: 'iroha.instructions.list',
          arguments: {
            account: TAIRA_ACCOUNT_ID,
            accept: 'application/json',
            asset_id: 'xor#sora',
            kind: 'Transfer',
            page: 0,
            per_page: 100,
            transaction_hash: HASH,
            transaction_status: 'committed',
          },
        },
      },
    ]);
  });

  it('uses direct Torii routes for asset definitions transaction status and Norito submission', async () => {
    const noritoPayload = new Uint8Array([1, 2, 3]);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), init });

      if (input.toString().endsWith('/v1/pipeline/transactions')) {
        expect(init?.body).toBe(noritoPayload);

        return jsonResponse({
          payload: {
            tx_hash: HASH,
          },
        });
      }

      if (input.toString().includes('/v1/pipeline/transactions/status')) {
        return jsonResponse({
          hash: HASH,
          status: {
            kind: 'committed',
          },
          scope: 'global',
        });
      }

      return jsonResponse({
        items: [
          {
            id: 'xor#sora',
          },
        ],
      });
    });
    const client = new IrohaToriiWalletClient({
      fetchFn,
      headers: {
        authorization: 'Bearer runtime-token',
      },
      network: 'taira',
    });

    await expect(client.getAssetDefinitions()).resolves.toEqual({ items: [{ id: 'xor#sora' }] });
    await expect(client.getTransactionStatus(`0x${HASH}`, { scope: 'global' })).resolves.toMatchObject({
      hash: HASH,
      scope: 'global',
    });
    await expect(
      client.submitTransaction(noritoPayload, {
        headers: {
          'x-iroha-api-version': '1',
        },
      })
    ).resolves.toEqual({
      payload: {
        tx_hash: HASH,
      },
    });

    expect(calls.map(({ url }) => url)).toEqual([
      'https://taira.sora.org/v1/assets/definitions',
      `https://taira.sora.org/v1/pipeline/transactions/status?hash=${HASH}&scope=global`,
      'https://taira.sora.org/v1/pipeline/transactions',
    ]);
    expect(calls[2]?.init?.method).toBe('POST');
    expect(calls[2]?.init?.headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/x-norito',
      authorization: 'Bearer runtime-token',
      'x-iroha-api-version': '1',
    });
  });

  it('normalizes direct Torii roots and uses Minamoto for Nexus direct routes by default', async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL) => {
      calls.push(input.toString());

      return jsonResponse({});
    });

    await new IrohaToriiWalletClient({
      baseUrl: 'https://nexus.example.org/v1/mcp',
      fetchFn,
      network: 'nexus',
    }).getAssetDefinitions();
    await new IrohaToriiWalletClient({
      baseUrl: 'http://localhost:18080/custom',
      fetchFn,
      network: 'taira',
    }).getTransactionStatus(HASH);

    expect(calls).toEqual([
      'https://nexus.example.org/v1/assets/definitions',
      `http://localhost:18080/custom/v1/pipeline/transactions/status?hash=${HASH}&scope=auto`,
    ]);

    await new IrohaToriiWalletClient({
      client: new IrohaToriiMcpClient({ baseUrl: 'https://nexus.example.org', fetchFn }),
      fetchFn,
      network: 'nexus',
    }).getAssetDefinitions();

    expect(calls.at(-1)).toBe('https://minamoto.sora.org/v1/assets/definitions');
  });

  it('rejects malformed, wrong-network, and unsafe read inputs before fetch', async () => {
    const fetchFn = vi.fn();
    const client = new IrohaToriiWalletClient({ network: 'taira', fetchFn });

    await expect(client.getAccount('0x1234')).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getAccount(NEXUS_ACCOUNT_ID)).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID, { accept: 'application/x-norito' as never })).rejects.toThrow(
      IrohaToriiMcpError
    );
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID, { limit: 0 })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID, { offset: -1 })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID, { assetId: ' xor#wonderland ' })).rejects.toThrow(
      IrohaToriiMcpError
    );
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID, { query: [] as never })).rejects.toThrow(
      IrohaToriiMcpError
    );
    await expect(client.getInstructions({ account: NEXUS_ACCOUNT_ID })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ authority: 'not-i105' })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ page: -1 })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ perPage: 0 })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ block: 0 })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ transactionHash: 'not-a-hash' })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ transactionStatus: 'pending' as never })).rejects.toThrow(
      IrohaToriiMcpError
    );
    await expect(client.getInstructions({ kind: ' Transfer ' })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getTransactionStatus('not-a-hash')).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getTransactionStatus(HASH, { scope: 'bad' as never })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.submitTransaction(new Uint8Array())).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.submitTransaction('not-norito' as never)).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getAssetDefinitions({ headers: { host: 'bad' } as never })).rejects.toThrow(
      IrohaToriiMcpError
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects malformed route responses and batch item failures', async () => {
    const routeError = new IrohaToriiWalletClient({
      fetchFn: vi.fn(async () =>
        rpcResult({
          isError: false,
          structuredContent: {
            status: 404,
            error_code: 'not_found',
            body: {
              message: 'missing',
            },
          },
        })
      ),
    });

    await expect(routeError.getAccount(TAIRA_ACCOUNT_ID)).rejects.toMatchObject({
      name: 'IrohaToriiMcpError',
      message: 'iroha_mcp_route_error',
      status: 404,
      data: 'not_found',
    });

    const malformed = new IrohaToriiWalletClient({
      fetchFn: vi.fn(async () =>
        rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: { 'content-type': 1 },
            content_type: 'application/json',
            body: {},
          },
        })
      ),
    });

    await expect(malformed.getAccount(TAIRA_ACCOUNT_ID)).rejects.toThrow(IrohaToriiMcpError);

    const batchFailure = new IrohaToriiWalletClient({
      fetchFn: vi.fn(async () =>
        rpcResult({
          results: [
            {
              result: {
                isError: false,
                structuredContent: {
                  status: 200,
                  body: {},
                },
              },
            },
            {
              error: {
                code: -32603,
                message: 'failed',
              },
            },
          ],
        })
      ),
    });

    await expect(batchFailure.getAccountSnapshot(TAIRA_ACCOUNT_ID)).rejects.toMatchObject({
      name: 'IrohaToriiMcpError',
      message: 'iroha_mcp_batch_tool_error',
    });
  });
});
