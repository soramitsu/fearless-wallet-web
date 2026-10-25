import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { captureBrowserDiagnostics, classifyRuntimeError, createBrowserDiagnostics, diagnosticLocation, extensionDiagnosticInfo, extensionIdFromManifestKey, extensionInspectorSource, extensionWorkerId, installedDiagnosticSources } from './browser-diagnostics.mjs';

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


test('the public test manifest key determines the Chrome wallet identity before targets appear', () => {
  const key = readFileSync(new URL('../../tests/upgrade/test-extension-key.pub.b64', import.meta.url), 'utf8');
  assert.equal(extensionIdFromManifestKey(key), 'plnlnnlkcnkiokjgpefakfhgngpbnaec');
  assert.throws(() => extensionIdFromManifestKey(undefined), /manifest key/);
  assert.throws(() => extensionIdFromManifestKey(''), /manifest key/);
});

test('diagnostics identify the wallet background worker instead of the first component-extension target', () => {
  const id = 'a'.repeat(32);
  assert.equal(extensionWorkerId([
    { type: 'service_worker', url: `chrome-extension://${'d'.repeat(32)}/background.js` },
    { type: 'service_worker', url: `chrome-extension://${'b'.repeat(32)}/component_worker.js` },
    { type: 'page', url: `chrome-extension://${'c'.repeat(32)}/background.js` },
    { type: 'service_worker', url: `chrome-extension://${id}/background.js` },
  ], id), id);
  assert.equal(extensionWorkerId([
    { type: 'service_worker', url: `chrome-extension://${'d'.repeat(32)}/background.js` },
  ], id), undefined);
  assert.equal(extensionWorkerId([{ type: 'service_worker', url: 'https://example.invalid/background.js' }], id), undefined);
});


