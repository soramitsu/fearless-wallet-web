// Minimal JSON-RPC client for a local `bitcoind -regtest` used only by the
// local-chain send tests. It never talks to mainnet or testnet.

export function createBitcoindRpc({ url, user, password }) {
  const authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  let nextId = 1;

  async function call(method, params = [], wallet) {
    const response = await fetch(wallet ? `${url}/wallet/${encodeURIComponent(wallet)}` : url, {
      body: JSON.stringify({ id: nextId++, jsonrpc: '1.0', method, params }),
      headers: { authorization, 'content-type': 'application/json' },
      method: 'POST',
    });
    const text = await response.text();
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

export async function waitForBitcoind(rpc, { timeoutMs = 30_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await rpc.call('getblockchaininfo');
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`bitcoind did not become ready: ${lastError?.message ?? 'timeout'}`);
}
