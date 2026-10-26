#!/usr/bin/env node
// Offline regression against packaged extensions. Only public, unfunded fixtures;
// never load a user's browser profile or contact a chain.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { getRounds } from 'bcryptjs';
import { cdp, devtools, freePort, launch, openPopup, reloadExtension, serviceWorker, stop, waitFor } from './upgrade-e2e/chrome.mjs';

const args = process.argv.slice(2);
const option = name => {
  const value = args[args.indexOf(name) + 1];
  assert(args.includes(name) && value && !value.startsWith('--'), `Required: ${name}`);
  return path.resolve(value);
};
const legacyZip = option('--legacy-zip');
const candidateZip = option('--candidate-zip');
const out = option('--out');
const password = 'Public-security-regression-20261026';
const phrase = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-security-fixes-'));
const extDir = path.join(work, 'extension');
const profileDir = path.join(work, 'profile');
const port = await freePort();
const report = {
  startedAt: new Date().toISOString(), node: process.version,
  publicUnfundedFixturesOnly: true, externalNetworkBlocked: true,
  timerMethod: 'Invoke the unchanged captured 1800000 ms callback; separately advance worker clock without firing timers.',
  legacyZipSha256: createHash('sha256').update(await fs.readFile(legacyZip)).digest('hex'),
  candidateZipSha256: createHash('sha256').update(await fs.readFile(candidateZip)).digest('hex'),
  checks: [],
};
let browser, sw, popup, originalId;
const check = (name, value) => { report.checks.push({ name, passed: !!value }); assert(value, name); };
const shutdown = async () => {
  popup?.close(); sw?.close();
  if (browser) await stop(browser);
  browser = undefined;
};
const start = async (zip, profile = profileDir) => {
  await shutdown();
  await fs.rm(extDir, { recursive: true, force: true });
  await fs.mkdir(extDir);
  execFileSync('unzip', ['-q', zip, '-d', extDir]);
  browser = launch({ profileDir: profile, extDir, port });
  await waitFor(async () => (await devtools(port, '/json/version')).ok, 30000, 'Chrome');
  report.browser = (await (await devtools(port, '/json/version')).json()).Browser;
  // A restart alone can reuse a cached worker (especially with same-version
  // candidates). Explicitly reload so the installed bytes actually run.
  if (originalId) {
    const reloaded = await reloadExtension(port, originalId);
    assert.equal(reloaded.reload, 'ok', 'Candidate extension reload failed');
  }
  const worker = await serviceWorker(port);
  const id = new URL(worker.url).hostname;
  if (originalId) assert.equal(id, originalId, 'Package identity must remain unchanged');
  originalId = id;
  sw = cdp(worker.webSocketDebuggerUrl, { timeoutMs: 45000 });
  await sw.ready;
  popup = await openPopup(port, id);
  await call('pri(app.isReady)');
};
const call = async (message, request) => {
  const result = await popup.call(message, request);
  assert(!result.err, `${message} failed`);
  return result.ok;
};
const storage = () => sw.eval('chrome.storage.local.get(null)');
const keys = records => Object.fromEntries(Object.entries(records)
  .filter(([key]) => /^fw:(account|ton):/.test(key)).sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => [key, Object.fromEntries(
    ['address', 'publicKeyHex', 'encoded', 'encoding', 'cipherSeed', 'pendingCipherSeed']
      .filter(field => value[field] !== undefined).map(field => [field, value[field]])
  )]));
