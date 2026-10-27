// Minimal JSON-RPC client for a local `bitcoind -regtest` used only by the
// local-chain send tests. It never talks to mainnet or testnet.

export function createBitcoindRpc({ url, user, password }) {
  const authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  let nextId = 1;

  async function call(method, params = [], wallet, { timeoutMs = 10_000 } = {}) {
    // Only local block generation may opt into a longer deadline. In particular,
    // funding and broadcast requests keep their deadline and are never retried.
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
      throw new Error('bitcoind RPC timeout must be between 1 and 60000 ms');
    }
    if (timeoutMs !== 10_000 && method !== 'generatetoaddress') {
      throw new Error('Only local block generation may override the bitcoind RPC timeout');
    }
    let response;
    let text;

    try {
      response = await fetch(wallet ? `${url}/wallet/${encodeURIComponent(wallet)}` : url, {
        body: JSON.stringify({ id: nextId++, jsonrpc: '1.0', method, params }),
        headers: { authorization, 'content-type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await response.text();
    } catch (cause) {
      const error = new Error(`bitcoind ${method}: ${cause.message}`, { cause });

      error.name = cause.name;
      throw error;
    }
    let body;

    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`bitcoind ${method} returned HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    if (body.error) {
      const error = new Error(`bitcoind ${method}: ${body.error.message}`);

      error.code = body.error.code;
      error.rpcMessage = body.error.message;
      throw error;
    }

    return body.result;
  }

  return { call };
}

export async function waitForBitcoind(rpc, { timeoutMs = 30_000, checkRunning = () => {} } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    checkRunning();
    try {
      return await rpc.call('getblockchaininfo');
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`bitcoind did not become ready: ${lastError?.message ?? 'timeout'}`);
}
