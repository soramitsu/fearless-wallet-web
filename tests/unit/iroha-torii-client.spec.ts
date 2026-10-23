import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  IrohaToriiError,
  IrohaToriiWalletClient,
  IrohaTransactionRejectedError,
  IrohaTransactionStatusUnknownError,
} from '@extension-base/services/iroha-torii-service';

const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../docs/universal-wallet-v2-vectors.json'), 'utf8')) as {
  vectors: Array<{ expected: { iroha: { nexus: { i105: string }; taira: { i105: string } } } }>;
};

const TAIRA_ACCOUNT_ID = fixture.vectors[0].expected.iroha.taira.i105;
const NEXUS_ACCOUNT_ID = fixture.vectors[0].expected.iroha.nexus.i105;
const XOR = '6TEAJqbb8oEPmLncoNiMRbLEK6tw';
const HASH = `${'ab'.repeat(31)}a1`;
const NETWORK_ID = 'hash:4978D0BD15FC32B834672B27BBD8A03653B1DF060A1EEE7E9374D29AF3886D91#6774';
const SIGNED_TRANSACTION = Uint8Array.of(1, 2, 3, 4);

type FetchCall = { url: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    status,
  });
}

function statusBody(kind: string, resolvedFrom = 'state', extra: Record<string, unknown> = {}) {
  return { hash: HASH, scope: 'global', resolved_from: resolvedFrom, status: { kind, block_height: 9, ...extra } };
}

function createClient(responses: Array<Response | Error | (() => Response | Promise<Response>)>, options = {}) {
  const calls: FetchCall[] = [];
  const queue = [...responses];
  const fetchFn = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });

    const next = queue.shift();

    if (!next) throw new Error(`unexpected request ${String(url)}`);
    if (next instanceof Error) throw next;

    return typeof next === 'function' ? next() : next;
  });
  const client = new IrohaToriiWalletClient({ baseUrl: 'https://taira.sora.org', fetchFn, network: 'taira', ...options });

  return { calls, client, fetchFn };
}

