// Deliberately excludes arbitrary browser strings, URLs, console messages and wallet storage.
// Chrome can write application console output to stderr; keep that text only in a bounded
// in-memory tail and persist native diagnostic categories/source locations, never its contents.
import { createHash } from 'node:crypto';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STDERR_BYTES = 12 * 1024;
const TARGET_SNAPSHOTS = 12;
const enumValue = (value, allowed) => allowed.includes(value) ? value : 'other';
const integer = (value) => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const reasonValue = (value) => enumValue(value, ['worker-timeout', 'popup-unanswered', 'scenario-failure']);

export function extensionIdFromManifestKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(key.trim()))
    throw new Error('The upgrade harness requires a base64 manifest key for the wallet identity');
  return createHash('sha256').update(Buffer.from(key.trim(), 'base64')).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
}

export function extensionWorkerId(targets, expectedId) {
  if (!/^[a-p]{32}$/.test(expectedId ?? '')) return undefined;
  const target = targets.find((entry) => entry.type === 'service_worker' &&
    entry.url === `chrome-extension://${expectedId}/background.js`);
  return target ? expectedId : undefined;
}

export function installedDiagnosticSources(directory, prefix = '') {
  const files = new Set();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) {
      for (const file of installedDiagnosticSources(join(directory, entry.name), `${relative}/`)) files.add(file);
    } else if (entry.isFile() && /\.(?:m?js|html|wasm)$/.test(entry.name)) files.add(relative);
  }
  return files;
}

