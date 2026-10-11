// Raw Chrome DevTools Protocol helpers for driving an unpacked extension in Chrome for Testing. No dependencies:
// Node 22+ has fetch and WebSocket built in.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { TEST_OAUTH_CLIENT_ID } from './config.mjs';

/** CHROME_BIN, else the newest Chrome for Testing in Playwright's cache. Branded Chrome ignores --load-extension. */
export function resolveChrome(env = process.env) {
  if (env.CHROME_BIN) return env.CHROME_BIN;
  const caches = [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')];
  const binaries = caches.flatMap((cache) =>
    (existsSync(cache) ? readdirSync(cache) : [])
      .filter((name) => /^chromium-\d+$/.test(name))
      .map((name) => ({ build: Number(name.split('-')[1]), dir: join(cache, name) }))
      .flatMap(({ build, dir }) =>
        [
          join(dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
          join(dir, 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
          join(dir, 'chrome-linux64/chrome'),
          join(dir, 'chrome-linux/chrome'),
        ]
          .filter(existsSync)
          .map((bin) => ({ build, bin }))
      )
  );
  binaries.sort((a, b) => b.build - a.build);
  if (!binaries.length) throw new Error('No Chrome for Testing found: set CHROME_BIN (scripts/upgrade-e2e/install-cft.sh)');
  return binaries[0].bin;
}

export const CHROME = resolveChrome();

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Every host name fails to resolve except localhost: the builds under test never reach a network. `hostRules` may map
// single hosts to local mocks first (Chrome applies the first matching rule).
export const NO_NETWORK = 'MAP * ~NOTFOUND , EXCLUDE localhost';

export const launch = ({ profileDir, extDir, port, hostRules = [], args = [] }) =>
  spawn(
    CHROME,
    [
      '--headless=new',
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${port}`,
      `--load-extension=${extDir}`,
      `--disable-extensions-except=${extDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      `--host-resolver-rules=${[...hostRules, NO_NETWORK].join(' , ')}`,
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--window-size=420,720',
      ...args,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

export const stop = async (chrome) => {
  if (!chrome || chrome.exitCode !== null) return;
  await new Promise((resolve) => {
    chrome.once('exit', resolve);
    chrome.kill('SIGTERM');
  });
  await sleep(1000);
};

/** Puts a build into the extension directory Chrome loads. The manifest key keeps the extension id, and with it
 * chrome.storage.local, the same across builds, as the Web Store does for an update. 3.0.x refuses to load without an
 * OAuth client id, so a build without one gets the test placeholder. */
export function installBuild(buildDir, extDir, manifestKey) {
  rmSync(extDir, { recursive: true, force: true });
  cpSync(buildDir, extDir, { recursive: true });
  const manifestPath = join(extDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const oauth2 = manifest.oauth2 && !manifest.oauth2.client_id ? { oauth2: { ...manifest.oauth2, client_id: TEST_OAUTH_CLIENT_ID } } : {};
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, ...oauth2, key: manifestKey }, null, 2)}\n`);
  return manifest.version;
}

export const targets = async (port) => (await fetch(`http://127.0.0.1:${port}/json/list`)).json();

/** Reloads the extension from chrome://extensions after its directory received a new build. Without it Chrome keeps
 * running the cached service worker of the old build next to the new popup; with it the new worker starts and
 * runtime.onInstalled fires with reason "update", as after a Web Store update. */
export async function reloadExtension(port, extId) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?chrome://extensions/`, { method: 'PUT' })).json();
  const page = cdp(target.webSocketDebuggerUrl);
  await page.ready;
  try {
    await waitFor(() => page.eval('!!globalThis.chrome?.developerPrivate'), 20000, 'chrome://extensions');
    // Calls a developerPrivate method whose last argument is its callback; answers 'ok' or the error.
    const call = (method, args) =>
      page.eval(
        `new Promise((res) => chrome.developerPrivate.${method}(...${JSON.stringify(args)}, () => res(chrome.runtime.lastError ? String(chrome.runtime.lastError.message) : 'ok')))`
      );
    const devMode = await call('updateProfileConfiguration', [{ inDeveloperMode: true }]);
    const reload = await call('reload', [extId, { failQuietly: false }]);
    await sleep(3000);
    const info = await page.eval(
      `new Promise((res) => chrome.developerPrivate.getExtensionInfo(${JSON.stringify(extId)}, (i) => res({ state: i?.state, version: i?.version, runtimeErrors: (i?.runtimeErrors || []).map((e) => e.message).slice(0, 5) })))`
    );
    return { devMode, reload, ...info };
  } finally {
    page.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => undefined);
  }
}

export async function waitFor(fn, ms = 30000, label = 'condition') {
  const started = Date.now();
  let last;
  while (Date.now() - started < ms) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}${last ? `: ${last.message}` : ''}`);
}

export function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const next = ++id;
      pending.set(next, resolve);
      ws.send(JSON.stringify({ id: next, method, params }));
    });
  return {
    ready: new Promise((resolve) => {
      ws.onopen = resolve;
    }),
    send,
    close: () => ws.close(),
    eval: async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.result?.exceptionDetails)
        throw new Error(result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text);
      return result.result?.result?.value;
    },
  };
}

export async function serviceWorker(port) {
  return waitFor(
    async () => (await targets(port)).find((t) => t.type === 'service_worker' && t.url.endsWith('/background.js')),
    30000,
    'service worker'
  );
}

/** chrome.storage.local exactly as the background sees it. */
export async function dumpStorage(port) {
  const sw = await serviceWorker(port);
  const client = cdp(sw.webSocketDebuggerUrl);
  await client.ready;
  try {
    return await client.eval('chrome.storage.local.get(null)');
  } finally {
    client.close();
  }
}

/** Runs an expression in the service worker (test-only storage edits, such as removing a key a scenario needs gone). */
export async function inServiceWorker(port, expression) {
  const sw = await serviceWorker(port);
  const client = cdp(sw.webSocketDebuggerUrl);
  await client.ready;
  try {
    return await client.eval(expression);
  } finally {
    client.close();
  }
}

// A popup page with a second port to the background, so messages can be sent next to the real UI.
export async function openPopup(port, extId, hash = '') {
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?chrome-extension://${extId}/popup.html${hash}`, { method: 'PUT' })
  ).json();
  const page = cdp(target.webSocketDebuggerUrl);
  await page.ready;
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await sleep(4000);
  await page.eval(`(() => { window.__p = chrome.runtime.connect({ name: 'fw-fearless-extension' }); window.__h = {}; window.__n = 0;
    window.__p.onMessage.addListener((d) => { const h = window.__h[d.id]; if (!h || d.subscription) return; delete window.__h[d.id]; d.error ? h.rej(d.error) : h.res(d.response); });
    window.__send = (message, request) => new Promise((res, rej) => { const id = 'h.' + (++window.__n); window.__h[id] = { res, rej }; window.__p.postMessage({ id, message, request: request ?? null }); setTimeout(() => rej('timeout ' + message), 90000); }); return true; })()`);
  page.call = (message, request) =>
    page.eval(
      `window.__send(${JSON.stringify(message)}, ${JSON.stringify(request ?? null)}).then((v) => ({ ok: v }), (e) => ({ err: String(e && e.message || e) }))`
    );
  page.targetId = target.id;
  page.closeTarget = () => fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => undefined);
  return page;
}

