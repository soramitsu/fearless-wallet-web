import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { captureBrowserDiagnostics, createBrowserDiagnostics, extensionDiagnosticInfo, extensionWorkerId } from './browser-diagnostics.mjs';

const SECRET = 'private-wallet-value-that-must-never-be-persisted';
const child = () => Object.assign(new EventEmitter(), { stderr: new PassThrough() });
const recorder = (options = {}) => createBrowserDiagnostics(child(), { file: 'unused', write() {}, ...options });

test('browser stderr remains bounded and persists native categories without arbitrary messages or console output', () => {
  const browser = child();
  const capture = createBrowserDiagnostics(browser, { file: 'unused', write() {} });
  browser.stderr.write('x'.repeat(40_000));
  browser.stderr.write(`\n[12:34:date:ERROR:zygote_host_impl_linux.cc(128)] No usable sandbox! ${SECRET}\n`);
  browser.stderr.write(`[12:34:date:INFO:CONSOLE(1)] ${SECRET}\n`);
  const value = capture.snapshot('worker-timeout');
  assert.equal(value.stderr.tailBytes, 12 * 1024);
  assert.deepEqual(value.stderr.entries, [{ severity: 'ERROR', source: 'zygote_host_impl_linux.cc', line: 128, category: 'sandbox' }]);
  assert(value.stderr.omittedLines > 0);
  assert(!JSON.stringify(value).includes(SECRET));
});

test('browser spawn errors and exit status are recorded without raw error messages', () => {
  const browser = child();
  const capture = createBrowserDiagnostics(browser, { file: 'unused', write() {} });
  browser.emit('error', Object.assign(new Error(SECRET), { code: 'EACCES' }));
  browser.emit('exit', null, 'SIGABRT');
  const value = capture.snapshot(SECRET);
  assert.equal(value.reason, 'other');
  assert.deepEqual({ ...value.process, startedAt: undefined }, {
    startedAt: undefined, spawnError: 'EACCES', exited: true, exitCode: null, signal: 'SIGABRT',
  });
  assert(!JSON.stringify(value).includes(SECRET));
});

test('target history retains bounded transitions and removes titles, IDs, paths, query strings and fragment data', () => {
  const capture = recorder();
  const target = { type: 'service_worker', title: SECRET, id: SECRET,
    url: `chrome-extension://${'a'.repeat(32)}/${SECRET}/background.js?secret=${SECRET}#${SECRET}` };
  capture.observeTargets([target]);
  capture.observeTargets([target]);
  assert.equal(capture.snapshot('popup-unanswered').targetLifecycle.length, 1);
  for (let i = 0; i < 20; i++) capture.observeTargets(i % 2 ? [target] : []);
  const value = capture.snapshot('popup-unanswered');
  assert.equal(value.targetLifecycle.length, 12);
  assert.deepEqual(value.targetLifecycle.at(-1).targets, [{ type: 'service_worker', location: { scheme: 'extension', page: 'background.js' } }]);
  assert(!JSON.stringify(value).includes(SECRET));
});

test('extension metadata excludes runtime messages and restricts stack frames to safe locations and numeric coordinates', () => {
  const value = extensionDiagnosticInfo({ state: 'ENABLED', version: '3.0.6', runtimeErrorCount: 7, manifestErrorCount: 0,
    runtimeErrors: [{ message: SECRET, severity: 'ERROR', source: `chrome-extension://${'a'.repeat(32)}/background.js?${SECRET}`,
      frames: [{ functionName: SECRET, url: `https://example.invalid/${SECRET}`, line: 5, column: 9 },
        { url: SECRET, line: SECRET, column: -1 }] }],
  });
  assert.equal(value.runtimeErrorCount, 7);
  assert.equal(value.version, '3.0.6');
  assert.deepEqual(value.runtimeErrors[0].frames[0], { source: { scheme: 'https:' }, line: 5, column: 9 });
  assert(!JSON.stringify(value).includes(SECRET));
});