export function diagnosticLocation(value, sourceFiles = {}) {
  try {
    const url = new URL(value);
    if (url.protocol === 'chrome-extension:') {
      const path = decodeURIComponent(url.pathname).replace(/^\//, '');
      const build = sourceFiles.current?.has(path) ? 'current' : sourceFiles.previous?.has(path) ? 'previous' : undefined;
      return {
        scheme: 'extension',
        page: enumValue(url.pathname.split('/').at(-1), ['background.js', 'popup.html', 'offscreen.html', 'content.js']),
        ...(build && { path, build }),
      };
    }
    return { scheme: enumValue(url.protocol, ['about:', 'chrome:', 'http:', 'https:', 'devtools:']) };
  } catch { return { scheme: 'other' }; }
}

export function nativeStderrSummary(tail) {
  const entries = [];
  let omittedLines = 0;
  for (const line of tail.toString('utf8').split(/\r?\n/)) {
    if (!line) continue;
    const source = line.match(/\b(INFO|WARNING|ERROR|FATAL):([A-Za-z0-9_./-]+\.(?:cc|h))[:(](\d+)/);
    const sandbox = /No usable sandbox!|Failed to move to new namespace|SUID sandbox helper binary/.test(line);
    if (!source && !sandbox) { omittedLines++; continue; }
    entries.push({
      severity: source?.[1] ?? 'FATAL',
      source: source?.[2].split('/').at(-1).slice(0, 80) ?? 'sandbox',
      line: source ? Number(source[3]) : undefined,
      category: /sandbox|namespace/i.test(line) ? 'sandbox' : /crash|signal/i.test(line) ? 'crash' :
        /dbus|d-bus/i.test(line) ? 'dbus' : /gpu/i.test(line) ? 'gpu' : /ssl|network|socket/i.test(line) ? 'network' : 'other',
    });
  }
  return { entries: entries.slice(-20), omittedLines, tailBytes: tail.length, limitBytes: STDERR_BYTES };
}

export function createBrowserDiagnostics(child, { file, sourceFiles = {}, now = () => new Date().toISOString(), write = writeFileSync } = {}) {
  let stderr = Buffer.alloc(0);
  let lastTargets;
  const lifecycle = [];
  const state = { startedAt: now(), exited: false };
  child.stderr?.on('data', (chunk) => {
    const bytes = Buffer.from(chunk);
    stderr = bytes.length >= STDERR_BYTES ? bytes.subarray(-STDERR_BYTES) :
      Buffer.concat([stderr.subarray(-(STDERR_BYTES - bytes.length)), bytes]);
  });
  child.once('error', (error) => { state.spawnError = enumValue(error.code, ['ENOENT', 'EACCES', 'ENOEXEC', 'EMFILE', 'ENFILE']); });
  child.once('exit', (code, signal) => {
    state.exited = true;
    state.exitCode = Number.isInteger(code) ? code : null;
    state.signal = enumValue(signal, ['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV', 'SIGTRAP', null]);
  });
  const observeTargets = (targets) => {
    const list = Array.isArray(targets) ? targets.slice(0, 20).map((target) => ({
      type: enumValue(target.type, ['page', 'service_worker', 'background_page', 'iframe', 'other']),
      location: diagnosticLocation(target.url, sourceFiles),
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : [];
    const serialized = JSON.stringify(list);
    if (serialized !== lastTargets) {
      lastTargets = serialized;
      lifecycle.push({ at: now(), targets: list });
      if (lifecycle.length > TARGET_SNAPSHOTS) lifecycle.shift();
    }
    return list;
  };
  return {
    observeTargets,
    extensionInfo: (info) => extensionDiagnosticInfo(info, sourceFiles),
    snapshot(reason) {
      return {
        schemaVersion: 2, reason: reasonValue(reason), capturedAt: now(),
        process: { ...state }, stderr: nativeStderrSummary(stderr),
        targetLifecycle: [...lifecycle],
      };
    },
    persist(value) {
      try { write(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }
      catch { return false; }
      return true;
    },
  };
}

// This function is also serialized into the inspector page. It returns only fixed labels;
// arbitrary message text never crosses DevTools or reaches an output file.
export function classifyRuntimeError(message) {
  const text = typeof message === 'string' ? message.slice(0, 8192) : '';
  // Fixed public strings from the pinned legacy bundles distinguish startup failures
  // from their expected dependency-version warning; no message fragments are returned.
  if (/@(?:polkadot|subwallet)\/[a-z0-9-]+ (?:has multiple versions, ensure that there is only one installed|requires direct dependencies exactly matching version)/i.test(text)) return 'dependency-version-warning';
  if (/Keyring should be initialised via 'loadAll' before use/.test(text)) return 'keyring-not-initialized';
  if (/The WASM interface has not been initialized\./.test(text)) return 'crypto-not-initialized';
  if (/Unable to initialize @polkadot\/(?:util-crypto|wasm-crypto)|WebAssembly is not available in your environment/.test(text)) return 'crypto-initialization-failed';
  if (/Content Security Policy|violates? .*directive|Refused to (?:load|execute|connect|evaluate).*directive/i.test(text)) return 'csp-blocked';
  if (/ERR_FILE_NOT_FOUND|404 \(Not Found\)|(?:file|resource) not found/i.test(text)) return 'resource-not-found';
  if (/Failed to fetch dynamically imported module|Importing a module script failed|Failed to load module script|ChunkLoadError|Loading chunk .*failed/i.test(text)) return 'module-load';
  if (/Failed to load (?:resource|script)|net::ERR_|NetworkError|Failed to fetch|fetch failed/i.test(text)) return 'network-load';
  if (/Extension context invalidated/i.test(text)) return 'extension-context-invalidated';
  if (/disconnected port|Receiving end does not exist|Could not establish connection|message port closed|channel closed before a response/i.test(text)) return 'port-disconnected';
  if (/JSON\.parse|not valid JSON|Unexpected.*JSON|JSON.*(?:parse|invalid)/i.test(text)) return 'json-parse';
  if (/(?:unknown|unsupported|invalid) (?:keypair|key|pair) type/i.test(text)) return 'unsupported-key-type';
  if (/keyring|Unable to (?:find|retrieve) (?:keypair|pair)|Unable to decode (?:key|pair)|Password is invalid|pkcs8/i.test(text)) return 'keyring-error';
  if (/scrypt|pbkdf2|Invalid (?:seed|mnemonic)|Unable to decrypt|decryption failed|WASM.*crypto|crypto.*(?:initiali|unavailable|fail|error)|Invalid checksum|Invalid key length/i.test(text)) return 'crypto-error';
  if (/SyntaxError|Unexpected token|Unexpected end of input/i.test(text)) return 'syntax-error';
  if (/ReferenceError|is not defined/i.test(text)) return 'reference-error';
  if (/TypeError|Cannot read propert|is not a function/i.test(text)) return 'type-error';
  if (/RangeError|Maximum call stack|out of memory/i.test(text)) return 'range-or-memory-error';
  if (/QuotaExceededError|IndexedDB|IDBDatabase|storage.*(?:failed|error|unavailable)/i.test(text)) return 'storage-error';
  if (/^initialization failed\b/i.test(text)) return 'initialization-failed';
  return 'other';
}

const RUNTIME_CATEGORIES = ['csp-blocked', 'resource-not-found', 'module-load', 'network-load',
  'extension-context-invalidated', 'port-disconnected', 'syntax-error', 'reference-error',
  'type-error', 'range-or-memory-error', 'storage-error', 'json-parse', 'unsupported-key-type', 'keyring-error', 'crypto-error',
  'dependency-version-warning', 'keyring-not-initialized', 'crypto-not-initialized', 'crypto-initialization-failed', 'initialization-failed', 'other'];

export function extensionInspectorSource(extensionId) {
  if (!/^[a-p]{32}$/.test(extensionId)) throw new Error('Invalid diagnostic extension identity');
  return `new Promise((resolve) => chrome.developerPrivate.getExtensionInfo(${JSON.stringify(extensionId)}, (info) => {
    if (!info) return resolve(undefined);
    const classify = ${classifyRuntimeError.toString()};
    const errors = info.runtimeErrors || [];
    const categories = {};
    for (const error of errors) {
      const category = classify(error.message);
      categories[category] = (categories[category] || 0) + 1;
    }
    resolve({
      state: info.state, version: info.version, runtimeErrorCount: errors.length,
      manifestErrorCount: (info.manifestErrors || []).length, runtimeCategoryCounts: categories,
      runtimeErrors: errors.slice(-10).map((error) => ({
        id: error.id, type: error.type, severity: error.severity, category: classify(error.message), source: error.source,
        frames: (error.stackTrace || []).slice(0, 5).map((frame) => ({ url: frame.url, line: frame.lineNumber, column: frame.columnNumber }))
      }))
    });
  }))`;
}

export function extensionDiagnosticInfo(info, sourceFiles = {}) {
  const categories = Object.fromEntries(RUNTIME_CATEGORIES.flatMap((category) => {
    const count = integer(info?.runtimeCategoryCounts?.[category]);
    return count === undefined ? [] : [[category, count]];
  }));
  return {
    state: enumValue(info?.state, ['ENABLED', 'DISABLED', 'TERMINATED']),
    version: /^\d+(?:\.\d+){0,3}$/.test(info?.version) ? info.version : undefined,
    runtimeErrorCount: integer(info?.runtimeErrorCount),
    manifestErrorCount: integer(info?.manifestErrorCount),
    runtimeCategoryCounts: categories,
    runtimeErrors: (Array.isArray(info?.runtimeErrors) ? info.runtimeErrors : []).slice(-10).map((error) => ({
      id: integer(error?.id), type: enumValue(error?.type, ['RUNTIME', 'MANIFEST', 'runtime', 'manifest']),
      severity: enumValue(error?.severity, ['LOG', 'WARN', 'ERROR']),
      category: enumValue(error?.category, RUNTIME_CATEGORIES),
      source: diagnosticLocation(error?.source, sourceFiles),
      frames: (Array.isArray(error?.frames) ? error.frames : []).slice(0, 5).map((frame) => ({
        source: diagnosticLocation(frame?.url, sourceFiles), line: integer(frame?.line), column: integer(frame?.column),
      })),
    })),
  };
}

/** Read-only inspection has its own deadline and cannot replace the original test failure. */
export async function captureBrowserDiagnostics(recorder, reason, { inspectTargets, inspectExtension, timeoutMs = 3000 } = {}) {
  if (!recorder) return undefined;
  const abort = new AbortController();
  let timer;
  const value = recorder.snapshot(reason);
  try {
    await Promise.race([
      (async () => {
        const targets = await inspectTargets(abort.signal);
        if (abort.signal.aborted) return;
        recorder.observeTargets(targets);
        value.targetLifecycle = recorder.snapshot(reason).targetLifecycle;
        const extension = await inspectExtension(targets, abort.signal);
        if (!abort.signal.aborted) {
          if (!extension) throw new Error('extension metadata unavailable');
          value.extension = recorder.extensionInfo(extension);
        }
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('deadline')), timeoutMs); }),
    ]);
    value.inspection = 'complete';
  } catch { value.inspection = 'unavailable-or-timed-out'; }
  finally { clearTimeout(timer); abort.abort(); }
  Object.assign(value, recorder.snapshot(reason));
  value.persisted = recorder.persist(value);
  return value;
}
