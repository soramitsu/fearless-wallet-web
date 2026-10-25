#!/usr/bin/env node
// Prove that the pinned sandboxed browser can start an unpacked MV3 worker before building old releases.
// The disposable extension contains no wallet code, accounts, permissions or network requests.
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stopOwnedProcess } from './process-lifecycle.mjs';
import { extensionIdFromManifestKey, extensionWorkerId } from './browser-diagnostics.mjs';

const STDERR_LIMIT = 12 * 1024;
const SYSTEM_SANDBOX = '/opt/google/chrome/chrome-sandbox';
// The public test key fixes the identity of this disposable, wallet-free probe.
const PROBE_MANIFEST_KEY = readFileSync(new URL('../../tests/upgrade/test-extension-key.pub.b64', import.meta.url), 'utf8').trim();
const PROBE_EXTENSION_ID = extensionIdFromManifestKey(PROBE_MANIFEST_KEY);

export function validateSandboxHelper(file, stat = lstatSync) {
  const metadata = stat(file);
  if (!metadata.isFile() || metadata.uid !== 0 || metadata.gid !== 0 || (metadata.mode & 0o7777) !== 0o4755)
    throw new Error('Chrome sandbox helper must be a root-owned regular file with mode 4755; ' +
      `observed uid=${metadata.uid}, gid=${metadata.gid}, mode=${(metadata.mode & 0o7777).toString(8)}, regular=${metadata.isFile()}`);
  // A writable parent could replace even a root-owned helper between validation and launch.
  for (let parent = dirname(resolve(file)); ; parent = dirname(parent)) {
    const directory = stat(parent);
    if (!directory.isDirectory() || directory.uid !== 0 || (directory.mode & 0o022) !== 0)
      throw new Error('Chrome sandbox helper must have root-owned, non-writable parent directories; ' +
        `observed uid=${directory.uid}, mode=${(directory.mode & 0o7777).toString(8)}, directory=${directory.isDirectory()}`);
    if (parent === dirname(parent)) break;
  }
  return file;
}

export function preflightArguments({ profileDir, extDir, port }) {
  return [
    '--headless=new', `--user-data-dir=${profileDir}`, `--remote-debugging-port=${port}`,
    `--load-extension=${extDir}`, `--disable-extensions-except=${extDir}`,
    '--no-first-run', '--no-default-browser-check',
    '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    'about:blank',
  ];
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

export async function preflightChrome({
  binary = process.env.CHROME_BIN,
  env = process.env,
  platform = process.platform,
  timeoutMs = 20_000,
  temporaryRoot = tmpdir(),
  spawnImpl = spawn,
  fetchImpl = fetch,
} = {}) {
  if (!binary) throw new Error('Chrome preflight requires CHROME_BIN');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
    throw new Error('Chrome preflight timeout must be 1–60000 ms');
  let sandboxHelper;
  if (platform === 'linux') {
    const requested = env.CHROME_DEVEL_SANDBOX;
    if (requested || existsSync(SYSTEM_SANDBOX)) sandboxHelper = validateSandboxHelper(requested || SYSTEM_SANDBOX);
  }
  const temporary = mkdtempSync(join(temporaryRoot, 'fearless-chrome-preflight-'));
  const extDir = join(temporary, 'extension');
  const profileDir = join(temporary, 'profile');
  mkdirSync(extDir);
  writeFileSync(join(extDir, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Fearless upgrade startup probe', version: '1.0.0',
    key: PROBE_MANIFEST_KEY,
    background: { service_worker: 'background.js' },
  }));
  writeFileSync(join(extDir, 'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
  let child;
  let stderr = Buffer.alloc(0);
  let stopped = false;
  const abort = new AbortController();
  try {
    const port = await freePort();
    child = spawnImpl(binary, preflightArguments({ profileDir, extDir, port }), {
      env: sandboxHelper ? { ...env, CHROME_DEVEL_SANDBOX: sandboxHelper } : env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr?.on('data', (chunk) => {
      stderr = Buffer.concat([stderr, Buffer.from(chunk)]).subarray(-STDERR_LIMIT);
    });
    const earlyExit = new Promise((_, reject) => {
      child.once('error', (error) => reject(new Error(`Chrome could not start: ${error.message}`)));
      child.once('exit', (code, signal) => reject(new Error(`Chrome exited before readiness (code=${code}, signal=${signal})`)));
    });
    const ready = (async () => {
      const deadline = Date.now() + timeoutMs;
      let last = 'DevTools endpoint has not answered';
      while (!stopped && Date.now() < deadline) {
        try {
          const request = async (route) => {
            const response = await fetchImpl(`http://127.0.0.1:${port}${route}`, {
              signal: AbortSignal.any([abort.signal, AbortSignal.timeout(Math.min(1000, Math.max(1, deadline - Date.now())))]),
            });
            if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
            return response.json();
          };
          const version = await request('/json/version');
          const targets = await request('/json/list');
          if (typeof version.Browser !== 'string' || !version.Browser) throw new Error('DevTools browser version is missing');
          if (Array.isArray(targets) && extensionWorkerId(targets, PROBE_EXTENSION_ID))
            return { browser: version.Browser, extensionWorkerReady: true, sandboxHelper: sandboxHelper ?? null };
          last = 'DevTools answered, but the probe extension worker is missing';
        } catch (error) { last = error.message; }
        if (!stopped) await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
      throw new Error(`Chrome startup timed out after ${timeoutMs} ms: ${last}`);
    })();
    return await Promise.race([earlyExit, ready]);
  } catch (error) {
    const diagnostic = stderr.toString('utf8').replaceAll(temporary, '<probe-directory>').trim();
    throw new Error(`Sandboxed Chrome preflight failed: ${error.message}\nChrome stderr (last ${STDERR_LIMIT} bytes):\n${diagnostic || '(empty)'}`);
  } finally {
    stopped = true;
    abort.abort();
    try { await stopOwnedProcess(child); }
    finally {
      // A browser helper can briefly retain the inherited stderr descriptor after
      // the browser exits. Do not let that descriptor keep the probe process open.
      child?.stderr?.destroy();
      rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: CHROME_BIN=/path/to/chrome node scripts/upgrade-e2e/preflight-chrome.mjs');
    console.log('[upgrade-chrome-preflight]', JSON.stringify(await preflightChrome()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
