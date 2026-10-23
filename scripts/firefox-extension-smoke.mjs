import { spawn, spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  BoundedOutput,
  SmokeTimeoutError,
  VERIFIED_FIREFOX_VERSION,
  assertCspState,
  assertFirefoxVersionResult,
  assertPopupState,
  createSmokeEnvironment,
  findRuntimeErrors,
  isPopupUrl,
  processTreeExistsAfterProbeError,
  requireCiFirefoxBinary,
  withTimeout,
} from './firefox-extension-smoke-policy.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const webExtPackageDir = path.dirname(require.resolve('web-ext'));
const webExtCli = path.join(webExtPackageDir, 'bin', 'web-ext.js');
const rdpClientPath = path.join(webExtPackageDir, 'lib', 'firefox', 'rdp-client.js');
const { default: FirefoxRDPClient } = await import(pathToFileURL(rdpClientPath));

const CONNECT_TIMEOUT_MS = 30_000;
const PAGE_TIMEOUT_MS = 20_000;
const EVALUATION_TIMEOUT_MS = 5_000;
const RDP_REQUEST_TIMEOUT_MS = 5_000;
const EXPECTED_EXTENSION_ID = '{6a9332b9-e864-4d0a-a591-140fe75a29ba}';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function firstExecutable(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next supported Firefox location.
    }
  }

  throw new Error('Firefox was not found; set FIREFOX_BINARY to an executable Firefox binary');
}

async function resolveFirefoxBinary() {
  const requiredCiBinary = requireCiFirefoxBinary(process.env);
  if (requiredCiBinary) return firstExecutable([requiredCiBinary]);
  return firstExecutable([
    process.env.FIREFOX_BINARY,
    '/Applications/Firefox.app/Contents/MacOS/firefox',
    '/usr/bin/firefox',
    '/usr/local/bin/firefox',
    '/opt/homebrew/bin/firefox',
  ]);
}

function verifyFirefoxExecutableVersion(firefoxBinary, environment) {
  const result = spawnSync(firefoxBinary, ['--version'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 64 * 1_024,
    timeout: 10_000,
  });
  return assertFirefoxVersionResult(result, VERIFIED_FIREFOX_VERSION);
}

class SmokeRDPClient extends FirefoxRDPClient {
  evaluationResults = new Map();
  evaluationWaiters = new Map();
  recordedErrors = [];
  disconnected = false;

  constructor() {
    super();
    // The upstream client emits EventEmitter's fatal `error` event for RDP
    // protocol drift. Record it immediately so startup races cannot crash the
    // runner before the production gate reports a useful failure.
    this.on('error', (error) => this.recordedErrors.push(error));
  }

  _handleMessage(message) {
    if (message.type === 'evaluationResult') {
      const waiter = this.evaluationWaiters.get(message.resultID);

      if (waiter) {
        this.evaluationWaiters.delete(message.resultID);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        this.evaluationResults.set(message.resultID, message);
      }

      return;
    }

    // These lifecycle messages are expected when about:blank moves into an
    // extension process. web-ext's RDP client predates the notifications.
    if (
      message.type === 'forwardingCancelled' ||
      message.type === 'addonListChanged' ||
      message.type === 'descriptor-destroyed' ||
      message.type === 'target-destroyed-form'
    ) {
      return;
    }

    super._handleMessage(message);
  }

  waitForEvaluation(resultID, timeoutMs = EVALUATION_TIMEOUT_MS) {
    const existing = this.evaluationResults.get(resultID);

    if (existing) {
      this.evaluationResults.delete(resultID);
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.evaluationWaiters.delete(resultID);
        reject(new SmokeTimeoutError(`Firefox evaluation ${resultID}`, timeoutMs));
        this.disconnect();
      }, timeoutMs);

      this.evaluationWaiters.set(resultID, { reject, resolve, timer });
    });
  }

  disconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    const error = new Error('RDP connection closed');
    for (const waiter of this.evaluationWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.evaluationWaiters.clear();
    this.evaluationResults.clear();
    super.disconnect();
  }
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function requestRDP(client, request, label, timeoutMs = RDP_REQUEST_TIMEOUT_MS) {
  return withTimeout(client.request(request), timeoutMs, label, () => client.disconnect());
}

