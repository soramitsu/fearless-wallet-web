// Deliberately excludes arbitrary browser strings, URLs, console messages and wallet storage.
// Chrome can write application console output to stderr; keep that text only in a bounded
// in-memory tail and persist native diagnostic categories/source locations, never its contents.
import { writeFileSync } from 'node:fs';

const STDERR_BYTES = 12 * 1024;
const TARGET_SNAPSHOTS = 12;
const enumValue = (value, allowed) => allowed.includes(value) ? value : 'other';
const integer = (value) => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const reasonValue = (value) => enumValue(value, ['worker-timeout', 'popup-unanswered', 'scenario-failure']);

export function extensionWorkerId(targets) {
  const target = targets.find((entry) => entry.type === 'service_worker' &&
    /^chrome-extension:\/\/[a-p]{32}\/background\.js$/.test(entry.url));
  return target ? new URL(target.url).host : undefined;
}

export function diagnosticLocation(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'chrome-extension:') return {
      scheme: 'extension',
      page: enumValue(url.pathname.split('/').at(-1), ['background.js', 'popup.html', 'offscreen.html', 'content.js']),
    };
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

export function createBrowserDiagnostics(child, { file, now = () => new Date().toISOString(), write = writeFileSync } = {}) {
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
      location: diagnosticLocation(target.url),
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
    snapshot(reason) {
      return {
        schemaVersion: 1, reason: reasonValue(reason), capturedAt: now(),
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

export function extensionDiagnosticInfo(info) {
  return {
    state: enumValue(info?.state, ['ENABLED', 'DISABLED', 'TERMINATED']),
    version: /^\d+(?:\.\d+){0,3}$/.test(info?.version) ? info.version : undefined,
    runtimeErrorCount: integer(info?.runtimeErrorCount),
    manifestErrorCount: integer(info?.manifestErrorCount),
    runtimeErrors: (Array.isArray(info?.runtimeErrors) ? info.runtimeErrors : []).slice(0, 5).map((error) => ({
      severity: enumValue(error?.severity, ['LOG', 'WARN', 'ERROR']),
      source: diagnosticLocation(error?.source),
      frames: (Array.isArray(error?.frames) ? error.frames : []).slice(0, 5).map((frame) => ({
        source: diagnosticLocation(frame?.url), line: integer(frame?.line), column: integer(frame?.column),
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
          value.extension = extensionDiagnosticInfo(extension);
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
