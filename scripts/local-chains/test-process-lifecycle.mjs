import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { spawnLocalProcess, stopLocalProcess } from './process-lifecycle.mjs';

const options = { stdio: ['ignore', 'ignore', 'pipe'] };

test('a missing binary reports startup failure and leaves cleanup safe', async () => {
  const cleanup = [];
  const owned = spawnLocalProcess(`/nonexistent/fearless-test-${process.pid}`, [], options, cleanup);
  assert.equal(cleanup.length, 1);
  await new Promise((resolve) => owned.child.once('error', resolve));
  assert.throws(owned.assertRunning, /Unable to start/);
  await cleanup[0]();
});

test('a daemon that never becomes ready is owned immediately and stopped', async () => {
  const cleanup = [];
  const owned = spawnLocalProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options, cleanup);
  await once(owned.child, 'spawn');
  owned.assertRunning();
  try {
    assert.equal(cleanup.length, 1);
    await cleanup[0]();
    assert.throws(() => process.kill(owned.child.pid, 0), { code: 'ESRCH' });
  } finally { await stopLocalProcess(owned.child, 50); }
});

test('an early nonzero exit retains bounded diagnostics and needs no shutdown wait', async () => {
  const cleanup = [];
  const owned = spawnLocalProcess(process.execPath, ['-e', 'process.stderr.write("x".repeat(3000)); process.exitCode = 2'], options, cleanup);
  await once(owned.child, 'exit');
  assert.throws(owned.assertRunning, /exited before readiness \(2\)/);
  assert.equal(owned.diagnostic().length, 2000);
  await cleanup[0]();
});

test('a daemon ignoring TERM is killed and reaped before shutdown resolves', async () => {
  const cleanup = [];
  const owned = spawnLocalProcess(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); process.stderr.write("ready"); setInterval(() => {}, 1000)'], options, cleanup);
  await once(owned.child.stderr, 'data');
  try {
    await stopLocalProcess(owned.child, 50);
    assert.equal(owned.child.signalCode, 'SIGKILL');
    assert.throws(() => process.kill(owned.child.pid, 0), { code: 'ESRCH' });
  } finally { await stopLocalProcess(owned.child, 50); }
});