async function connectRDP(port, child) {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`web-ext exited before Firefox became ready (exit ${child.exitCode ?? child.signalCode})`);
    }

    const client = new SmokeRDPClient();

    try {
      const remaining = Math.max(1, deadline - Date.now());
      await withTimeout(
        client.connect(port),
        Math.min(RDP_REQUEST_TIMEOUT_MS, remaining),
        'Firefox RDP connection',
        () => client.disconnect()
      );
      return client;
    } catch (error) {
      lastError = error;
      client.disconnect();
      await sleep(150);
    }
  }

  throw new Error(`Firefox RDP did not become ready on port ${port}: ${String(lastError)}`);
}

async function waitForAddon(client) {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = await requestRDP(client, 'listAddons', 'Firefox listAddons request');
    const addon = response.addons.find((candidate) => candidate.id === EXPECTED_EXTENSION_ID);

    if (addon?.temporarilyInstalled && addon.manifestURL?.endsWith('/manifest.json')) {
      const diagnostics = [...(addon.errors ?? []), ...(addon.warnings ?? [])];
      if (diagnostics.length > 0) {
        throw new Error(`Firefox rejected part of the temporary add-on: ${JSON.stringify(diagnostics)}`);
      }
      return addon;
    }
    await sleep(200);
  }

  throw new Error(`temporary Firefox add-on ${EXPECTED_EXTENSION_ID} was not installed`);
}

async function waitForRenderedPopup(client, popupPrefix) {
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  let lastObserved = [];

  while (Date.now() < deadline) {
    const response = await requestRDP(client, 'listTabs', 'Firefox listTabs request');
    lastObserved = response.tabs.map(({ title, url }) => ({ title, url }));
    const tab = response.tabs.find((candidate) => isPopupUrl(candidate.url, popupPrefix));

    if (tab && tab.title.startsWith('FEARLESS')) {
      try {
        const target = (
          await requestRDP(client, { to: tab.actor, type: 'getTarget' }, 'Firefox popup getTarget request')
        ).frame;
        const state = await evaluateJSON(
          client,
          target,
          `({
            title: document.title,
            readyState: document.readyState,
            href: location.href,
            body: document.body?.innerText?.slice(0, 1000),
            app: Boolean(document.querySelector('#app')),
            vueMounted: document.querySelector('#app')?.hasAttribute('data-v-app') ?? false,
            appHtmlLength: document.querySelector('#app')?.innerHTML?.length ?? -1,
            interactiveElements: document.querySelectorAll('#app button, #app a, #app input, #app select, #app textarea, #app [role="button"]').length
          })`
        );
        lastObserved = state;
        assertPopupState(state, popupPrefix);
        return { tab, target, state };
      } catch (error) {
        if (error instanceof SmokeTimeoutError || client.disconnected) throw error;
        lastObserved = error instanceof Error ? error.message : String(error);
        // The target may be replaced while the router finishes its cold-start
        // redirects. Reacquire it and try again until the bounded deadline.
      }
    }

    await sleep(200);
  }

  throw new Error(`Firefox popup did not render before the deadline: ${JSON.stringify(lastObserved)}`);
}

async function evaluateJSON(client, target, expression) {
  const accepted = await requestRDP(
    client,
    {
      to: target.consoleActor,
      type: 'evaluateJSAsync',
      text: `JSON.stringify(${expression})`,
      eager: false,
      mapped: {},
      selectedNodeActor: null,
      selectedObjectActor: null,
      frameActor: target.actor,
      url: target.url,
      lineNumber: 0,
      columnNumber: 0,
    },
    'Firefox console evaluation request'
  );
  const evaluated = await client.waitForEvaluation(accepted.resultID);

  if (evaluated.hasException) {
    throw new Error(`Firefox evaluation failed: ${JSON.stringify(evaluated.exception ?? evaluated)}`);
  }

  if (typeof evaluated.result !== 'string') {
    throw new Error(`Firefox evaluation returned a non-string result: ${JSON.stringify(evaluated.result)}`);
  }

  return JSON.parse(evaluated.result);
}

const ownsProcessGroup = process.platform !== 'win32';

