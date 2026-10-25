#!/usr/bin/env node

import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import test from 'node:test';

import { boundedRequest } from './audit-taira-release-readiness.mjs';

async function within(promise, milliseconds) {
  let watchdog;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('HTTP regression watchdog expired')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(watchdog);
  }
}

test('Taira HTTP requests settle and release connections on every outcome', { timeout: 20_000 }, async () => {
  const sockets = new Set();
  const requests = new Map();
  const responseClosed = new Map();
  const serverTimers = new Set();
  let trickleChunks = 0;
  const server = http.createServer((request, response) => {
    responseClosed.set(request.url, new Promise((resolve) => response.once('close', resolve)));
    if (request.url === '/success') {
      const body = [];
      request.on('data', (chunk) => body.push(chunk));
      request.on('end', () => {
        assert.equal(request.method, 'POST');
        assert.equal(Buffer.concat(body).toString(), 'request body');
        response.writeHead(201, { 'content-type': 'application/octet-stream', 'x-audit-fixture': 'ok' });
        response.write(Buffer.from([0, 255]));
        response.end(Buffer.from([65]));
      });
    } else if (request.url === '/truncated') {
      response.writeHead(200, { 'content-length': '1000' });
      response.write('partial');
      const timer = setTimeout(() => response.destroy(), 20);
      serverTimers.add(timer);
    } else if (request.url === '/status') {
      response.writeHead(503);
      response.write('unavailable');
      // Deliberately never end: status rejection must cancel the response.
    } else if (request.url === '/oversize') {
      response.writeHead(200);
      response.write(Buffer.alloc(1_048_577));
      // Deliberately never end: the byte limit must cancel the response.
    } else if (request.url === '/trickle') {
      response.writeHead(200);
      response.write('.');
      const timer = setInterval(() => {
        trickleChunks += 1;
        response.write('.');
      }, 75);
      serverTimers.add(timer);
      response.once('close', () => clearInterval(timer));
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  const originalRequest = https.request;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    // Only this test redirects transport. The production URL, TLS policy and
    // fixed deadlines remain unchanged and are asserted at the bridge boundary.
    https.request = (url, options, callback) => {
      assert.equal(url.origin, 'https://taira.sora.org');
      assert.equal(options.minVersion, 'TLSv1.2');
      assert.equal(options.rejectUnauthorized, true);
      assert.equal(options.agent, false);
      assert.equal(options.timeout, 10_000);
      const request = http.request({
        host: '127.0.0.1', port: server.address().port, path: url.pathname,
        method: options.method, headers: options.headers, agent: false, timeout: options.timeout,
      }, callback);
      requests.set(url.pathname, request);
      return request;
    };

    const success = await within(boundedRequest('/success', { method: 'POST', body: 'request body' }), 2_000);
    assert.equal(success.status, 201);
    assert.equal(success.headers['x-audit-fixture'], 'ok');
    assert.deepEqual(success.body, Buffer.from([0, 255, 65]));

    for (const [path, expected] of [
      ['/truncated', /aborted|premature|ECONNRESET/u],
      ['/status', /returned HTTP 503/u],
      ['/oversize', /exceeded 1048576 bytes/u],
    ]) {
      await assert.rejects(within(boundedRequest(path), 2_000), expected);
      assert.equal(requests.get(path).destroyed, true, `${path} must close the request`);
      assert.ok(responseClosed.has(path), `${path} must reach the local response fixture`);
      await within(responseClosed.get(path), 1_000);
    }

    const started = Date.now();
    await assert.rejects(within(boundedRequest('/trickle'), 14_000), /timed out/u);
    assert.ok(Date.now() - started >= 9_000, 'the test must exercise the production ten-second deadline');
    assert.ok(trickleChunks > 80, 'frequent bytes must keep the socket inactivity timeout from firing');
    assert.equal(requests.get('/trickle').destroyed, true);
    await within(responseClosed.get('/trickle'), 1_000);
  } finally {
    https.request = originalRequest;
    for (const timer of serverTimers) clearTimeout(timer);
    for (const request of requests.values()) request.destroy();
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
