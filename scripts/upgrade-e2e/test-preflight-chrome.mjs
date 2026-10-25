import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { preflightArguments, preflightChrome, validateSandboxHelper } from './preflight-chrome.mjs';

const sandboxStat = (overrides = {}) => (file) => file === '/opt/chrome/chrome-sandbox'
  ? { isFile: () => true, uid: 0, gid: 0, mode: 0o104755, ...overrides }
  : { isDirectory: () => true, uid: 0, mode: 0o40755 };

test('sandbox helper validation accepts a protected system helper and rejects writable or unprivileged replacements', () => {
  const file = '/opt/chrome/chrome-sandbox';
  assert.equal(validateSandboxHelper(file, sandboxStat()), file);
  for (const override of [{ uid: 1000 }, { gid: 1000 }, { mode: 0o100755 }, { mode: 0o104777 }, { isFile: () => false }])
    assert.throws(() => validateSandboxHelper(file, sandboxStat(override)), /root-owned regular file/);
  assert.throws(() => validateSandboxHelper(file, (entry) => entry === file
    ? sandboxStat()(entry) : { isDirectory: () => true, uid: 1000, mode: 0o40755 }), /parent directories/);
});

test('probe arguments retain sandboxing and restrict the browser to a disposable offline extension', () => {
  const args = preflightArguments({ profileDir: '/temporary/profile', extDir: '/temporary/extension', port: 12345 });
  assert(args.includes('--user-data-dir=/temporary/profile'));
  assert(args.includes('--load-extension=/temporary/extension'));
  assert(args.includes('--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost'));
  assert(!args.some((arg) => /(?:no-sandbox|disable-setuid-sandbox|disable-seccomp|disable-namespace|disable-web-security)/.test(arg)));
});

async function ownedProbe(source, callback, options = {}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'fearless-preflight-test-'));
  let child;
  const call = () => preflightChrome({
    binary: process.execPath, platform: 'test', temporaryRoot, timeoutMs: 1000,
    spawnImpl: (_binary, _args, spawnOptions) => {
      child = spawn(process.execPath, ['-e', source], spawnOptions);
      return child;
    },
    fetchImpl: async () => { throw new Error('not ready'); },
    ...options,
  });
  try {
    await callback(call);
    assert(child.exitCode !== null || child.signalCode !== null, 'owned child must be stopped');
    assert.deepEqual(readdirSync(temporaryRoot), [], 'disposable profile and extension must be removed');
  } finally {
    if (child?.exitCode === null && child?.signalCode === null) child.kill('SIGKILL');
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

test('an early browser exit fails promptly with bounded stderr and cleans its profile', async () => {
  const started = Date.now();
  await ownedProbe("process.stderr.write('x'.repeat(40000) + '\\nNo usable sandbox!\\n', () => process.exit(23))", async (run) => {
    await assert.rejects(run, (error) => {
      assert.match(error.message, /code=23/);
      assert.match(error.message, /No usable sandbox!/);
      assert(error.message.length < 13_000);
      return true;
    });
  }, { timeoutMs: 20_000 });
  assert(Date.now() - started < 5000, 'do not wait out the readiness timeout after an early exit');
});

test('a silent browser times out, reports the last startup condition and cleans its child', async () => {
  await ownedProbe('setInterval(() => {}, 1000)', async (run) => {
    await assert.rejects(run, /startup timed out.*not ready/);
  }, { timeoutMs: 150 });
});

test('a responding DevTools endpoint is insufficient without an extension worker', async () => {
  await ownedProbe('setInterval(() => {}, 1000)', async (run) => {
    await assert.rejects(run, /probe extension worker is missing/);
  }, { timeoutMs: 150, fetchImpl: async (url) => ({ ok: true, json: async () => url.endsWith('/json/version') ? { Browser: 'Chrome/147' } : [] }) });
});

test('success requires both browser readiness and the disposable extension worker, then cleans up', async () => {
  await ownedProbe('setInterval(() => {}, 1000)', async (run) => {
    assert.deepEqual(await run(), { browser: 'Chrome/147', extensionWorkerReady: true, sandboxHelper: null });
  }, { fetchImpl: async (url) => ({ ok: true, json: async () => url.endsWith('/json/version')
    ? { Browser: 'Chrome/147' } : [{ type: 'service_worker', url: `chrome-extension://${'a'.repeat(32)}/background.js` }] }) });
});

test('an executable that cannot start reports a spawn error and removes temporary files', async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'fearless-preflight-missing-'));
  try {
    await assert.rejects(preflightChrome({ binary: join(temporaryRoot, 'missing'), platform: 'test', temporaryRoot }), /Chrome could not start.*ENOENT/);
    assert.deepEqual(readdirSync(temporaryRoot), []);
  } finally { rmSync(temporaryRoot, { recursive: true, force: true }); }
});
