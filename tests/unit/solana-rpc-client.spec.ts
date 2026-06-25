import { SolanaRpcClient, SolanaRpcError } from '@extension-base/services/solana-rpc-service';

const TRANSACTION = 'AQIDBA==';
const BLOCKHASH = '7GjNiPun3AzEazTZoFEjZgcBMeuaXdpjHq2raZTmTrfs';
const SIGNATURE =
  '5NfHnqDyzT9qyfxZDq2sSskAMGuFZ3VRqW4EQxghKqrKYdKq6cZNW1J34w7qE6nGx1eDQe5s2eKxB2ZtE1xU9qgN';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

const rpcResponse = (id: number, result: unknown): Response =>
  jsonResponse({
    id,
    jsonrpc: '2.0',
    result,
  });

describe('SolanaRpcClient', () => {
  it('uses configured Solana RPC endpoints for blockhash, simulation, and broadcast', async () => {
    const calls: Array<{ body: unknown; headers?: HeadersInit; url: string }> = [];
    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      calls.push({ body, headers: init?.headers, url: input.toString() });

      if (body.method === 'getLatestBlockhash') {
        return rpcResponse(body.id, {
          context: { apiVersion: '2.0.0', slot: 123 },
          value: { blockhash: BLOCKHASH, lastValidBlockHeight: 456 },
        });
      }
      if (body.method === 'getFeeForMessage') {
        return rpcResponse(body.id, {
          context: { slot: 124 },
          value: 5000,
        });
      }
      if (body.method === 'getMinimumBalanceForRentExemption') {
        return rpcResponse(body.id, 890_880);
      }
      if (body.method === 'simulateTransaction') {
        return rpcResponse(body.id, {
          context: { slot: 124 },
          value: {
            err: null,
            logs: ['Program log: ok'],
            replacementBlockhash: { blockhash: BLOCKHASH, lastValidBlockHeight: 789 },
            unitsConsumed: 321,
          },
        });
      }

      return rpcResponse(body.id, SIGNATURE);
    });
    const client = new SolanaRpcClient({ fetchFn, network: 'devnet' });

    await expect(client.getLatestBlockhash('finalized')).resolves.toEqual({
      context: { apiVersion: '2.0.0', slot: 123 },
      value: { blockhash: BLOCKHASH, lastValidBlockHeight: 456 },
    });
    await expect(client.getFeeForMessage(TRANSACTION, 'confirmed')).resolves.toEqual({
      context: { slot: 124 },
      value: 5000,
    });
    await expect(client.getMinimumBalanceForRentExemption(165, 'processed')).resolves.toBe(890_880);
    await expect(client.simulateTransaction(TRANSACTION, { commitment: 'processed' })).resolves.toEqual({
      context: { slot: 124 },
      value: {
        accounts: undefined,
        err: null,
        logs: ['Program log: ok'],
        replacementBlockhash: { blockhash: BLOCKHASH, lastValidBlockHeight: 789 },
        returnData: undefined,
        unitsConsumed: 321,
      },
    });
    await expect(
      client.sendRawTransaction(TRANSACTION, {
        maxRetries: 3,
        preflightCommitment: 'confirmed',
        skipPreflight: true,
      })
    ).resolves.toBe(SIGNATURE);

    expect(calls).toEqual([
      {
        body: {
          id: 1,
          jsonrpc: '2.0',
          method: 'getLatestBlockhash',
          params: [{ commitment: 'finalized' }],
        },
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        url: 'https://api.devnet.solana.com',
      },
      {
        body: {
          id: 2,
          jsonrpc: '2.0',
          method: 'getFeeForMessage',
          params: [
            TRANSACTION,
            {
              commitment: 'confirmed',
            },
          ],
        },
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        url: 'https://api.devnet.solana.com',
      },
      {
        body: {
          id: 3,
          jsonrpc: '2.0',
          method: 'getMinimumBalanceForRentExemption',
          params: [
            165,
            {
              commitment: 'processed',
            },
          ],
        },
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        url: 'https://api.devnet.solana.com',
      },
      {
        body: {
          id: 4,
          jsonrpc: '2.0',
          method: 'simulateTransaction',
          params: [
            TRANSACTION,
            {
              commitment: 'processed',
              encoding: 'base64',
              replaceRecentBlockhash: true,
              sigVerify: false,
            },
          ],
        },
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        url: 'https://api.devnet.solana.com',
      },
      {
        body: {
          id: 5,
          jsonrpc: '2.0',
          method: 'sendTransaction',
          params: [
            TRANSACTION,
            {
              encoding: 'base64',
              maxRetries: 3,
              preflightCommitment: 'confirmed',
              skipPreflight: true,
            },
          ],
        },
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        url: 'https://api.devnet.solana.com',
      },
    ]);
  });

  it('rejects unsafe URLs, malformed transactions, and invalid options before fetch', async () => {
    const fetchFn = vi.fn();
    const client = new SolanaRpcClient({ fetchFn });

    expect(() => new SolanaRpcClient({ fetchFn, network: 'bad' as never })).toThrow(SolanaRpcError);
    expect(() => new SolanaRpcClient({ fetchFn, rpcUrl: 'http://api.mainnet-beta.solana.com' })).toThrow(SolanaRpcError);
    expect(() => new SolanaRpcClient({ fetchFn, rpcUrl: 'http://localhost:8899' })).not.toThrow();
    expect(() => client.getLatestBlockhash('recent' as never)).toThrow(SolanaRpcError);
    expect(() => client.getFeeForMessage('not base64')).toThrow(SolanaRpcError);
    expect(() => client.getMinimumBalanceForRentExemption(-1)).toThrow(SolanaRpcError);
    expect(() => client.getMinimumBalanceForRentExemption(10_000_001)).toThrow(SolanaRpcError);
    expect(() => client.simulateTransaction('not base64')).toThrow(SolanaRpcError);
    expect(() => client.simulateTransaction(TRANSACTION, { replaceRecentBlockhash: true, sigVerify: true })).toThrow(
      SolanaRpcError
    );
    await expect(client.sendRawTransaction(TRANSACTION, { maxRetries: 11 })).rejects.toThrow(SolanaRpcError);
    await expect(client.sendRawTransaction(TRANSACTION, { preflightCommitment: 'bad' as never })).rejects.toThrow(
      SolanaRpcError
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('throws typed errors for HTTP failures, JSON-RPC errors, malformed JSON, and bad shapes', async () => {
    const httpFailure = new SolanaRpcClient({
      fetchFn: vi.fn(async () => jsonResponse({ error: 'down' }, 503)),
    });
    await expect(httpFailure.getLatestBlockhash()).rejects.toMatchObject({
      body: { error: 'down' },
      name: 'SolanaRpcError',
      status: 503,
    });

    const rpcFailure = new SolanaRpcClient({
      fetchFn: vi.fn(async () =>
        jsonResponse({
          error: { code: -32002, data: { logs: [] }, message: 'simulation failed' },
          id: 1,
          jsonrpc: '2.0',
        })
      ),
    });
    await expect(rpcFailure.getLatestBlockhash()).rejects.toMatchObject({
      body: { code: -32002, data: { logs: [] }, message: 'simulation failed' },
      message: 'solana_rpc_error',
      name: 'SolanaRpcError',
    });

    const malformedJson = new SolanaRpcClient({
      fetchFn: vi.fn(async () => new Response('{bad-json', { status: 200 })),
    });
    await expect(malformedJson.getLatestBlockhash()).rejects.toMatchObject({
      message: 'invalid_json',
      name: 'SolanaRpcError',
    });

    const mismatchedId = new SolanaRpcClient({
      fetchFn: vi.fn(async () => jsonResponse({ id: 2, jsonrpc: '2.0', result: {} })),
    });
    await expect(mismatchedId.getLatestBlockhash()).rejects.toMatchObject({
      message: 'invalid_rpc_response',
      name: 'SolanaRpcError',
    });

    const badSimulation = new SolanaRpcClient({
      fetchFn: vi.fn(async () =>
        rpcResponse(1, {
          context: { slot: 1 },
          value: { err: null, logs: [1] },
        })
      ),
    });
    await expect(badSimulation.simulateTransaction(TRANSACTION)).rejects.toMatchObject({
      message: 'invalid_simulation_response',
      name: 'SolanaRpcError',
    });

    const badFee = new SolanaRpcClient({
      fetchFn: vi.fn(async () =>
        rpcResponse(1, {
          context: { slot: 1 },
          value: -1,
        })
      ),
    });
    await expect(badFee.getFeeForMessage(TRANSACTION)).rejects.toMatchObject({
      message: 'invalid_fee_response',
      name: 'SolanaRpcError',
    });

    const unavailableFee = new SolanaRpcClient({
      fetchFn: vi.fn(async () =>
        rpcResponse(1, {
          context: { slot: 1 },
          value: null,
        })
      ),
    });
    await expect(unavailableFee.getFeeForMessage(TRANSACTION)).resolves.toEqual({
      context: { slot: 1 },
      value: null,
    });

    const badRent = new SolanaRpcClient({
      fetchFn: vi.fn(async () => rpcResponse(1, '890880')),
    });
    await expect(badRent.getMinimumBalanceForRentExemption(165)).rejects.toMatchObject({
      message: 'invalid_rent_response',
      name: 'SolanaRpcError',
    });

    const badSignature = new SolanaRpcClient({
      fetchFn: vi.fn(async () => rpcResponse(1, 'not-a-signature')),
    });
    await expect(badSignature.sendRawTransaction(TRANSACTION)).rejects.toMatchObject({
      message: 'invalid_signature_response',
      name: 'SolanaRpcError',
    });
  });
});
