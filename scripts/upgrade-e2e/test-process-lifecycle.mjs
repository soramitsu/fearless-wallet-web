import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { stopOwnedProcess } from './process-lifecycle.mjs';

test('cleanup recognizes both normal and signalled child exits without waiting for a past event', async () => {
  const kill = () => assert.fail('must not signal a child that already exited');
  await stopOwnedProcess({ exitCode: 0, signalCode: null, kill });
  await stopOwnedProcess({ exitCode: null, signalCode: 'SIGTERM', kill });
  await stopOwnedProcess(undefined);
});

test('cleanup escalates only its owned child when that child ignores SIGTERM', async () => {
  const child = spawn(
    process.execPath,
    ['-e', "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000)"],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  );
  try {
    await once(child.stdout, 'data');
    await stopOwnedProcess(child, { graceMs: 20, forceMs: 1000 });
    assert.equal(child.signalCode, 'SIGKILL');
    assert.equal(child.listenerCount('exit'), 0);
    assert.equal(child.listenerCount('error'), 0);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
});