test('source allowlist contains only real installed script/page files and never follows symlinks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'upgrade-source-allowlist-'));
  try {
    mkdirSync(join(dir, 'assets'));
    for (const file of ['background.js', 'popup.html', 'assets/runtime-abc123.js', 'assets/codec.wasm', 'wallet.json', 'source.map'])
      writeFileSync(join(dir, file), 'fixture');
    symlinkSync(join(dir, 'background.js'), join(dir, 'linked.js'));
    assert.deepEqual([...installedDiagnosticSources(dir)].sort(), ['assets/codec.wasm', 'assets/runtime-abc123.js', 'background.js', 'popup.html']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('installed and previous-build JS paths survive sanitization while host/query/fragment and unknown paths do not', () => {
  const sourceFiles = { current: new Set(['assets/current-123.js']), previous: new Set(['assets/retired-456.js']) };
  for (const [file, build] of [['assets/current-123.js', 'current'], ['assets/retired-456.js', 'previous']]) {
    const result = diagnosticLocation(`chrome-extension://${'a'.repeat(32)}/${file}?${SECRET}#${SECRET}`, sourceFiles);
    assert.deepEqual(result, { scheme: 'extension', page: 'other', path: file, build });
    assert(!JSON.stringify(result).includes(SECRET));
  }
  const unknown = diagnosticLocation(`chrome-extension://${'a'.repeat(32)}/${SECRET}.js`, sourceFiles);
  assert.deepEqual(unknown, { scheme: 'extension', page: 'other' });
});

test('fixed runtime categories distinguish missing chunks, module loading, CSP, network, ports and JS errors without retaining messages', () => {
  const cases = [
    ['Failed to load resource: net::ERR_FILE_NOT_FOUND', 'resource-not-found'],
    ['Failed to fetch dynamically imported module: chrome-extension://a/assets/old.js', 'module-load'],
    ['Failed to load module script: Expected a JavaScript module script', 'module-load'],
    ['Refused to load the script because it violates the following Content Security Policy directive', 'csp-blocked'],
    ['Failed to load resource: net::ERR_NAME_NOT_RESOLVED', 'network-load'],
    ['Uncaught Error: Extension context invalidated.', 'extension-context-invalidated'],
    ['Could not establish connection. Receiving end does not exist.', 'port-disconnected'],
    ['Uncaught SyntaxError: Unexpected token', 'syntax-error'],
    ['Uncaught ReferenceError: missing is not defined', 'reference-error'],
    ['Uncaught TypeError: Cannot read properties of undefined', 'type-error'],
    ['SyntaxError: Unexpected token at JSON.parse', 'json-parse'],
    ['Unsupported keypair type', 'unsupported-key-type'],
    ['Keyring initialization failed', 'keyring-error'],
    ['Unable to decrypt encrypted key', 'crypto-error'],
    ['scrypt initialization failed', 'crypto-error'],
  ];
  for (const [message, category] of cases) assert.equal(classifyRuntimeError(`${message} ${SECRET}`), category);
  assert.equal(classifyRuntimeError(SECRET), 'other');
});

test('known legacy initialization errors remain distinct from package warnings without exposing message values', () => {
  const cases = [
    ["Error: Keyring should be initialised via 'loadAll' before use", 'keyring-not-initialized'],
    ['The WASM interface has not been initialized. Ensure that you wait for the initialization Promise', 'crypto-not-initialized'],
    ['Unable to initialize @polkadot/util-crypto', 'crypto-initialization-failed'],
    ['FATAL: Unable to initialize @polkadot/wasm-crypto:: reason', 'crypto-initialization-failed'],
    ['WebAssembly is not available in your environment', 'crypto-initialization-failed'],
    ['initialization failed Error', 'initialization-failed'],
    ['initialization failed TypeError: Cannot read properties of undefined', 'type-error'],
    ['@polkadot/keyring has multiple versions, ensure that there is only one installed.', 'dependency-version-warning'],
    ['@polkadot/util requires direct dependencies exactly matching version 12.6.2.', 'dependency-version-warning'],
  ];
  const runtimeErrors = cases.map(([message, category], index) => ({
    id: index, message: `${message} ${SECRET}`, severity: category === 'dependency-version-warning' ? 'WARN' : 'ERROR',
  }));
  const inspected = runInNewContext(extensionInspectorSource('a'.repeat(32)), {
    chrome: { developerPrivate: { getExtensionInfo: (_id, callback) => callback({ state: 'ENABLED', version: '3.0.6', runtimeErrors }) } },
  });
  return inspected.then((info) => {
    assert(!JSON.stringify(info).includes(SECRET), 'raw messages must not cross DevTools');
    const saved = extensionDiagnosticInfo(info);
    assert.deepEqual(Array.from(saved.runtimeErrors, (error) => error.category), cases.map(([, category]) => category));
    assert.equal(saved.runtimeCategoryCounts['dependency-version-warning'], 2);
    assert.equal(saved.runtimeCategoryCounts['keyring-not-initialized'], 1);
    assert.equal(saved.runtimeErrors.at(-1).severity, 'WARN');
    assert(!JSON.stringify(saved).includes(SECRET));
    assert(!JSON.stringify(saved).includes('12.6.2'));
    assert(!JSON.stringify(saved).includes('loadAll'));
  });
});

test('actual inspector expression aggregates all 35 errors but returns only the latest 10 classified records without message text', async () => {
  const messageSecret = 'sensitive-message-material';
  const errors = Array.from({ length: 35 }, (_, id) => ({
    id, type: 'RUNTIME', severity: 'ERROR',
    message: `${id < 30 ? 'Uncaught TypeError: Cannot read properties of undefined' : 'Failed to load resource: net::ERR_FILE_NOT_FOUND'} ${messageSecret}`,
    source: `chrome-extension://${'a'.repeat(32)}/assets/retired-456.js?${SECRET}`,
    stackTrace: [{ url: `chrome-extension://${'a'.repeat(32)}/assets/retired-456.js#${SECRET}`, lineNumber: id, columnNumber: 1 }],
  }));
  const raw = await runInNewContext(extensionInspectorSource('a'.repeat(32)), {
    chrome: { developerPrivate: { getExtensionInfo: (_id, callback) => callback({ state: 'ENABLED', version: '3.0.6', runtimeErrors: errors, manifestErrors: [] }) } },
  });
  assert(!JSON.stringify(raw).includes(messageSecret), 'raw messages must not even cross DevTools');
  const value = extensionDiagnosticInfo(raw, { current: new Set(['background.js']), previous: new Set(['assets/retired-456.js']) });
  assert.equal(value.runtimeErrorCount, 35);
  assert.deepEqual(value.runtimeCategoryCounts, { 'resource-not-found': 5, 'type-error': 30 });
  assert.deepEqual(value.runtimeErrors.map(error => error.id), Array.from({ length: 10 }, (_, i) => i + 25));
  assert.equal(value.runtimeErrors.at(-1).type, 'RUNTIME');
  assert.equal(value.runtimeErrors.at(-1).source.path, 'assets/retired-456.js');
  assert.equal(value.runtimeErrors.at(-1).source.build, 'previous');
  assert.equal(value.runtimeErrors.at(-1).frames[0].line, 34);
  assert(!JSON.stringify(value).includes(SECRET));
  assert(!JSON.stringify(value).includes(messageSecret));
});

test('unknown category/type/severity keys cannot smuggle arbitrary strings into persisted diagnostics', () => {
  const value = extensionDiagnosticInfo({
    runtimeCategoryCounts: { [SECRET]: 3, 'module-load': 2, 'network-load': SECRET },
    runtimeErrors: [{ type: SECRET, severity: SECRET, category: SECRET, source: SECRET }],
  });
  assert.deepEqual(value.runtimeCategoryCounts, { 'module-load': 2 });
  assert.equal(value.runtimeErrors[0].type, 'other');
  assert.equal(value.runtimeErrors[0].category, 'other');
  assert(!JSON.stringify(value).includes(SECRET));
});