describe('Iroha Torii REST client', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads account assets through the Torii REST route with bounded cursor paging', async () => {
    const page = { items: [{ account_id: TAIRA_ACCOUNT_ID, asset: XOR, quantity: '1.5', scope: 'global' }], next_cursor: 'AQ_next-1' };
    const { calls, client } = createClient([jsonResponse(page)]);

    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID, { cursor: 'AQ_prev' })).resolves.toMatchObject({
      body: page,
      status: 200,
    });

    const url = new URL(calls[0].url);

    expect(url.origin).toBe('https://taira.sora.org');
    expect(decodeURIComponent(url.pathname)).toBe(`/v1/accounts/${TAIRA_ACCOUNT_ID}/assets`);
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.get('cursor')).toBe('AQ_prev');
    expect(calls[0].init).toMatchObject({
      credentials: 'omit',
      method: 'GET',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    expect(calls[0].init.headers).toEqual({ accept: 'application/json' });
  });

  it('passes the history filter to Torii and never calls MCP', async () => {
    const { calls, client } = createClient([jsonResponse({ items: [], next_cursor: null })]);
    const filter = `asset_definition_id = "${XOR}" and type = "TRANSFER"`;

    await client.getAccountHistory(TAIRA_ACCOUNT_ID, { filter, limit: 25 });

    const url = new URL(calls[0].url);

    expect(decodeURIComponent(url.pathname)).toBe(`/v1/accounts/${TAIRA_ACCOUNT_ID}/history`);
    expect(url.searchParams.get('filter')).toBe(filter);
    expect(url.searchParams.get('limit')).toBe('25');
    expect(calls.every(({ url: requested }) => !requested.includes('/v1/mcp'))).toBe(true);
  });

  it('rejects malformed pages, cursors, filters, limits and foreign-network accounts before or after the request', async () => {
    const { client, fetchFn } = createClient([
      jsonResponse({ items: {}, next_cursor: null }),
      jsonResponse({ items: [], next_cursor: 'bad cursor' }),
      jsonResponse({ items: [] }),
    ]);

    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID)).rejects.toThrow('invalid_iroha_page_response');
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID)).rejects.toThrow('invalid_iroha_page_response');
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID)).rejects.toThrow('invalid_iroha_page_response');
    await expect(client.getAccountAssets(NEXUS_ACCOUNT_ID)).rejects.toThrow('invalid_account_id');
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID, { cursor: 'a/b' })).rejects.toThrow('invalid_cursor');
    await expect(client.getAccountHistory(TAIRA_ACCOUNT_ID, { filter: 'type = "A"\n' })).rejects.toThrow('invalid_filter');
    await expect(client.getAccountAssets(TAIRA_ACCOUNT_ID, { limit: 101 })).rejects.toThrow('invalid_limit');
    await expect(client.getAssetDefinition('not base58!')).rejects.toThrow('invalid_asset_id');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('maps Torii JSON errors, non-JSON media and oversized bodies to typed failures', async () => {
    const { client } = createClient([
      jsonResponse({ code: 'query_validation_failed', message: 'invalid account_id' }, 400),
      new Response('<html/>', { headers: { 'content-type': 'text/html' }, status: 200 }),
      new Response('{}', { headers: { 'content-length': String(2_000_000), 'content-type': 'application/json' } }),
      new Response('{"items":', { headers: { 'content-type': 'application/json' }, status: 200 }),
      new Response('<html>Bad Gateway</html>', { headers: { 'content-type': 'text/html' }, status: 502 }),
    ]);

    const error = await client.getAccountAssets(TAIRA_ACCOUNT_ID).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(IrohaToriiError);
    expect(error).toMatchObject({ code: 'query_validation_failed', message: 'invalid account_id', status: 400 });
    await expect(client.getParameters()).rejects.toThrow('invalid_json_content_type');
    await expect(client.getNodeCapabilities()).rejects.toThrow('iroha_response_too_large');
    await expect(client.getParameters()).rejects.toThrow('invalid_json');
    // A gateway error page keeps its HTTP status so a submission stays recognisably ambiguous.
    await expect(client.getParameters()).rejects.toMatchObject({ message: 'iroha_torii_http_502', status: 502 });
  });

  it('turns transport failures into timeout and network errors', async () => {
    const hanging = () => new Promise<Response>(() => undefined);
    const { client } = createClient([new TypeError('Failed to fetch'), hanging], { timeoutMs: 5 });

    await expect(client.getParameters()).rejects.toThrow('iroha_network_error');
    await expect(client.getParameters()).rejects.toThrow('iroha_request_timeout');
  });

  it('accepts only https or loopback Torii origins and strips a stored MCP path', () => {
    const fetchFn = vi.fn();

    expect(() => new IrohaToriiWalletClient({ baseUrl: 'http://taira.sora.org', fetchFn })).toThrow('invalid_base_url');
    expect(() => new IrohaToriiWalletClient({ baseUrl: 'https://user:pass@taira.sora.org', fetchFn })).toThrow('invalid_base_url');
    expect(() => new IrohaToriiWalletClient({ baseUrl: 'https://taira.sora.org?x=1', fetchFn })).toThrow('invalid_base_url');
    expect(() => new IrohaToriiWalletClient({ baseUrl: 'http://127.0.0.1:8080', fetchFn })).not.toThrow();
    expect(() => new IrohaToriiWalletClient({ headers: { cookie: 'x' } as never, fetchFn })).toThrow('invalid_header');

    const { calls, client } = createClient([jsonResponse({})], { baseUrl: 'https://taira.sora.org/v1/mcp/' });

    return client.getParameters().then(() => {
      expect(calls[0].url).toBe('https://taira.sora.org/v1/parameters');
    });
  });

  it('reads the network identity from the genesis block and rejects anything else', async () => {
    const { client } = createClient([
      jsonResponse({ hash: NETWORK_ID, height: 1, prev_block_hash: null }),
      jsonResponse({ hash: NETWORK_ID, height: 2, prev_block_hash: null }),
      jsonResponse({ hash: NETWORK_ID.toLowerCase(), height: 1, prev_block_hash: null }),
    ]);

    await expect(client.getNetworkId()).resolves.toBe(NETWORK_ID);
    await expect(client.getNetworkId()).rejects.toThrow('invalid_iroha_genesis_block');
    await expect(client.getNetworkId()).rejects.toThrow('invalid_iroha_genesis_block');
  });

  it('treats only the exact not-found status code as an unknown transaction', async () => {
    const { calls, client } = createClient([
      jsonResponse({ code: 'pipeline_transaction_status_not_found', message: 'none' }, 404),
      jsonResponse({ code: 'route_not_found', message: 'no route' }, 404),
      jsonResponse({ ...statusBody('Applied'), hash: HASH.replace('ab', 'cd') }),
    ]);

    await expect(client.getTransactionStatus(HASH)).resolves.toBeNull();
    await expect(client.getTransactionStatus(HASH)).rejects.toThrow('no route');
    await expect(client.getTransactionStatus(HASH)).rejects.toThrow('invalid_iroha_transaction_status');
    expect(calls[0].url).toBe(`https://taira.sora.org/v1/pipeline/transactions/status?hash=${HASH}&scope=global`);
    await expect(client.getTransactionStatus(`${'ab'.repeat(31)}a0`)).rejects.toThrow('invalid_hash');
  });

  it('submits exact versioned Norito bytes and checks the receipt hash', async () => {
    const receipt = { payload: { signed_transaction_hash: `hash:${HASH.toUpperCase()}#ABCD` } };
    const { calls, client } = createClient([
      jsonResponse(receipt, 202),
      jsonResponse({ payload: { signed_transaction_hash: `hash:${'cd'.repeat(31)}c1#ABCD` } }, 202),
      jsonResponse({ code: 'already_committed', message: 'duplicate' }, 409),
      jsonResponse({ code: 'queue_nexus_fee_rejected', message: 'fee bound' }, 422),
    ]);

    await expect(client.submitTransaction(SIGNED_TRANSACTION, HASH)).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      init: { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-norito' } },
      url: 'https://taira.sora.org/v1/pipeline/transactions',
    });
    expect(Array.from(calls[0].init.body as Uint8Array)).toEqual([1, 2, 3, 4]);
    await expect(client.submitTransaction(SIGNED_TRANSACTION, HASH)).rejects.toThrow('iroha_transaction_receipt_mismatch');
    await expect(client.submitTransaction(SIGNED_TRANSACTION, HASH)).resolves.toBeUndefined();
    await expect(client.submitTransaction(SIGNED_TRANSACTION, HASH)).rejects.toMatchObject({
      code: 'queue_nexus_fee_rejected',
      status: 422,
    });
    await expect(client.submitTransaction(Uint8Array.of(2, 1), HASH)).rejects.toThrow('invalid_signed_transaction');
  });

  it('waits for state-resolved Applied finality, ignoring cached and pending answers', async () => {
    const { client } = createClient([
      jsonResponse({ code: 'pipeline_transaction_status_not_found', message: 'none' }, 404),
      jsonResponse(statusBody('Queued', 'cache')),
      jsonResponse(statusBody('Applied', 'cache')),
      new TypeError('Failed to fetch'),
      jsonResponse(statusBody('Applied')),
    ]);

    await expect(client.waitForTransactionApplied(HASH, { pollIntervalMs: 50, timeoutMs: 5_000 })).resolves.toMatchObject({
      blockHeight: 9,
      hash: HASH,
    });
  });

  it('reports rejected and expired transactions with the node reason', async () => {
    const { client } = createClient([
      jsonResponse(statusBody('Rejected', 'state', { reason: 'insufficient funds' })),
      jsonResponse(statusBody('Expired')),
    ]);

    const rejected = await client.waitForTransactionApplied(HASH).catch((caught: unknown) => caught);

    expect(rejected).toBeInstanceOf(IrohaTransactionRejectedError);
    expect(rejected).toMatchObject({ kind: 'Rejected', reason: 'insufficient funds' });
    await expect(client.waitForTransactionApplied(HASH)).rejects.toThrow(`Transaction ${HASH} was expired.`);
  });

  it('reports an unknown outcome instead of a failure when finality is not observed in time', async () => {
    const notFound = () => jsonResponse({ code: 'pipeline_transaction_status_not_found', message: 'none' }, 404);
    const { client } = createClient(Array.from({ length: 50 }, () => notFound));

    const error = await client
      .waitForTransactionApplied(HASH, { pollIntervalMs: 50, timeoutMs: 120 })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(IrohaTransactionStatusUnknownError);
    expect(error).toMatchObject({ transactionHash: HASH });
  });

  it('reconciles an ambiguous submission by status but surfaces definitive rejections immediately', async () => {
    const ambiguous = createClient([
      new TypeError('Failed to fetch'),
      jsonResponse(statusBody('Applied')),
      new Response('<html>Gateway Timeout</html>', { headers: { 'content-type': 'text/html' }, status: 504 }),
      jsonResponse(statusBody('Applied')),
    ]);

    await expect(
      ambiguous.client.submitTransactionAndWait(SIGNED_TRANSACTION, HASH, { pollIntervalMs: 50, timeoutMs: 5_000 })
    ).resolves.toMatchObject({ hash: HASH });
    await expect(
      ambiguous.client.submitTransactionAndWait(SIGNED_TRANSACTION, HASH, { pollIntervalMs: 50, timeoutMs: 5_000 })
    ).resolves.toMatchObject({ hash: HASH });

    const definitive = createClient([jsonResponse({ code: 'invalid_transaction_payload', message: 'bad bytes' }, 400)]);

    await expect(definitive.client.submitTransactionAndWait(SIGNED_TRANSACTION, HASH)).rejects.toThrow('bad bytes');
    expect(definitive.fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([500, 501, 502, 503, 504])('reconciles HTTP %i without posting a replacement', async (status) => {
    const { client, fetchFn } = createClient([
      jsonResponse({ message: 'server error after submission' }, status),
      jsonResponse(statusBody('Applied')),
    ]);

    await expect(client.submitTransactionAndWait(SIGNED_TRANSACTION, HASH)).resolves.toMatchObject({ hash: HASH });
    expect(fetchFn.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'GET']);
  });

  it('reconciles a broken response body and malformed successful receipt against the original hash', async () => {
    const brokenBody = new Response(new ReadableStream({
      start(controller) { controller.error(new TypeError('connection lost while reading')); },
    }), { status: 202 });
    const { client, fetchFn } = createClient([
      brokenBody,
      jsonResponse(statusBody('Applied')),
      jsonResponse({ payload: { signed_transaction_hash: 'malformed' } }, 202),
      jsonResponse(statusBody('Applied')),
    ]);

    await expect(client.submitTransactionAndWait(SIGNED_TRANSACTION, HASH)).resolves.toMatchObject({ hash: HASH });
    await expect(client.submitTransactionAndWait(SIGNED_TRANSACTION, HASH)).resolves.toMatchObject({ hash: HASH });
    expect(fetchFn.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'GET', 'POST', 'GET']);
  });
});