test('successful capture writes only sanitized diagnostics and records a vanished worker', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'upgrade-diagnostics-test-'));
  try {
    const file = join(dir, 'browser-diagnostics.json');
    const capture = createBrowserDiagnostics(child(), { file });
    capture.observeTargets([{ type: 'service_worker', url: `chrome-extension://${'a'.repeat(32)}/background.js` }]);
    const value = await captureBrowserDiagnostics(capture, 'popup-unanswered', {
      inspectTargets: async () => [{ type: 'page', url: `about:blank#${SECRET}`, title: SECRET }],
      inspectExtension: async () => ({ state: 'ENABLED', version: '3.0.6', runtimeErrorCount: 0, manifestErrorCount: 0 }),
    });
    assert.equal(value.persisted, true);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(saved.inspection, 'complete');
    assert.equal(saved.targetLifecycle.length, 2);
    assert.equal(saved.extension.state, 'ENABLED');
    assert(!JSON.stringify(saved).includes(SECRET));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a stalled diagnostic request has a separate deadline, aborts and still preserves bounded prior observations', async () => {
  let signal;
  let saved;
  const started = Date.now();
  const value = await captureBrowserDiagnostics(recorder({ write: (_file, text) => { saved = JSON.parse(text); } }), 'scenario-failure', {
    timeoutMs: 20,
    inspectTargets: async (input) => { signal = input; return new Promise(() => {}); },
    inspectExtension: async () => assert.fail('must not inspect extension without targets'),
  });
  assert(Date.now() - started < 1000);
  assert.equal(signal.aborted, true);
  assert.equal(value.inspection, 'unavailable-or-timed-out');
  assert.equal(saved.reason, 'scenario-failure');
});

test('diagnostic read and write failures cannot mask the original scenario failure or leak exception text', async () => {
  const value = await captureBrowserDiagnostics(recorder({ write() { throw new Error(SECRET); } }), 'scenario-failure', {
    inspectTargets: async () => { throw new Error(SECRET); }, inspectExtension: async () => ({}),
  });
  assert.equal(value.inspection, 'unavailable-or-timed-out');
  assert.equal(value.persisted, false);
  assert(!JSON.stringify(value).includes(SECRET));
  assert.equal(await captureBrowserDiagnostics(undefined, 'scenario-failure'), undefined);
});


test('a browser crash during inspection is reflected in the persisted process and stderr snapshot', async () => {
  const browser = child();
  let saved;
  const capture = createBrowserDiagnostics(browser, { file: 'unused', write: (_file, text) => { saved = JSON.parse(text); } });
  await captureBrowserDiagnostics(capture, 'scenario-failure', {
    timeoutMs: 20,
    inspectTargets: async () => {
      browser.stderr.write('[12:34:date:FATAL:browser_main_loop.cc(10)] crash\n');
      browser.emit('exit', null, 'SIGSEGV');
      return new Promise(() => {});
    },
    inspectExtension: async () => ({}),
  });
  assert.equal(saved.process.exited, true);
  assert.equal(saved.process.signal, 'SIGSEGV');
  assert.equal(saved.stderr.entries[0].category, 'crash');
});

test('missing extension metadata is unavailable, not a successful inspection', async () => {
  const value = await captureBrowserDiagnostics(recorder(), 'scenario-failure', {
    inspectTargets: async () => [], inspectExtension: async () => undefined,
  });
  assert.equal(value.inspection, 'unavailable-or-timed-out');
  assert.equal(value.extension, undefined);
});


test('diagnostics identify the wallet background worker instead of the first component-extension target', () => {
  const id = 'a'.repeat(32);
  assert.equal(extensionWorkerId([
    { type: 'service_worker', url: `chrome-extension://${'b'.repeat(32)}/component_worker.js` },
    { type: 'page', url: `chrome-extension://${'c'.repeat(32)}/background.js` },
    { type: 'service_worker', url: `chrome-extension://${id}/background.js` },
  ]), id);
  assert.equal(extensionWorkerId([{ type: 'service_worker', url: 'https://example.invalid/background.js' }]), undefined);
});
