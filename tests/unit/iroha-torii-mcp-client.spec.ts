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

const TAIRA_ACCOUNT_ID = fixture.vectors[0].expected.iroha.taira.i105;
const NEXUS_ACCOUNT_ID = fixture.vectors[0].expected.iroha.nexus.i105;
const TAIRA_XOR_ASSET_ID = '6TEAJqbb8oEPmLncoNiMRbLEK6tw';
const HASH = `${'a'.repeat(63)}b`;
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

function rpcResult(result: unknown, id = 1): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id,
    result,
  });
}

function submitAndWaitResult(hash = HASH) {
  return {
    status: 200,
    hash,
    tx_hash: hash,
    terminal_kind: 'Applied',
    terminal_statuses: ['Applied'],
    attempts: 2,
    elapsed_ms: 500,
    submit: {
      status: 202,
      headers: COMPLETE_FANOUT_HEADERS,
      content_type: 'application/json',
      body: { tx_hash_hex: hash },
    },
    final_status: {
      status: 200,
      headers: COMPLETE_FANOUT_HEADERS,
      content_type: 'application/json',
      body: { hash, status: { kind: 'Applied' } },
    },
  };
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
        return rpcResult(
          {
            protocolVersion: IROHA_MCP_PROTOCOL_VERSION,
            serverInfo: { name: 'iroha-torii-mcp' },
            capabilities: { tools: { count: 1, listChanged: false, toolsetVersion: 'abc' } },
          },
          request.id
        );
      }

      if (request.method === 'tools/list') {
        return rpcResult(
          {
            tools: [{ name: 'iroha.accounts.get', inputSchema: { type: 'object' } }],
            nextCursor: null,
            listChanged: true,
            toolsetVersion: 'abc',
          },
          request.id
        );
      }

      return rpcResult(
        {
          isError: false,
          structuredContent: { status: 200, body: { account: request.params.arguments.id } },
        },
        request.id
      );
    });
    const client = new IrohaToriiMcpClient({ fetchFn });

    await client.getCapabilities();
    await client.initialize();
    await client.listTools({ cursor: '0', toolsetVersion: 'old' });
    const result = await client.callTool('iroha.accounts.get', { id: 'alice@wonderland.universal' });

    expect(result.structuredContent).toEqual({ status: 200, body: { account: 'alice@wonderland.universal' } });
    expect(calls.every(({ url }) => url === 'https://taira.sora.org/v1/mcp')).toBe(true);
    expect(calls.every(({ init }) => init?.redirect === 'error')).toBe(true);
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

    expect(calls).toEqual(['https://minamoto.sora.org/v1/mcp', 'https://nexus.example.org/v1/mcp']);
  });

  it('rejects unsafe URLs, non-curated tools, bad arguments, and unsupported headers before fetch', async () => {
    expect(() => new IrohaToriiMcpClient({ baseUrl: 'http://taira.sora.org', fetchFn: vi.fn() })).toThrow(
      IrohaToriiMcpError
    );
    expect(() => new IrohaToriiMcpClient({ baseUrl: 'ftp://localhost', fetchFn: vi.fn() })).toThrow(IrohaToriiMcpError);
    expect(() => new IrohaToriiMcpClient({ baseUrl: 'https://user:secret@taira.sora.org', fetchFn: vi.fn() })).toThrow(
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

  it('rejects mismatched JSON-RPC identities and ambiguous result/error envelopes', async () => {
    const wrongId = new IrohaToriiMcpClient({
      fetchFn: vi.fn(async () => rpcResult({}, 2)),
    });
    const ambiguous = new IrohaToriiMcpClient({
      fetchFn: vi.fn(async () =>
        jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: {},
          error: { code: -32603, message: 'ambiguous' },
        })
      ),
    });

    await expect(wrongId.ping()).rejects.toMatchObject({ message: 'invalid_jsonrpc_response' });
    await expect(ambiguous.ping()).rejects.toMatchObject({ message: 'invalid_jsonrpc_response' });
  });

  it('bounds response size and request duration', async () => {
    const oversized = new IrohaToriiMcpClient({
      maxResponseBytes: 32,
      fetchFn: vi.fn(async () => rpcResult({ value: 'x'.repeat(128) })),
    });
    const stalled = new IrohaToriiMcpClient({
      timeoutMs: 5,
      fetchFn: vi.fn(
        (_input: string | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          })
      ),
    });

    await expect(oversized.ping()).rejects.toMatchObject({ message: 'iroha_response_too_large' });
    await expect(stalled.ping()).rejects.toMatchObject({ message: 'iroha_request_timeout' });
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
        return rpcResult(
          {
            isError: false,
            structuredContent: {
              status: 200,
              headers: { 'content-type': 'application/json', ...COMPLETE_FANOUT_HEADERS },
              content_type: 'application/json',
              body: {
                id: request.params.arguments.account_id,
              },
            },
          },
          request.id
        );
      }

      return rpcResult(
        {
          isError: false,
          structuredContent: {
            status: 200,
            headers: { 'content-type': 'application/json', ...COMPLETE_FANOUT_HEADERS },
            content_type: 'application/json',
            body: {
              items: [
                {
                  asset_id: TAIRA_XOR_ASSET_ID,
                  value: '1000000000',
                },
              ],
            },
          },
        },
        request.id
      );
    });
    const client = new IrohaToriiWalletClient({ network: 'taira', fetchFn });

    const account = await client.getAccount<{ id: string }>(TAIRA_ACCOUNT_ID);
    const assets = await client.getAccountAssets<{ items: Array<{ asset_id: string; value: string }> }>(
      TAIRA_ACCOUNT_ID,
      {
        assetId: TAIRA_XOR_ASSET_ID,
        limit: 50,
        offset: 10,
      }
    );

    expect(account).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json', ...COMPLETE_FANOUT_HEADERS },
      contentType: 'application/json',
      body: {
        id: TAIRA_ACCOUNT_ID,
      },
    });
    expect(assets.body.items[0]).toEqual({ asset_id: TAIRA_XOR_ASSET_ID, value: '1000000000' });
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
            asset_id: TAIRA_XOR_ASSET_ID,
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
              headers: COMPLETE_FANOUT_HEADERS,
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
          headers: COMPLETE_FANOUT_HEADERS,
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
        assetId: TAIRA_XOR_ASSET_ID,
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
            asset_id: TAIRA_XOR_ASSET_ID,
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

  it('uses bounded reads and canonical MCP submit-and-wait for transaction submission', async () => {
    const noritoPayload = new Uint8Array([1, 2, 3]);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), init });

      if (input.toString().endsWith('/v1/mcp')) {
        const request = JSON.parse(init?.body as string);

        return rpcResult({ isError: false, structuredContent: submitAndWaitResult() }, request.id);
      }

      if (input.toString().includes('/v1/pipeline/transactions/status')) {
        return jsonResponse({
          hash: HASH,
          status: {
            kind: 'Applied',
          },
          scope: 'global',
        });
      }

      return jsonResponse({
        items: [
          {
            id: TAIRA_XOR_ASSET_ID,
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

    await expect(client.getAssetDefinitions()).resolves.toMatchObject({
      body: { items: [{ id: TAIRA_XOR_ASSET_ID }] },
    });
    await expect(client.getTransactionStatus(`0x${HASH}`, { scope: 'global' })).resolves.toMatchObject({
      body: { hash: HASH, scope: 'global' },
    });
    await expect(
      client.submitTransactionAndWait(noritoPayload, HASH, {
        headers: {
          'x-iroha-api-version': '1',
        },
      })
    ).resolves.toMatchObject({ hash: HASH, terminal_kind: 'Applied', tx_hash: HASH });

    expect(calls.map(({ url }) => url)).toEqual([
      'https://taira.sora.org/v1/assets/definitions',
      `https://taira.sora.org/v1/pipeline/transactions/status?hash=${HASH}&scope=global`,
      'https://taira.sora.org/v1/mcp',
    ]);
    expect(calls[2]?.init?.method).toBe('POST');
    expect(calls[2]?.init?.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer runtime-token',
      'x-iroha-api-version': '1',
    });
    expect(JSON.parse(calls[2]?.init?.body as string)).toMatchObject({
      method: 'tools/call',
      params: {
        name: 'iroha.transactions.submit_and_wait',
        arguments: {
          accept: 'application/json',
          body_base64: 'AQID',
          hash: HASH,
          poll_interval_ms: 500,
          status_accept: 'application/json',
          terminal_statuses: ['Applied'],
          timeout_ms: 120000,
        },
      },
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
    await expect(
      client.getAccountAssets(TAIRA_ACCOUNT_ID, { accept: 'application/x-norito' as never })
    ).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID, { limit: 0 })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID, { offset: -1 })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID, { assetId: ` ${TAIRA_XOR_ASSET_ID} ` })).rejects.toThrow(
      IrohaToriiMcpError
    );
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID, { query: [] as never })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ account: NEXUS_ACCOUNT_ID })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ authority: 'not-i105' })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ page: -1 })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ perPage: 0 })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ block: 0 })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ transactionHash: 'not-a-hash' })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ transactionStatus: 'pending' as never })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getInstructions({ kind: ' Transfer ' })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getTransactionStatus('not-a-hash')).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.getTransactionStatus(HASH, { scope: 'bad' as never })).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.submitTransactionAndWait(new Uint8Array(), HASH)).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.submitTransactionAndWait('not-norito' as never, HASH)).rejects.toThrow(IrohaToriiMcpError);
    await expect(client.submitTransactionAndWait(new Uint8Array([1]), 'a'.repeat(64))).rejects.toThrow(
      IrohaToriiMcpError
    );
    await expect(client.getAssetDefinitions({ headers: { host: 'bad' } as never })).rejects.toThrow(IrohaToriiMcpError);
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
                  headers: COMPLETE_FANOUT_HEADERS,
                  content_type: 'application/json',
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

  it('rejects nested routed redirects even with complete fanout evidence', async () => {
    const client = new IrohaToriiWalletClient({
      fetchFn: vi.fn(async () =>
        rpcResult({
          isError: false,
          structuredContent: {
            status: 302,
            headers: COMPLETE_FANOUT_HEADERS,
            content_type: 'application/json',
            body: { items: [] },
          },
        })
      ),
    });

    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID)).rejects.toMatchObject({
      message: 'iroha_mcp_route_error',
      status: 302,
    });
  });

  it('fails closed on incomplete fanout reads even when Torii returns HTTP 200', async () => {
    const client = new IrohaToriiWalletClient({
      fetchFn: vi.fn(async () =>
        rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: {
              'x-iroha-fanout-routes-attempted': '5',
              'x-iroha-fanout-routes-succeeded': '1',
              'x-iroha-fanout-routes-failed': '4',
              'x-iroha-fanout-routes-denied': '0',
              'x-iroha-fanout-routes-unavailable': '4',
              'x-iroha-fanout-routes-not-found': '0',
            },
            body: { items: [] },
          },
        })
      ),
    });

    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID)).rejects.toMatchObject({
      message: 'iroha_torii_partial_response',
      data: {
        fanout: {
          attempted: 5,
          succeeded: 1,
          failed: 4,
          unavailable: 4,
        },
      },
    });
  });

  it('rejects routed reads that omit all fanout evidence', async () => {
    const client = new IrohaToriiWalletClient({
      fetchFn: vi.fn(async () =>
        rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: {},
            content_type: 'application/json',
            body: { items: [] },
          },
        })
      ),
    });

    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID)).rejects.toMatchObject({
      message: 'invalid_fanout_headers',
    });
  });

  it('rejects direct routed HTTP reads that omit all fanout evidence', async () => {
    const client = new IrohaToriiWalletClient({
      fetchFn: vi.fn(
        async () =>
          new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
      ),
    });

    await expect(client.getAssetDefinitions()).rejects.toMatchObject({
      message: 'invalid_fanout_headers',
    });
  });

  it('rejects a routed response that claims zero attempted routes', async () => {
    const client = new IrohaToriiWalletClient({
      fetchFn: vi.fn(async () =>
        rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: {
              'x-iroha-fanout-routes-attempted': '0',
              'x-iroha-fanout-routes-succeeded': '0',
              'x-iroha-fanout-routes-failed': '0',
              'x-iroha-fanout-routes-denied': '0',
              'x-iroha-fanout-routes-unavailable': '0',
              'x-iroha-fanout-routes-not-found': '0',
            },
            body: { items: [] },
          },
        })
      ),
    });

    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID)).rejects.toMatchObject({
      message: 'invalid_fanout_headers',
    });
  });

  it('rejects overflowing fanout counter totals without unsafe arithmetic', async () => {
    const maximum = String(Number.MAX_SAFE_INTEGER);
    const client = new IrohaToriiWalletClient({
      fetchFn: vi.fn(async () =>
        rpcResult({
          isError: false,
          structuredContent: {
            status: 200,
            headers: {
              'x-iroha-fanout-routes-attempted': maximum,
              'x-iroha-fanout-routes-succeeded': '0',
              'x-iroha-fanout-routes-failed': maximum,
              'x-iroha-fanout-routes-denied': maximum,
              'x-iroha-fanout-routes-unavailable': maximum,
              'x-iroha-fanout-routes-not-found': maximum,
            },
            body: { items: [] },
          },
        })
      ),
    });

    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID)).rejects.toMatchObject({
      message: 'invalid_fanout_headers',
    });
  });

  it('rejects submit-and-wait hash mismatches instead of reporting transfer success', async () => {
    const mismatchedHash = `${'c'.repeat(63)}d`;
    const client = new IrohaToriiWalletClient({
      fetchFn: vi.fn(async (_input: string | URL, init?: RequestInit) => {
        const request = JSON.parse(init?.body as string);

        return rpcResult(
          {
            isError: false,
            structuredContent: {
              ...submitAndWaitResult(),
              submit: {
                ...submitAndWaitResult().submit,
                body: { tx_hash_hex: mismatchedHash },
              },
            },
          },
          request.id
        );
      }),
    });

    await expect(client.submitTransactionAndWait(new Uint8Array([1, 2, 3]), HASH)).rejects.toMatchObject({
      message: 'iroha_transaction_receipt_mismatch',
    });
  });

  it('rejects submit-and-wait responses that omit the final transaction hash', async () => {
    const result = submitAndWaitResult();
    const client = new IrohaToriiWalletClient({
      fetchFn: vi.fn(async (_input: string | URL, init?: RequestInit) => {
        const request = JSON.parse(init?.body as string);

        return rpcResult(
          {
            isError: false,
            structuredContent: {
              ...result,
              final_status: {
                ...result.final_status,
                body: { status: { kind: 'Applied' } },
              },
            },
          },
          request.id
        );
      }),
    });

    await expect(client.submitTransactionAndWait(new Uint8Array([1, 2, 3]), HASH)).rejects.toMatchObject({
      message: 'iroha_transaction_receipt_mismatch',
    });
  });
});
