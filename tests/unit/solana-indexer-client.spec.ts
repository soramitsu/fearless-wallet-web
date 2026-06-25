import {
  SolanaIndexerClient,
  SolanaIndexerError,
  isExpectedSolanaIndexerServiceInfo,
} from '@extension-base/services/solana-indexer-service';

const WALLET = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const MINT = 'So11111111111111111111111111111111111111112';
const SIGNATURE =
  '5Nf8p3dZAbCdEfGhijkLmNoPqRsTuVwXyZ123456789ABCDEFGHJKLMNPQRSTUVWXYZabcd';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

describe('SolanaIndexerClient', () => {
  it('fetches and verifies SI service identity', async () => {
    const calls: string[] = [];
    const serviceInfo = {
      schemaVersion: 1,
      serviceId: 'si.soramitsu.io',
      serviceName: 'Solswap Indexer',
      ecosystem: 'solana',
      chainId: 'solana:mainnet',
      network: 'mainnet',
      publicBaseUrl: 'https://si.soramitsu.io',
      readOnly: true,
      capabilities: ['wallet-transactions'],
      endpoints: {
        transactions: '/api/indexer/v1/accounts/{wallet}/txs',
      },
    };
    const client = new SolanaIndexerClient(
      'https://si.soramitsu.io/',
      vi.fn(async (input: string | URL) => {
        calls.push(input.toString());
        return jsonResponse(serviceInfo);
      })
    );

    await expect(client.verifyServiceInfo()).resolves.toEqual(serviceInfo);
    expect(isExpectedSolanaIndexerServiceInfo(serviceInfo)).toBe(true);
    expect(isExpectedSolanaIndexerServiceInfo({ ...serviceInfo, serviceId: 'ti.soramitsu.io' })).toBe(false);
    expect(isExpectedSolanaIndexerServiceInfo({ ...serviceInfo, readOnly: false })).toBe(false);
    expect(calls).toEqual(['https://si.soramitsu.io/api/indexer/v1/service-info']);
  });

  it('rejects misrouted SI service identity before wallet reads use it', async () => {
    const serviceInfo = {
      schemaVersion: 1,
      serviceId: 'ti.soramitsu.io',
      serviceName: 'TON Indexer',
      ecosystem: 'ton',
      chainId: 'ton:mainnet',
      network: 'mainnet',
      publicBaseUrl: 'https://ti.soramitsu.io',
      readOnly: true,
      capabilities: ['account-transactions'],
      endpoints: {
        transactions: '/api/indexer/v1/accounts/{addr}/txs',
      },
    };
    const client = new SolanaIndexerClient(
      'https://si.soramitsu.io/',
      vi.fn(async () => jsonResponse(serviceInfo))
    );

    await expect(client.verifyServiceInfo()).rejects.toMatchObject({
      name: 'SolanaIndexerError',
      message: 'unexpected_service_info',
      body: serviceInfo,
    });
  });

  it('builds read-only wallet endpoint URLs against SI by default', async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL) => {
      calls.push(input.toString());
      return jsonResponse({ wallet: WALLET, ok: true });
    });
    const client = new SolanaIndexerClient(undefined, fetchFn);

    await client.getBalances(WALLET);
    await client.getAssets(WALLET);
    await client.getState(WALLET);
    await client.getTransactions(WALLET, { limit: 25, before: SIGNATURE });

    expect(calls).toEqual([
      `https://si.soramitsu.io/api/indexer/v1/accounts/${WALLET}/balances`,
      `https://si.soramitsu.io/api/indexer/v1/accounts/${WALLET}/assets`,
      `https://si.soramitsu.io/api/indexer/v1/accounts/${WALLET}/state`,
      `https://si.soramitsu.io/api/indexer/v1/accounts/${WALLET}/txs?limit=25&before=${SIGNATURE}`,
    ]);
  });

  it('builds token metadata requests and serializes batch bodies', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), init });
      return jsonResponse({
        mint: MINT,
        exists: true,
        extensions: ['transferFeeConfig', 'transferHook'],
        transferFeeConfig: { withheldAmount: '0' },
        transferHook: { programId: WALLET, extraAccountMetasAddress: WALLET },
      });
    });
    const client = new SolanaIndexerClient('https://si.soramitsu.io/', fetchFn);

    const metadata = await client.getTokenMetadata(MINT);
    await client.getTokenMetadataBatch([MINT]);

    expect(metadata.extensions).toEqual(['transferFeeConfig', 'transferHook']);
    expect(metadata.transferFeeConfig?.withheldAmount).toBe('0');
    expect(metadata.transferHook?.programId).toBe(WALLET);
    expect(metadata.transferHook?.extraAccountMetasAddress).toBe(WALLET);
    expect(calls[0]).toEqual({
      url: `https://si.soramitsu.io/api/indexer/v1/tokens/${MINT}/metadata`,
      init: undefined,
    });
    expect(calls[1]?.url).toBe('https://si.soramitsu.io/api/indexer/v1/tokens/metadata');
    expect(calls[1]?.init?.method).toBe('POST');
    expect(calls[1]?.init?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(calls[1]?.init?.body as string)).toEqual({ mints: [MINT] });
  });

  it('rejects invalid wallets, cursors, limits, and metadata batches before fetch', async () => {
    const fetchFn = vi.fn();
    const client = new SolanaIndexerClient('https://si.soramitsu.io', fetchFn);

    expect(() => client.getBalances('../bad')).toThrow(SolanaIndexerError);
    expect(() => client.getTransactions(WALLET, { before: '../../../bad' })).toThrow(SolanaIndexerError);
    expect(() => client.getTransactions(WALLET, { limit: 0 })).toThrow(SolanaIndexerError);
    expect(() => client.getTransactions(WALLET, { limit: 251 })).toThrow(SolanaIndexerError);
    expect(() => client.getTokenMetadataBatch([])).toThrow(SolanaIndexerError);
    expect(() => client.getTokenMetadataBatch(new Array(101).fill(MINT))).toThrow(SolanaIndexerError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS remote base URLs but allows localhost tests', () => {
    expect(() => new SolanaIndexerClient('http://si.soramitsu.io', vi.fn())).toThrow(SolanaIndexerError);
    expect(() => new SolanaIndexerClient('http://localhost:3000', vi.fn())).not.toThrow();
    expect(() => new SolanaIndexerClient('http://127.0.0.1:3000', vi.fn())).not.toThrow();
  });

  it('throws typed errors for indexer HTTP failures and malformed JSON', async () => {
    const httpFailure = new SolanaIndexerClient('https://si.soramitsu.io', vi.fn(async () => jsonResponse({ error: 'nope' }, 503)));

    await expect(httpFailure.getBalances(WALLET)).rejects.toMatchObject({
      name: 'SolanaIndexerError',
      status: 503,
      body: { error: 'nope' },
    });

    const malformed = new SolanaIndexerClient(
      'https://si.soramitsu.io',
      vi.fn(async () => new Response('{not-json', { status: 200 }))
    );

    await expect(malformed.getBalances(WALLET)).rejects.toMatchObject({
      name: 'SolanaIndexerError',
      message: 'invalid_json',
    });
  });
});
