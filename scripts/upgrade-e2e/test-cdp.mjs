import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cdp } from './cdp.mjs';

function connection(options = {}) {
  let socket;
  class Socket {
    constructor() {
      socket = this;
      this.sent = [];
    }
    send(value) {
      this.sent.push(JSON.parse(value));
    }
    close() {
      this.onclose?.();
    }
  }
  const client = cdp('ws://localhost/test', { WebSocketImpl: Socket, timeoutMs: 20, ...options });
  return { client, socket };
}

test('a disconnected target rejects the request immediately and keeps the caller stack', async () => {
  const { client, socket } = connection();
  socket.onopen();
  await client.ready;
  const request = client.eval('public test secret');
  await Promise.resolve();
  socket.close();
  await assert.rejects(request, (error) => {
    assert.match(error.message, /connection closed.*Runtime.evaluate/);
    assert.match(error.stack, /test-cdp.mjs/);
    assert.doesNotMatch(error.message, /public test secret/);
    return true;
  });
});

test('protocol errors fail instead of returning an undefined successful answer', async () => {
  const { client, socket } = connection();
  socket.onopen();
  const request = client.eval('1');
  await Promise.resolve();
  socket.onmessage({ data: JSON.stringify({ id: 1, error: { code: -32000, message: 'target gone' } }) });
  await assert.rejects(request, /protocol error -32000.*Runtime.evaluate/);
  client.close();
});

test('successful and failed evaluations preserve their results', async () => {
  const { client, socket } = connection();
  socket.onopen();
  const request = client.eval('true');
  await Promise.resolve();
  socket.onmessage({ data: JSON.stringify({ id: 1, result: { result: { value: true } } }) });
  assert.equal(await request, true);
  const exception = client.eval('throw new Error()');
  await Promise.resolve();
  socket.onmessage({ data: JSON.stringify({ id: 2, result: { exceptionDetails: { text: 'test exception' } } }) });
  await assert.rejects(exception, /test exception/);
  client.close();
});

test('a missing answer times out and a late answer cannot settle the next request', async () => {
  const { client, socket } = connection();
  socket.onopen();
  await assert.rejects(client.eval('never completes'), /No answer within 20 ms/);
  const next = client.eval('true');
  await Promise.resolve();
  socket.onmessage({ data: JSON.stringify({ id: 1, result: { result: { value: false } } }) });
  socket.onmessage({ data: JSON.stringify({ id: 2, result: { result: { value: true } } }) });
  assert.equal(await next, true);
  client.close();
});

test('connection failure and timeout reject readiness', async () => {
  const failed = connection();
  failed.socket.onerror();
  await assert.rejects(failed.client.ready, /connection failed/);
  const timedOut = connection({ connectTimeoutMs: 10 });
  await assert.rejects(timedOut.client.ready, /connection timed out/);
});