function signalProcessTree(child, signal) {
  if (!child?.pid) return;

  try {
    if (ownsProcessGroup) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function processTreeIsAlive(child) {
  if (!child?.pid) return false;

  try {
    if (ownsProcessGroup) process.kill(-child.pid, 0);
    else if (child.exitCode === null && child.signalCode === null) process.kill(child.pid, 0);
    else return false;
    return true;
  } catch (error) {
    // A sandboxed Firefox descendant can briefly reject signal 0 with EPERM
    // while shutting down. It still exists, so keep polling until the group is
    // gone; unexpected probe failures remain fatal.
    return processTreeExistsAfterProbeError(error);
  }
}

async function waitForProcessTreeExit(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processTreeIsAlive(child) && Date.now() < deadline) await sleep(50);
  return !processTreeIsAlive(child);
}

async function terminateProcessTree(child) {
  if (!child?.pid || !processTreeIsAlive(child)) return;

  signalProcessTree(child, 'SIGINT');
  await waitForExit(child, 5_000);
  if (await waitForProcessTreeExit(child, 1_000)) return;

  signalProcessTree(child, 'SIGKILL');
  await waitForExit(child, 2_000);
  if (!(await waitForProcessTreeExit(child, 2_000))) {
    throw new Error(`Firefox process group ${child.pid} survived SIGKILL`);
  }
}

const firefoxBinary = await resolveFirefoxBinary();
const smokeEnvironment = createSmokeEnvironment(process.env);
verifyFirefoxExecutableVersion(firefoxBinary, smokeEnvironment);
const output = new BoundedOutput();
let child;
let client;

try {
  child = spawn(
    process.execPath,
    [
      webExtCli,
      '--no-config-discovery',
      'run',
      '--source-dir',
      'dist/extension/firefox',
      '--firefox',
      firefoxBinary,
      '--no-reload',
      '--no-input',
      '--arg=-headless',
      '--verbose',
    ],
    {
      cwd: rootDir,
      detached: ownsProcessGroup,
      env: smokeEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const portPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (operation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      operation();
    };
    const timeout = setTimeout(
      () => finish(() => reject(new Error('web-ext did not report a Firefox debugger port'))),
      CONNECT_TIMEOUT_MS
    );
    const consume = (chunk) => {
      const match = output.append(chunk).match(/-start-debugger-server\s+(\d+)/u);

      if (match) {
        finish(() => resolve(Number(match[1])));
      }
    };

    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
    child.once('error', (error) => {
      finish(() => reject(error));
    });
    child.once('exit', (code, signal) => {
      finish(() => reject(new Error(`web-ext exited before startup (exit ${code ?? signal})`)));
    });
  });

  const port = await portPromise;
  client = await connectRDP(port, child);

  await waitForAddon(client);
  // The descriptor is visible slightly before Firefox finishes activating the
  // temporary add-on. Navigating during that window is silently discarded.
  await sleep(1_500);
  const addon = await waitForAddon(client);
  const popupPrefix = new URL('popup.html', addon.manifestURL).href;
  const tabs = await requestRDP(client, 'listTabs', 'Firefox initial listTabs request');
  const initialTab = tabs.tabs[0];

  if (!initialTab) throw new Error('Firefox did not expose an initial browser tab');
  const initialTarget = (
    await requestRDP(client, { to: initialTab.actor, type: 'getTarget' }, 'Firefox initial getTarget request')
  ).frame;
  await requestRDP(
    client,
    { to: initialTarget.actor, type: 'navigateTo', url: `${popupPrefix}#/` },
    'Firefox popup navigation request'
  );

  const { target, state: popupState } = await waitForRenderedPopup(client, popupPrefix);

  const cspState = await evaluateJSON(
    client,
    target,
    `(() => {
      const nativeFunction = /\\[native code\\]/.test(Function.prototype.toString.call(Function));
      try {
        return { blocked: false, nativeFunction, value: new Function('return 1')() };
      } catch (error) {
        return { blocked: true, nativeFunction, name: error?.name, message: error?.message };
      }
    })()`
  );
  assertCspState(cspState);

  await sleep(500);
  if (client.recordedErrors.length > 0) {
    throw new Error(`Firefox RDP protocol errors:\n${client.recordedErrors.map(String).join('\n')}`);
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error(`web-ext exited during the Firefox smoke test (exit ${child.exitCode ?? child.signalCode})`);
  }
  const runtimeErrors = findRuntimeErrors(output.toString());
  if (runtimeErrors.length > 0) {
    throw new Error(`Firefox reported runtime errors:\n${runtimeErrors.join('\n')}`);
  }

  console.log(
    `[firefox-extension-smoke] popup rendered (${popupState.appHtmlLength} HTML bytes) and dynamic Function was blocked by CSP`
  );
} catch (error) {
  const tail = output.toString().split(/\r?\n/u).slice(-120).join('\n');
  console.error(`[firefox-extension-smoke] ${error instanceof Error ? error.stack : String(error)}`);
  if (tail) console.error(`\nLast Firefox/web-ext output:\n${tail}`);
  process.exitCode = 1;
} finally {
  client?.disconnect();
  try {
    await terminateProcessTree(child);
  } catch (error) {
    console.error(`[firefox-extension-smoke] cleanup failed: ${String(error)}`);
    process.exitCode = 1;
  }
}