const captureTimer = () => sw.eval(`(() => {
  const original = globalThis.setTimeout;
  globalThis.__securityOriginalTimeout = original;
  globalThis.__securityCallbacks = [];
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === 1800000) globalThis.__securityCallbacks.push(() => callback(...args));
    return original(callback, delay, ...args);
  }; return true;
})()`);
const awaitLockedReload = async () => {
  await waitFor(async () => await popup.eval('typeof window.__send === "function" && window.__securitySecret === undefined && /^#\\/unlock/.test(location.hash)'),
    30000, 'wallet document discarded on lock');
  check('locked background reports locked', await call('pri(keyring.keyringIsLocked)') === true);
  check('background password cleared', await call('pri(keyring.getPassword)') === '');
};
try {
  await start(legacyZip);
  check('original wallet password created', await call('pri(keyring.changePassword)', { oldPassword: '', newPassword: password }) === true);
  const address = await call('pri(accounts.create)', {
    suri: phrase, type: 'sr25519', walletEcosystem: 'substrate', meta: { name: 'Public security fixture' },
  });
  const before = await storage();
  check('original package writes cost 6', getRounds(before['fw:keyring'].passwordHash) === 6);

  await start(candidateZip);
  check('startup leaves all legacy key ciphertext unchanged', JSON.stringify(keys(await storage())) === JSON.stringify(keys(before)));
  check('startup does not rewrite verifier without password', (await storage())['fw:keyring'].passwordHash === before['fw:keyring'].passwordHash);
  const wrong = await popup.call('pri(keyring.unlock)', { password: password + '!' });
  check('incorrect password rejected', wrong.ok !== true);
  check('incorrect password leaves verifier unchanged', (await storage())['fw:keyring'].passwordHash === before['fw:keyring'].passwordHash);
  await captureTimer();
  check('legacy password unlocks', await call('pri(keyring.unlock)', { password }) === true);
  const migrated = await storage();
  check('unlock durably migrates verifier to cost 12', getRounds(migrated['fw:keyring'].passwordHash) === 12);
  check('verifier migration preserves account ciphertext', JSON.stringify(keys(migrated)) === JSON.stringify(keys(before)));
  check('unlocked phrase still exports', (await call('pri(keyring.export.mnemonic)', { address, walletEcosystem: 'substrate' })).seed === phrase);
  await popup.eval(`window.__securitySecret = ${JSON.stringify(phrase)}; true`);
  const count = await sw.eval(`(() => {
    const callbacks = globalThis.__securityCallbacks.splice(0);
    globalThis.setTimeout = globalThis.__securityOriginalTimeout;
    callbacks.forEach(callback => callback()); return callbacks.length;
  })()`);
  check('exactly one real 30 minute deadline callback ran', count === 1);
  await awaitLockedReload();
  const expiredExport = await popup.call('pri(keyring.export.mnemonic)', { address, walletEcosystem: 'substrate' });
  check('expired session cannot export recovery phrase', !!expiredExport.err || expiredExport.ok?.seed === '');

  check('password still unlocks after expiry', await call('pri(keyring.unlock)', { password }) === true);
  check('strong verifier remains byte-identical', (await storage())['fw:keyring'].passwordHash === migrated['fw:keyring'].passwordHash);
  await popup.eval(`window.__securitySecret = ${JSON.stringify(phrase)}; true`);
  await sw.eval('globalThis.__securityOriginalNow = Date.now; Date.now = () => globalThis.__securityOriginalNow() + 1800001; true');
  // Dispatch the read without awaiting a response in a document being discarded.
  await popup.eval("window.__send('pri(keyring.keyringIsLocked)', null).catch(() => {}); true");
  await awaitLockedReload();
  await sw.eval('Date.now = globalThis.__securityOriginalNow; true');
  check('delayed timer expiry leaves stored keys unchanged', JSON.stringify(keys(await storage())) === JSON.stringify(keys(before)));

  await start(legacyZip);
  check('previous 4.2.0 package accepts stronger verifier after rollback', await call('pri(keyring.unlock)', { password }) === true);
  check('rollback exports original recovery phrase', (await call('pri(keyring.export.mnemonic)', { address, walletEcosystem: 'substrate' })).seed === phrase);
  await start(candidateZip, path.join(work, 'fresh-profile'));
  check('new candidate wallet password created', await call('pri(keyring.changePassword)', { oldPassword: '', newPassword: password }) === true);
  check('new wallet verifier uses cost 12', getRounds((await storage())['fw:keyring'].passwordHash) === 12);
  check('password rotation succeeds', await call('pri(keyring.changePassword)', { oldPassword: password, newPassword: password + '-rotated' }) === true);
  check('rotated password verifier uses cost 12', getRounds((await storage())['fw:keyring'].passwordHash) === 12);
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  await shutdown();
  await fs.rm(work, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