/**
 * A cold start of the background: Chrome starts on the profile and the first messages are sent from an extension page
 * the moment it can connect, as a content script or dApp request does after the worker woke up. Returns what those first
 * messages answered and what the same question answers 1.5 s later.
 */
export async function coldStartProbe({ profileDir, extDir, port, extId }) {
  const chrome = launch({ profileDir, extDir, port });
  try {
    await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).ok, 20000, 'DevTools');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?chrome-extension://${extId}/popup.html`, { method: 'PUT' })).json();
    const page = cdp(target.webSocketDebuggerUrl);
    await page.ready;
    try {
      return await waitFor(
        () =>
          page.eval(`(async () => { if (!globalThis.chrome?.runtime?.connect) return undefined;
            const p = chrome.runtime.connect({ name: 'fw-fearless-extension' });
            const ask = (message, id) => new Promise((res) => { const h = (d) => { if (d.id === id && !d.subscription) { p.onMessage.removeListener(h); res(d.error ? { error: d.error } : d.response); } }; p.onMessage.addListener(h); p.postMessage({ id, message, request: null }); });
            const [hasMasterPassword, hasAccounts, keyringIsLocked] = await Promise.all([ask('pri(keyring.hasMasterPassword)', 'c1'), ask('pri(keyring.hasAccounts)', 'c2'), ask('pri(keyring.keyringIsLocked)', 'c3')]);
            await new Promise((r) => setTimeout(r, 1500));
            const [hasMasterPasswordLater, keyringIsLockedLater] = await Promise.all([ask('pri(keyring.hasMasterPassword)', 'c4'), ask('pri(keyring.keyringIsLocked)', 'c5')]);
            return { hasMasterPassword, hasAccounts, keyringIsLocked, hasMasterPasswordLater, keyringIsLockedLater }; })()`),
        20000,
        'the first answers after a cold start'
      );
    } finally {
      page.close();
    }
  } finally {
    await stop(chrome);
  }
}
