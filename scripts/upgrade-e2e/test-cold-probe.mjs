import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { coldProbeSource } from './cold-probe.mjs';

const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  const sent = [];
  const timers = new Map();
  let tick = 0;
  let onMessage;
  let onDisconnect;
  let disconnected = false;
  const context = vm.createContext({
    chrome: { runtime: { connect: () => ({
      onMessage: { addListener: (callback) => { onMessage = callback; } },
      onDisconnect: { addListener: (callback) => { onDisconnect = callback; } },
      postMessage: (request) => sent.push(request),
      disconnect: () => { disconnected = true; },
    }) } },
    setTimeout: (callback, ms) => { const id = ++tick; timers.set(id, { callback, ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  vm.runInContext(coldProbeSource, context);
  return {
    sent, timers, context,
    reply: (id, response) => onMessage({ id, response }),
    drop: () => onDisconnect(),
    disconnected: () => disconnected,
    settle: () => {
      const entry = [...timers.entries()].find(([, timer]) => timer.ms === 1500);
      assert.ok(entry, 'later checks wait until first responses have been captured');
      timers.delete(entry[0]); entry[1].callback();
    },
  };
}

test('first responses are sent immediately and cannot be overwritten by later responses', async () => {
  const f = fixture();
  assert.deepEqual(f.sent.map(({ id }) => id), ['c1', 'c2', 'c3']);
  f.reply('c1', false); f.reply('c2', true); f.reply('c3', false);
  await flush();
  assert.equal(f.context.__fwColdStartProbe.hasMasterPassword, false);
  f.settle(); await flush();
  assert.deepEqual(f.sent.map(({ id }) => id), ['c1', 'c2', 'c3', 'c4', 'c5']);
  f.reply('c4', true); f.reply('c5', true); await flush();
  assert.equal(f.context.__fwColdStartProbe.phase, 'complete');
  assert.equal(f.context.__fwColdStartProbe.hasMasterPassword, false);
  assert.equal(f.context.__fwColdStartProbe.hasMasterPasswordLater, true);
  assert.equal(f.context.__fwColdStartProbe.keyringIsLocked, false);
  assert.equal(f.context.__fwColdStartProbe.keyringIsLockedLater, true);
  assert.equal(f.timers.size, 0);
  assert.equal(f.disconnected(), true);
});

test('a worker disconnect reports unanswered first requests instead of retrying them', async () => {
  const f = fixture(); f.drop(); await flush();
  f.settle(); await flush();
  const result = f.context.__fwColdStartProbe;
  assert.equal(result.phase, 'complete');
  assert.equal(result.hasMasterPassword.unanswered, true);
  assert.equal(result.hasMasterPassword.dropped, 'disconnected');
  assert.equal(result.hasMasterPasswordLater.unanswered, 'pri(keyring.hasMasterPassword)');
  assert.equal(f.sent.length, 3);
  assert.equal(f.timers.size, 0);
});

test('a missing answer stays a failure even when a later answer is healthy', async () => {
  const f = fixture();
  f.reply('c2', true); f.reply('c3', true);
  [...f.timers.values()].find(({ ms }) => ms === 60000).callback();
  await flush(); f.settle(); await flush();
  f.reply('c4', true); f.reply('c5', true); await flush();
  assert.equal(f.context.__fwColdStartProbe.hasMasterPassword.unanswered, 'pri(keyring.hasMasterPassword)');
  assert.equal(f.context.__fwColdStartProbe.hasMasterPasswordLater, true);
  assert.equal(f.context.__fwColdStartProbe.phase, 'complete');
});
