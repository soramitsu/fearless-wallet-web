import assert from 'node:assert/strict';
import test from 'node:test';
import { createBitcoindRpc } from './bitcoind-rpc.mjs';

const rpc = () => createBitcoindRpc({ url: 'http://127.0.0.1:18443', user: 'test', password: 'test' });

test('a setup mining deadline does not carry over to broadcasts or later mining', async (t) => {
  const deadlines = [];
  const requests = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    deadlines.push(ms);
    return new AbortController().signal;
  });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ result: 'accepted', error: null }));
  });
  const client = rpc();

  assert.equal(await client.call('generatetoaddress', [101, 'miner'], undefined, { timeoutMs: 60_000 }), 'accepted');
  assert.equal(await client.call('sendrawtransaction', ['signed-transaction']), 'accepted');
  assert.equal(await client.call('generatetoaddress', [1, 'miner']), 'accepted');
  assert.deepEqual(deadlines, [60_000, 10_000, 10_000]);
  assert.deepEqual(requests.map(({ method }) => method), ['generatetoaddress', 'sendrawtransaction', 'generatetoaddress']);
});

test('non-mining overrides and unbounded mining deadlines fail before any request', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('Unexpected RPC request'));
  const client = rpc();

  for (const method of ['createwallet', 'sendtoaddress', 'sendrawtransaction']) {
    await assert.rejects(client.call(method, [], undefined, { timeoutMs: 60_000 }), /Only local block generation/);
  }
  for (const timeoutMs of [0, -1, 60_001, Infinity, NaN, 1.5]) {
    await assert.rejects(client.call('generatetoaddress', [], undefined, { timeoutMs }), /between 1 and 60000/);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('timed-out mining and broadcast calls fail with method context and are never replayed', async (t) => {
  let controller;
  t.mock.method(AbortSignal, 'timeout', () => {
    controller = new AbortController();
    return controller.signal;
  });
  const fetch = t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const client = rpc();

  for (const method of ['generatetoaddress', 'sendrawtransaction']) {
    const callsBefore = fetch.mock.callCount();
    const pending = client.call(method, ['private-request-data'], undefined,
      method === 'generatetoaddress' ? { timeoutMs: 60_000 } : undefined);
    const error = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    controller.abort(error);

    await assert.rejects(pending, (failure) => {
      assert.equal(failure.name, 'TimeoutError');
      assert.equal(failure.cause, error);
      assert.equal(failure.message, `bitcoind ${method}: The operation was aborted due to timeout`);
      assert.ok(!failure.message.includes('private-request-data'));
      return true;
    });
    assert.equal(fetch.mock.callCount() - callsBefore, 1);
  }
});

test('a node rejection keeps its RPC error code and is not retried', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    result: null, error: { code: -26, message: 'txn-mempool-conflict' },
  }), { status: 500 }));

  await assert.rejects(rpc().call('sendrawtransaction', ['signed-transaction']), {
    message: 'bitcoind sendrawtransaction: txn-mempool-conflict', code: -26, rpcMessage: 'txn-mempool-conflict',
  });
  assert.equal(fetch.mock.callCount(), 1);
});
