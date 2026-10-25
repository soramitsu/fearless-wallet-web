import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { openResponsivePopup, popupResponseProbeSource } from './popup-retry.mjs';

function popup(answer, events, name) {
  return {
    eval: async () => {
      events.push(`${name}:request`);
      if (answer instanceof Error) throw answer;
      return answer;
    },
    close: () => events.push(`${name}:disconnect`),
    closeTarget: async () => events.push(`${name}:close`),
  };
}

test('a responsive popup stays open and is returned without retrying', async () => {
  const events = [];
  const ready = popup(true, events, 'ready');
  assert.equal(await openResponsivePopup({ open: async () => ready }), ready);
  assert.deepEqual(events, ['ready:request']);
});

test('the next popup wakes an idle worker after an update disconnects the first popup', async () => {
  const events = [];
  let workerAwake = false;
  let opened = 0;
  const ready = popup(true, events, 'ready');
  const result = await openResponsivePopup({
    open: async () => {
      events.push('open');
      if (++opened === 1) return popup(new Error('DevTools connection closed'), events, 'stale');
      // With no popup and no incoming event, this worker remains asleep indefinitely. The retry must open a
      // new popup before it can wait for any response, rather than wait for a service-worker target first.
      assert.equal(workerAwake, false);
      workerAwake = true;
      return ready;
    },
    diagnose: async () => events.push('diagnose'),
  });
  assert.equal(result, ready);
  assert.equal(workerAwake, true);
  assert.deepEqual(events, ['open', 'stale:request', 'diagnose', 'stale:disconnect', 'stale:close', 'open', 'ready:request']);
});

test('three unanswered popups fail explicitly and every failed page is closed', async () => {
  const events = [];
  let opened = 0;
  await assert.rejects(
    openResponsivePopup({ open: async () => popup(false, events, `attempt${++opened}`) }),
    /did not answer accounts.subscribe after 3 attempts/
  );
  assert.equal(opened, 3);
  assert.equal(events.filter((event) => event.endsWith(':close')).length, 3);
});

test('a diagnostic failure still closes the unanswered popup and fails the run', async () => {
  const events = [];
  await assert.rejects(openResponsivePopup({
    open: async () => popup(false, events, 'stale'),
    diagnose: async () => { throw new Error('diagnostic write failed'); },
  }), /diagnostic write failed/);
  assert.deepEqual(events, ['stale:request', 'stale:disconnect', 'stale:close']);
});

test('readiness requires a received reply, not a rejected send on a disconnected port', async () => {
  for (const kind of ['success', 'background-error', 'disconnected-port']) {
    const window = { __replies: 7 };
    window.__send = async (message) => {
      assert.equal(message, 'pri(accounts.subscribe)');
      if (kind !== 'disconnected-port') window.__replies++;
      if (kind !== 'success') throw new Error(kind);
      return [];
    };
    const result = await runInNewContext(popupResponseProbeSource, { window, setTimeout: () => {} });
    assert.equal(result, kind !== 'disconnected-port', kind);
  }
});

test('an unanswered port completes the readiness probe within its unchanged deadline', async () => {
  let finish;
  const probe = runInNewContext(popupResponseProbeSource, {
    window: { __replies: 0, __send: () => new Promise(() => {}) },
    setTimeout: (callback, ms) => { assert.equal(ms, 20000); finish = callback; },
  });
  finish();
  assert.equal(await probe, false);
});
