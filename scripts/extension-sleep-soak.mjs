/* global Buffer, URL, clearInterval, clearTimeout, console, process, setInterval, setTimeout */
// Real-Chrome soak of the extension worker sleeping (WorkerSleepService): with a wallet, the worker must end once no
// wallet page or site needs it, and come back cleanly for the popup, a site's EVM RPC and an eth_sendTransaction
// approval; a paired WalletConnect session keeps it running.
//
//   CHROME_BIN=<Chrome for Testing 147> node scripts/extension-sleep-soak.mjs --extension dist/extension/chrome \
//     [--out build/reports/background-sleep-soak] [--baseline] [--offline] [--skip-walletconnect]
//
// The worker is watched through the browser's target list only: a DevTools session attached to the worker would keep
// it running. Network use comes from Chrome's NetLog and CPU from the extension process. Ethereum is pointed at a
// local fake node (a custom node, as a person can add one), so the approval sends a real signed transaction; every
// other network uses its public nodes. `--baseline` measures an older build that never sleeps: 3 minutes after the
// popup closes, and nothing else. `--offline` sets the wallet up online, then starts the same profile again with no
// host resolving but this machine's (no registry, node or relay) and measures the popup closing there.
// `--from-approval` and `--from-walletconnect` skip ahead to step 5 or 6 when checking one of them again;
// `--debug-worker-console` records the worker's console, and the DevTools session it needs keeps the worker running.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HDNodeWallet, Transaction } from 'ethers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const extensionDir = path.resolve(root, option('--extension', 'dist/extension/chrome'));
const outDir = path.resolve(root, option('--out', `build/reports/background-sleep-soak/${new Date().toISOString().replace(/[:.]/g, '-')}`));
const baseline = process.argv.includes('--baseline');
const offline = process.argv.includes('--offline');
const skipWalletConnect = offline || process.argv.includes('--skip-walletconnect');
// Goes from the first worker end straight to the transaction approval (step 5).
const fromApproval = process.argv.includes('--from-approval');
// Debugging only: records the worker's console. A DevTools session keeps the worker running, so nothing it measures holds.
const workerConsole = process.argv.includes('--debug-worker-console');
// Debugging only: goes from the set-up straight to the WalletConnect step (step 6).
const fromWalletConnect = process.argv.includes('--from-walletconnect');
// About 2 minutes: the idle minute, Chrome's 30 s, and margin. Offline the registry retry alarm can start it again.
const END_WITHIN_MS = offline ? 240_000 : 150_000;
const chromeBinary = process.env.CHROME_BIN;
const PORT_EXTENSION = 'fw-fearless-extension';
const PASSWORD = 'fearless-sleep-soak-password';
const WORKER_END_LIMIT_MS = 5 * 60_000;
const BASELINE_WINDOW_MS = 3 * 60_000;
const WALLETCONNECT_HOLD_MS = 4 * 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
const log = (...args) => console.info(`[sleep-soak ${elapsed()}]`, ...args);
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function eventually(check, description, timeoutMs = 60_000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

// DevTools over the pipe Chrome opens with --remote-debugging-pipe: JSON messages separated by NUL.
class Cdp {
  #buffer = '';
  #callbacks = new Map();
  #id = 0;
  #listeners = new Set();

  constructor(chrome) {
    this.input = chrome.stdio[3];
    chrome.stdio[4].on('data', (chunk) => this.#onData(chunk));
  }

  onEvent(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  send(method, params = {}, sessionId, timeoutMs = 60_000) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#callbacks.delete(id);
        reject(new Error(`Timed out waiting for CDP ${method}`));
      }, timeoutMs);
      this.#callbacks.set(id, { resolve, reject, timer });
      this.input.write(`${JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params })}\0`);
    });
  }

  #onData(chunk) {
    this.#buffer += chunk.toString();
    let end = this.#buffer.indexOf('\0');
    while (end >= 0) {
      const raw = this.#buffer.slice(0, end);
      this.#buffer = this.#buffer.slice(end + 1);
      end = this.#buffer.indexOf('\0');
      if (!raw.trim()) continue;
      const message = JSON.parse(raw);
      if (message.id) {
        const callback = this.#callbacks.get(message.id);
        if (!callback) continue;
        this.#callbacks.delete(message.id);
        clearTimeout(callback.timer);
        if (message.error) callback.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
        else callback.resolve(message.result ?? {});
      } else {
        this.#listeners.forEach((listener) => listener(message));
      }
    }
  }
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId, 120_000);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'evaluation failed');
  }
  return result.result?.value;
}

// The extension's service worker, from the browser's target list. Attaching to it would keep it running.
class WorkerWatch {
  events = [];
  #alive = new Map();

  constructor(cdp, extensionId) {
    const isWorker = (info) => info.type === 'service_worker' && info.url.startsWith(`chrome-extension://${extensionId}/`);
    cdp.onEvent(({ method, params }) => {
      if (method === 'Target.targetCreated' && isWorker(params.targetInfo)) {
        this.#alive.set(params.targetInfo.targetId, Date.now());
        this.events.push({ at: Date.now(), event: 'started', targetId: params.targetInfo.targetId });
        log('worker started');
      }
      if (method === 'Target.targetDestroyed' && this.#alive.has(params.targetId)) {
        this.#alive.delete(params.targetId);
        this.events.push({ at: Date.now(), event: 'ended', targetId: params.targetId });
        log('worker ended');
      }
    });
  }

  get running() {
    return this.#alive.size > 0;
  }

  startedSince(at) {
    return this.events.find((event) => event.event === 'started' && event.at >= at);
  }

  endedSince(at) {
    return this.events.find((event) => event.event === 'ended' && event.at >= at);
  }

  async waitForEnd(since, limitMs = WORKER_END_LIMIT_MS) {
    const deadline = since + limitMs;
    while (Date.now() < deadline) {
      const ended = this.endedSince(since);
      if (ended && !this.running) return ended.at - since;
      await sleep(1_000);
    }
    return undefined;
  }
}

// CPU time of the extension's renderer process (where the worker runs), from `ps`: a child of this Chrome started with
// --extension-process. Process ids change when the worker starts again.
class CpuWatch {
  #seen = new Map();
  #samples = [];
  #timer;

  constructor(browserPid) {
    this.browserPid = String(browserPid);
  }

  start() {
    this.sample();
    this.#timer = setInterval(() => this.sample(), 2_000);
  }

  stop() {
    clearInterval(this.#timer);
    this.sample();
  }

  sample() {
    let output = '';
    try {
      output = execFileSync('ps', ['-axww', '-o', 'pid=,ppid=,time=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch {
      return;
    }
    const now = Date.now();
    for (const line of output.split('\n')) {
      if (!line.includes('--extension-process')) continue;
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s/);
      if (!match || match[2] !== this.browserPid) continue;
      const [, pid, , time] = match;
      const parts = time.split(':').map(Number);
      const seconds = parts.reduce((total, part) => total * 60 + part, 0);
      const previous = this.#seen.get(pid) ?? 0;
      if (seconds > previous) this.#samples.push({ at: now, seconds: seconds - previous });
      this.#seen.set(pid, seconds);
    }
  }

  between(from, to) {
    return Number(this.#samples.filter(({ at }) => at > from && at <= to).reduce((total, { seconds }) => total + seconds, 0).toFixed(2));
  }
}

// A JSON-RPC node for chain 1 that takes any signed transaction. The extension may connect only over TLS (its CSP has
// connect-src https: wss: ws:), so it serves HTTPS with a throwaway certificate; Chrome runs with
// --ignore-certificate-errors.
async function startFakeEthereumNode() {
  const keyFile = path.join(outDir, 'soak-node-key.pem');
  const certFile = path.join(outDir, 'soak-node-cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=127.0.0.1', '-days', '1',
    '-keyout', keyFile, '-out', certFile], { stdio: 'ignore' });
  const tls = { key: await fs.readFile(keyFile), cert: await fs.readFile(certFile) };
  await Promise.all([fs.rm(keyFile), fs.rm(certFile)]);
  const calls = [];
  const sent = [];
  let block = 0x1400000;
  const answer = ({ method, params = [] }) => {
    calls.push({ at: Date.now(), method });
    switch (method) {
      case 'eth_chainId': return '0x1';
      case 'net_version': return '1';
      case 'eth_blockNumber': return `0x${(block += 1).toString(16)}`;
      case 'eth_getBlockByNumber':
      case 'eth_getBlockByHash':
        return {
          number: `0x${block.toString(16)}`, hash: `0x${'ab'.repeat(32)}`, parentHash: `0x${'cd'.repeat(32)}`,
          timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}`, nonce: '0x0000000000000000', difficulty: '0x0',
          gasLimit: '0x1c9c380', gasUsed: '0x0', miner: `0x${'00'.repeat(20)}`, extraData: '0x',
          baseFeePerGas: '0x3b9aca00', transactions: [],
        };
      case 'eth_getBalance': return '0xde0b6b3a7640000';
      case 'eth_getTransactionCount': return '0x0';
      case 'eth_estimateGas': return '0x5208';
      case 'eth_gasPrice': return '0x77359400';
      case 'eth_maxPriorityFeePerGas': return '0x3b9aca00';
      case 'eth_feeHistory': return { oldestBlock: '0x1', baseFeePerGas: ['0x3b9aca00', '0x3b9aca00'], gasUsedRatio: [0.5], reward: [['0x3b9aca00']] };
      case 'eth_call': return `0x${'00'.repeat(32)}`;
      case 'eth_getCode': return '0x';
      case 'eth_sendRawTransaction': {
        const transaction = Transaction.from(params[0]);
        sent.push({ at: Date.now(), hash: transaction.hash, from: transaction.from, to: transaction.to, chainId: Number(transaction.chainId) });
        return transaction.hash;
      }
      case 'eth_getTransactionByHash': return sent.find(({ hash }) => hash === params[0]) ? { hash: params[0] } : null;
      case 'eth_getTransactionReceipt': return null;
      default: throw Object.assign(new Error(`Method ${method} is not served by the soak node`), { code: -32601 });
    }
  };
  const respond = (request) => {
    try {
      return { jsonrpc: '2.0', id: request.id, result: answer(request) };
    } catch (error) {
      return { jsonrpc: '2.0', id: request.id, error: { code: error.code ?? -32000, message: error.message } };
    }
  };
  const server = https.createServer(tls, (request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', '*');
    if (request.method === 'OPTIONS') return void response.end();
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch { response.writeHead(400); return void response.end(); }
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(Array.isArray(payload) ? payload.map(respond) : respond(payload)));
    });
  });
  return listen(server).then((url) => ({ url: url.replace('http:', 'https:'), calls, sent, close: () => new Promise((done) => server.close(done)) }));
}

function startDappServer() {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><head><meta charset="utf-8"><title>Sleep soak dApp</title></head><body>dApp</body></html>');
  });
  return listen(server).then((url) => ({ url: `${url}/dapp.html`, close: () => new Promise((done) => server.close(done)) }));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

function launchChrome(userDataDir, netLog, resolveNothing = false) {
  const args = [
    '--headless=new',
    '--enable-unsafe-extension-debugging',
    '--remote-debugging-pipe',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--disable-sync',
    '--no-default-browser-check',
    '--no-first-run',
    '--password-store=basic',
    // The soak node's throwaway certificate. This disposable profile ignores certificate errors for every host.
    '--ignore-certificate-errors',
    `--log-net-log=${netLog}`,
    '--net-log-capture-mode=Default',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];
  if (resolveNothing) args.unshift('--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1');
  return spawn(chromeBinary, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], env: { ...process.env, TMPDIR: os.tmpdir() } });
}

// A wallet page talks to the background over its own port, as the popup does.
const MESSAGING = `
  globalThis.__soak ??= (() => {
    const call = (message, request, accept) => new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: ${JSON.stringify(PORT_EXTENSION)} });
      const id = message + '.' + Date.now() + '.' + Math.random();
      port.onDisconnect.addListener(() => reject(new Error('Wallet port closed')));
      port.onMessage.addListener((data) => {
        if (data.id !== id) return;
        if (data.error) { port.disconnect(); reject(new Error(data.error)); return; }
        const value = 'subscription' in data && data.subscription !== undefined ? data.subscription : data.response;
        if (!accept || accept(value)) { port.disconnect(); resolve(value); }
      });
      port.postMessage({ id, message, request: request ?? null });
    });
    return { call };
  })();
  true;
`;

async function openPage(cdp, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  await eventually(() => evaluate(cdp, sessionId, `location.href.startsWith(${JSON.stringify(url.split('#')[0])}) && document.readyState === 'complete'`), `${url} to load`);
  return { targetId, sessionId };
}

async function openWalletPage(cdp, extensionId) {
  const page = await openPage(cdp, `chrome-extension://${extensionId}/popup.html`);
  await evaluate(cdp, page.sessionId, MESSAGING);
  return page;
}

const call = (cdp, page, message, request, accept) =>
  evaluate(cdp, page.sessionId, `__soak.call(${JSON.stringify(message)}, ${JSON.stringify(request ?? null)}${accept ? `, ${accept}` : ''})`);

async function loadKeyringFields() {
  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': path.join(root, 'src') } },
  });
  try {
    const { deriveUniversalWalletKeyringFields } = await server.ssrLoadModule('/src/util/universalWalletKeyringFields.ts');
    return (mnemonic) => ({ ...deriveUniversalWalletKeyringFields(mnemonic), ethereumAddress: HDNodeWallet.fromPhrase(mnemonic).address });
  } finally {
    await server.close();
  }
}

async function createWallet(cdp, page, keyringFields, fakeNodeUrl) {
  const createdAt = Date.now();
  await call(cdp, page, 'pri(keyring.changePassword)', { newPassword: PASSWORD, oldPassword: '' });
  const mnemonic = await call(cdp, page, 'pri(keyring.generateMnemonic)', { walletEcosystem: 'substrate', wordCount: 24 });
  const fields = keyringFields(mnemonic);
  const meta = { ...fields, name: 'Sleep soak', whenCreated: Date.now() };
  // As the popup creates a wallet: the Ethereum key first, then the Substrate key that names it.
  const ethereumAddress = await call(cdp, page, 'pri(accounts.create)', {
    meta: { ...meta, ethereumAddress: '' },
    suri: `${mnemonic}/m/44'/60'/0'/0/0`,
    type: 'ethereum',
    walletEcosystem: 'substrate',
    requireFreshGeneration: true,
  });
  assert(ethereumAddress.toLowerCase() === fields.ethereumAddress.toLowerCase(), 'The Ethereum key is not the phrase\'s default account');
  const address = await call(cdp, page, 'pri(accounts.create)', {
    meta: { ...meta, ethereumAddress },
    suri: mnemonic,
    type: 'sr25519',
    walletEcosystem: 'substrate',
    requireFreshGeneration: true,
  });
  await call(cdp, page, 'pri(onboarding.setComplete)', null);
  await call(cdp, page, 'pri(accounts.update.current)', { address, walletEcosystem: 'substrate' });
  assert(await call(cdp, page, 'pri(keyring.unlock)', { password: PASSWORD }) === true, 'The new wallet did not unlock');
  // Ethereum through the local node, as a custom node the person chose.
  const networks = await call(cdp, page, 'pri(networkMap.getSubscription)', null, '(map) => !!map && !!Object.values(map).find((n) => n.name === "Ethereum")');
  const ethereum = Object.values(networks).find((network) => network.name === 'Ethereum');
  const expected = { currentProvider: ethereum.currentProvider, customNodes: ethereum.customNodes, customProviders: ethereum.customProviders, isManual: ethereum.isManual };
  await call(cdp, page, 'pri(networkMap.upsert)', {
    network: { ...ethereum, customNodes: [{ name: 'Sleep soak node', url: fakeNodeUrl }], customProviders: { 'Sleep soak node': fakeNodeUrl }, currentProvider: fakeNodeUrl, isManual: true },
    expected,
  });
  return { address, ethereumAddress, createdAt };
}

// The dApp's provider calls, kept on the page so a later step can read them.
const DAPP = `
  globalThis.__dapp ??= (() => {
    const events = [];
    const provider = () => window.fearlessWallet;
    const on = () => ['connect', 'chainChanged', 'accountsChanged'].forEach((name) => provider().on(name, (payload) => events.push({ name, payload, at: Date.now() })));
    const request = (method, params) => provider().request({ method, params });
    return { events, on, request };
  })();
  true;
`;

async function withTimer(work) {
  const at = Date.now();
  const value = await work();
  return { value, ms: Date.now() - at };
}

async function waitForNewPopupWindow(cdp, extensionId, since) {
  return eventually(async () => {
    const { targetInfos } = await cdp.send('Target.getTargets');
    return targetInfos.find((info) => info.type === 'page' && info.url.startsWith(`chrome-extension://${extensionId}/popup.html`) && !since.has(info.targetId));
  }, 'the request window');
}

// A NetLog is closed when Chrome exits; one cut short is closed here.
function readNetLog(text) {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(`${text.trimEnd().replace(/,$/, '')}]}`);
  }
}

function summarizeNetLog(netLog, windows) {
  const constants = netLog.constants;
  const types = Object.fromEntries(Object.entries(constants.logEventTypes).map(([name, id]) => [id, name]));
  const offset = Number(constants.timeTickOffset);
  const requests = [];
  const frames = [];
  const failures = [];
  for (const event of netLog.events ?? []) {
    const type = types[event.type];
    const at = offset + Number(event.time);
    if (type === 'URL_REQUEST_START_JOB' && event.phase === 1 && event.params?.url) requests.push({ at, url: event.params.url });
    else if (type === 'WEBSOCKET_SENT_FRAME_HEADER' || type === 'WEBSOCKET_RECV_FRAME_HEADER') frames.push({ at });
    else if (type === 'REQUEST_ALIVE' && event.phase === 2 && event.params?.net_error) failures.push({ at });
  }
  const external = ({ url }) => !/^https?:\/\/127\.0\.0\.1[:/]/.test(url) && !url.startsWith('chrome');
  return windows.map(({ name, from, to }) => {
    const inWindow = ({ at }) => at >= from && at < to;
    const hosts = {};
    requests.filter(inWindow).filter(external).forEach(({ url }) => {
      const host = new URL(url).host;
      hosts[host] = (hosts[host] ?? 0) + 1;
    });
    return {
      name,
      seconds: Math.round((to - from) / 1000),
      requests: requests.filter(inWindow).filter(external).length,
      localRequests: requests.filter(inWindow).filter((request) => !external(request)).length,
      failedRequests: failures.filter(inWindow).length,
      webSocketFrames: frames.filter(inWindow).length,
      hosts,
    };
  });
}

async function main() {
  assert(chromeBinary, 'Set CHROME_BIN to Chrome for Testing (branded Chrome ignores unpacked extensions loaded this way).');
  await fs.access(path.join(extensionDir, 'manifest.json'));
  await fs.mkdir(outDir, { recursive: true });
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-sleep-soak-'));
  const netLogPath = path.join(outDir, 'netlog.json');
  const keyringFields = await loadKeyringFields();
  const node = await startFakeEthereumNode();
  const dapp = await startDappServer();
  const stderr = [];
  const start = (netLog, resolveNothing) => {
    const child = launchChrome(userDataDir, netLog, resolveNothing);
    child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
    return child;
  };
  let chrome = start(offline ? path.join(outDir, 'netlog-online-setup.json') : netLogPath, false);
  let cdp = new Cdp(chrome);
  let cpu = new CpuWatch(chrome.pid);
  const report = { build: extensionDir, baseline, offline, chrome: chromeBinary, startedAt: new Date().toISOString(), steps: [], windows: [] };
  const step = (name, result) => {
    report.steps.push({ name, at: new Date().toISOString(), ...result });
    log(name, JSON.stringify(result));
  };
  const windows = [];
  let walletConnect;

  try {
    await cdp.send('Target.setDiscoverTargets', { discover: true });
    const { id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: extensionDir });
    let worker = new WorkerWatch(cdp, extensionId);
    if (workerConsole) {
      const lines = [];
      report.workerConsole = lines;
      cdp.onEvent(async ({ method, params, sessionId }) => {
        if (method === 'Target.targetCreated' && params.targetInfo.type === 'service_worker' && params.targetInfo.url.includes(extensionId)) {
          const { sessionId: attached } = await cdp.send('Target.attachToTarget', { targetId: params.targetInfo.targetId, flatten: true });
          await cdp.send('Runtime.enable', {}, attached).catch(() => undefined);
        }
        if (method === 'Runtime.consoleAPICalled' && sessionId) {
          lines.push(`${new Date().toISOString()} ${params.type} ${params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ').slice(0, 500)}`);
        }
        if (method === 'Runtime.exceptionThrown' && sessionId) lines.push(`${new Date().toISOString()} exception ${params.exceptionDetails?.exception?.description?.slice(0, 500)}`);
      });
    }
    report.extensionId = extensionId;
    report.version = JSON.parse(await fs.readFile(path.join(extensionDir, 'manifest.json'), 'utf8')).version;
    cpu.start();

    // A wallet, created and set up in a wallet tab as the popup would.
    let wallet = await openWalletPage(cdp, extensionId);
    await eventually(() => call(cdp, wallet, 'pri(app.isReady)', null), 'the background to answer');
    const account = await createWallet(cdp, wallet, keyringFields, node.url);
    step('wallet created', { address: account.address, ethereumAddress: account.ethereumAddress });

    // A dApp the wallet is connected to, which listens for the provider's events.
    const site = await openPage(cdp, dapp.url);
    await evaluate(cdp, site.sessionId, DAPP);
    await eventually(() => evaluate(cdp, site.sessionId, 'Boolean(window.fearlessWallet?.request)'), 'the injected provider');
    await evaluate(cdp, site.sessionId, '__dapp.connecting = __dapp.request("eth_requestAccounts"); true');
    const authorization = await call(cdp, wallet, 'pri(authorize.requests)', null, '(requests) => Array.isArray(requests) && requests.some((r) => (r.request?.accountAuthType ?? r.accountAuthType) === "evm")');
    const evmRequest = authorization.find((request) => (request.request?.accountAuthType ?? request.accountAuthType) === 'evm');
    // An EVM grant names the wallet; the site gets that wallet's Ethereum address.
    await call(cdp, wallet, 'pri(authorize.approve)', { id: evmRequest.id, authorizedAccounts: [account.address] });
    const connected = await evaluate(cdp, site.sessionId, '__dapp.connecting');
    assert(connected?.[0]?.toLowerCase() === account.ethereumAddress.toLowerCase(), `The dApp got ${JSON.stringify(connected)}`);
    await evaluate(cdp, site.sessionId, '__dapp.on(); true');
    const chainId = await evaluate(cdp, site.sessionId, '__dapp.request("eth_chainId")');
    step('dApp connected', { accounts: connected, chainId });

    // A new wallet starts a discovery sweep of up to 24 networks, which keeps the worker running until it is done (as
    // the daily sweep does). Measure it apart: the steps below are about a wallet with nothing in progress.
    const sweep = await withTimer(() => eventually(async () => {
      const { assetDiscoverySweep } = await evaluate(cdp, wallet.sessionId, 'chrome.storage.local.get("assetDiscoverySweep")');
      return assetDiscoverySweep?.lastRun >= account.createdAt;
    }, 'the first discovery sweep', 10 * 60_000, 2_000));
    step('first discovery sweep finished', { ms: sweep.ms });

    if (offline) {
      // Chrome starts again on the same profile, which keeps the wallet and the network list it read online.
      await cdp.send('Target.closeTarget', { targetId: wallet.targetId });
      cpu.stop();
      chrome.kill('SIGTERM');
      await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), sleep(15_000)]);
      chrome = start(netLogPath, true);
      cdp = new Cdp(chrome);
      cpu = new CpuWatch(chrome.pid);
      await cdp.send('Target.setDiscoverTargets', { discover: true });
      const { id } = await cdp.send('Extensions.loadUnpacked', { path: extensionDir });
      assert(id === extensionId, `The extension came back as ${id}, not ${extensionId}`);
      worker = new WorkerWatch(cdp, extensionId);
      cpu.start();
      wallet = await openWalletPage(cdp, extensionId);
      await eventually(() => call(cdp, wallet, 'pri(app.isReady)', null), 'the background to answer offline');
      step('started again offline', {});
    }

    // Let the wallet connect and read its balances, as after opening the popup.
    let mark = Date.now();
    await sleep(30_000);
    windows.push({ name: 'popup open, 30 s', from: mark, to: Date.now() });

    if (!fromWalletConnect) {
      // 1. The popup closes; the dApp tab stays open, idle.
      await cdp.send('Target.closeTarget', { targetId: wallet.targetId });
      mark = Date.now();
      if (baseline) {
        await sleep(BASELINE_WINDOW_MS);
        windows.push({ name: 'after the popup closed, 3 min', from: mark, to: Date.now() });
        step('baseline: 3 minutes after the popup closed', { workerRunning: worker.running, workerEnded: !!worker.endedSince(mark) });
        return;
      }
      const endAfterClose = await worker.waitForEnd(mark);
      windows.push({ name: 'popup closed until the worker ended', from: mark, to: Date.now() });
      step('worker ended after the popup closed', { ms: endAfterClose });
      assert(endAfterClose !== undefined && endAfterClose <= END_WITHIN_MS, `The worker did not end within ${END_WITHIN_MS / 1000} s (${endAfterClose})`);

      if (!fromApproval) {
        // 2. Nothing wakes it while nobody uses the wallet. Offline the registry retry alarm, which exists only while the
        // registry is unavailable, may start it; such a start opens no node connection.
        mark = Date.now();
        await sleep(offline ? 3 * 60_000 : 60_000);
        windows.push({ name: offline ? 'asleep, 3 min' : 'asleep, 60 s', from: mark, to: Date.now() });
        step('asleep', { restarts: worker.events.filter(({ event, at }) => event === 'started' && at >= mark).length });
        if (!offline) assert(!worker.startedSince(mark), 'The worker started again with nothing asking for it');
        if (offline) return;

        // 3. The site asks its EVM node something: the worker starts, reconnects Ethereum and answers.
        mark = Date.now();
        const blockNumber = await withTimer(() => evaluate(cdp, site.sessionId, '__dapp.request("eth_blockNumber")'));
        const eventsBefore = (await evaluate(cdp, site.sessionId, '__dapp.events.length'));
        await sleep(12_000);
        const eventsAfter = await evaluate(cdp, site.sessionId, '__dapp.events.slice(-3)');
        step('site EVM RPC woke the worker', {
          startedForIt: !!worker.startedSince(mark), result: blockNumber.value, ms: blockNumber.ms,
          // The provider's events (its subscription went with the old worker) arrive again.
          eventsAfterRestart: eventsAfter.filter(({ at }) => at > mark).map(({ name }) => name),
          eventCountBefore: eventsBefore,
        });
        // Offline the registry retry alarm may have started it just before.
        assert(offline || worker.startedSince(mark), 'The site request did not start the worker');
        assert(/^0x[0-9a-f]+$/.test(blockNumber.value), `eth_blockNumber answered ${blockNumber.value}`);
        assert(eventsAfter.some(({ at, name }) => at > mark && name === 'connect'), "The dApp's events did not resume");
        const endAfterSite = await worker.waitForEnd(mark + blockNumber.ms);
        windows.push({ name: 'site request until the worker ended', from: mark, to: Date.now() });
        step('worker ended after the site request', { ms: endAfterSite });
        assert(endAfterSite !== undefined && endAfterSite <= END_WITHIN_MS, 'The worker did not end after the site request');

        // 4. The popup opens again: the worker starts, the wallet answers and reconnects; it ends again once closed.
        mark = Date.now();
        wallet = await openWalletPage(cdp, extensionId);
        // The balances the stopped worker had read reach the popup before the wallet reads them again: the payload with the
        // stored ETH amount is stamped in the page and compared with the node's first eth_getBalance.
        const ethShown = Promise.race([
          call(cdp, wallet, 'pri(balance.subscription)', null, `(value) => {
            const eth = value?.details?.flatMap((group) => group.balances ?? [])
              .find((item) => /^ethereum$/i.test(item.name) && /^eth$/i.test(item.symbol) && Number(item.total ?? item.free) > 0);
            if (eth) value.__eth = { total: eth.total ?? eth.free, state: eth.state, at: Date.now() };
            return !!eth;
          }`),
          sleep(60_000).then(() => undefined),
        ]);
        const ready = await withTimer(() => eventually(() => call(cdp, wallet, 'pri(app.isReady)', null), 'the popup to be answered'));
        const locked = await call(cdp, wallet, 'pri(keyring.keyringIsLocked)', null);
        const shown = (await ethShown)?.__eth;
        await sleep(20_000);
        const nodeCallsWhileOpen = node.calls.filter(({ at }) => at > mark);
        const freshRead = nodeCallsWhileOpen.find(({ method }) => method === 'eth_getBalance');
        step('popup woke the worker', {
          startedForIt: !!worker.startedSince(mark), answeredInMs: ready.ms, keyringLocked: locked,
          ethShown: shown ? { ...shown, msAfterOpening: shown.at - mark, msBeforeFreshRead: freshRead ? freshRead.at - shown.at : null } : null,
          ethereumNodeCallsIn20s: nodeCallsWhileOpen.length,
          balanceReadsIn20s: nodeCallsWhileOpen.filter(({ method }) => method === 'eth_getBalance').length,
        });
        assert(offline || worker.startedSince(mark), 'Opening the popup did not start the worker');
        assert(shown, 'The popup never got the Ethereum balance');
        assert(freshRead, 'The wallet did not read the Ethereum balance again after the popup opened');
        assert(shown.at <= freshRead.at, 'The popup got the Ethereum balance only from the fresh read, not from the cache first');
        windows.push({ name: 'popup reopened, 20 s', from: mark, to: Date.now() });
        await cdp.send('Target.closeTarget', { targetId: wallet.targetId });
        mark = Date.now();
        const endAfterPopup = await worker.waitForEnd(mark);
        step('worker ended after the popup closed again', { ms: endAfterPopup });
        assert(endAfterPopup !== undefined && endAfterPopup <= END_WITHIN_MS, 'The worker did not end after the second popup');
      }

      // 5. The site sends a transaction: the worker starts, opens the approval window, and the approval sends it.
      mark = Date.now();
      const known = new Set((await cdp.send('Target.getTargets')).targetInfos.map(({ targetId }) => targetId));
      await evaluate(cdp, site.sessionId, `__dapp.sending = __dapp.request("eth_sendTransaction", [{ from: ${JSON.stringify(account.ethereumAddress)}, to: ${JSON.stringify(account.ethereumAddress)}, value: "0x0" }]).then((hash) => ({ hash }), (error) => ({ error: error.message })); true`);
      const siteAnswer = () => evaluate(cdp, site.sessionId, 'Promise.race([__dapp.sending, new Promise((resolve) => setTimeout(() => resolve("waiting"), 100))])');
      const approvalInfo = await waitForNewPopupWindow(cdp, extensionId, known).catch(async (error) => {
        throw new Error(`${error.message}; the site has ${JSON.stringify(await siteAnswer())}`);
      });
      step('request window opened', { url: approvalInfo.url.replace(/^chrome-extension:\/\/[^/]+\//, '') });
      const { sessionId: approvalSession } = await cdp.send('Target.attachToTarget', { targetId: approvalInfo.targetId, flatten: true });
      const approval = { targetId: approvalInfo.targetId, sessionId: approvalSession };
      await cdp.send('Runtime.enable', {}, approvalSession);
      await eventually(() => evaluate(cdp, approvalSession, 'document.readyState === "complete" && Boolean(chrome?.runtime?.connect)'), 'the approval window');
      await evaluate(cdp, approvalSession, MESSAGING);
      // The worker restarted, so the wallet is locked: the person unlocks it in the window first.
      const unlocked = await call(cdp, approval, 'pri(keyring.unlock)', { password: PASSWORD });
      const requests = await Promise.race([
        call(cdp, approval, 'pri(signing.evmRequests)', null, '(requests) => !!requests && Object.values(requests).some((r) => r.method === "eth_sendTransaction")'),
        sleep(60_000).then(() => undefined),
      ]);
      if (!requests) throw new Error(`No transaction request to approve; the site has ${JSON.stringify(await siteAnswer())}`);
      const pending = Object.values(requests).find((request) => request.method === 'eth_sendTransaction');
      // The wallet closes the request window once nothing is left to approve, which also drops this call's port: the
      // outcome is read on the site.
      await evaluate(cdp, approvalSession, `__soak.call("pri(signing.approve)", ${JSON.stringify({ id: pending.id, kind: 'evm' })}).catch(() => undefined); true`);
      const sentResult = await eventually(() => evaluate(cdp, site.sessionId, '__dapp.sending'), 'the dApp to get its answer');
      const broadcast = node.sent.find(({ hash }) => hash === sentResult.hash);
      step('eth_sendTransaction approval woke the worker', {
        startedForIt: !!worker.startedSince(mark), unlocked, result: sentResult, sentToNode: broadcast ?? null,
      });
      assert(offline || worker.startedSince(mark), 'The transaction request did not start the worker');
      assert(sentResult.hash && broadcast?.chainId === 1, `The approval did not send the transaction: ${JSON.stringify(sentResult)}`);
      await cdp.send('Target.closeTarget', { targetId: approval.targetId }).catch(() => undefined);
      const closedApproval = Date.now();
      const endAfterApproval = await worker.waitForEnd(closedApproval);
      windows.push({ name: 'transaction request until the worker ended', from: mark, to: Date.now() });
      step('worker ended after the approval', { ms: endAfterApproval });
      assert(endAfterApproval !== undefined && endAfterApproval <= END_WITHIN_MS, 'The worker did not end after the approval');

    }
    // 6. A paired WalletConnect session keeps the worker running without any page open.
    if (!skipWalletConnect) {
      // Jumping here, the set-up's wallet tab is still open, and an open wallet page alone keeps the worker running.
      if (fromWalletConnect) await cdp.send('Target.closeTarget', { targetId: wallet.targetId });
      walletConnect = await startWalletConnectDapp();
      wallet = await openWalletPage(cdp, extensionId);
      await eventually(() => call(cdp, wallet, 'pri(app.isReady)', null), 'the popup to be answered');
      await call(cdp, wallet, 'pri(keyring.unlock)', { password: PASSWORD });
      const { uri, approval: sessionApproval } = await walletConnect.client.connect({
        requiredNamespaces: { eip155: { chains: ['eip155:1'], methods: ['eth_sendTransaction', 'personal_sign'], events: ['accountsChanged', 'chainChanged'] } },
      });
      const sessionApproved = sessionApproval();
      sessionApproved.catch(() => undefined);
      const paired = await Promise.race([call(cdp, wallet, 'pri(walletConnect.connect)', { uri }), sleep(90_000).then(() => 'no answer in 90 s')]);
      log('WalletConnect pairing answered', JSON.stringify(paired ?? null).slice(0, 300));
      const proposals = await Promise.race([
        call(cdp, wallet, 'pri(walletConnect.requests.connect.subscribe)', null, '(requests) => Array.isArray(requests) && requests.length > 0'),
        sleep(90_000).then(() => undefined),
      ]);
      assert(proposals, 'The wallet got no session proposal');
      // An eip155 session names the account by its Ethereum address (eip155:1:0x...).
      const approvedSession = await call(cdp, wallet, 'pri(walletConnect.session.approve)', { id: proposals[0].id, accounts: [account.ethereumAddress] });
      assert(approvedSession?.status === true, `The wallet did not approve the session: ${JSON.stringify(approvedSession)}`);
      const session = await sessionApproved;
      step('WalletConnect session paired', { topic: session.topic, accounts: session.namespaces.eip155?.accounts });
      await cdp.send('Target.closeTarget', { targetId: wallet.targetId });
      mark = Date.now();
      await sleep(WALLETCONNECT_HOLD_MS);
      windows.push({ name: 'WalletConnect session, no page, 4 min', from: mark, to: Date.now() });
      step('WalletConnect session kept the worker running', { workerRunning: worker.running, endedMeanwhile: !!worker.endedSince(mark) });
      assert(worker.running && !worker.endedSince(mark), 'The worker ended while a WalletConnect session was open');
      await walletConnect.client.disconnect({ topic: session.topic, reason: { code: 6000, message: 'Soak finished' } });
      mark = Date.now();
      const endAfterSession = await worker.waitForEnd(mark);
      windows.push({ name: 'WalletConnect session ended until the worker ended', from: mark, to: Date.now() });
      step('worker after the WalletConnect session ended', { endedInMs: endAfterSession ?? null });
    }
  } finally {
    cpu.stop();
    chrome.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), sleep(10_000)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
    await walletConnect?.close().catch(() => undefined);
    await node.close();
    await dapp.close();
    report.ethereumNodeCalls = node.calls.length;
    try {
      const netLog = readNetLog(await fs.readFile(netLogPath, 'utf8'));
      report.windows = summarizeNetLog(netLog, windows).map((window, index) => ({
        ...window,
        extensionCpuSeconds: cpu.between(windows[index].from, windows[index].to),
      }));
    } catch (error) {
      report.netLogError = error.message;
    }
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await fs.writeFile(path.join(outDir, 'chrome-stderr.log'), stderr.join('').slice(-200_000));
    await fs.rm(userDataDir, { recursive: true, force: true });
    log('report', path.join(outDir, 'report.json'));
    console.info(JSON.stringify(report.windows, null, 2));
  }
}

// The dApp side of a WalletConnect pairing, with its records kept in memory.
async function startWalletConnectDapp() {
  const walletConnect = await import('@walletconnect/sign-client');
  const SignClient = walletConnect.SignClient ?? walletConnect.default?.SignClient ?? walletConnect.default;
  const values = new Map();
  const storage = {
    getKeys: async () => [...values.keys()],
    getEntries: async () => [...values.entries()],
    getItem: async (key) => values.get(key),
    setItem: async (key, value) => void values.set(key, value),
    removeItem: async (key) => void values.delete(key),
  };
  const consts = await fs.readFile(path.join(root, 'src/extension/background/extension-base/src/services/wallet-connect-service/consts.ts'), 'utf8');
  const projectId = consts.match(/PROJECT_ID_EXTENSION = '([0-9a-f]+)'/)[1];
  const client = await SignClient.init({
    projectId,
    relayUrl: 'wss://relay.walletconnect.com',
    metadata: { name: 'Fearless sleep soak', description: 'Background sleep soak dApp', url: 'https://fearlesswallet.io/', icons: [] },
    storage,
  });
  // The wallet reads a proposal's `expiry` (isProposalExpired), which this SDK no longer sends: it sends only
  // `expiryTimestamp`, and the wallet then refuses the proposal as expired. Like an older dApp, this one sends both.
  const encode = client.core.crypto.encode.bind(client.core.crypto);
  client.core.crypto.encode = (topic, payload, options) => encode(topic, payload?.method === 'wc_sessionPropose'
    ? { ...payload, params: { ...payload.params, expiry: payload.params.expiryTimestamp } }
    : payload, options);
  return { client, close: async () => client.core.relayer.transportClose() };
}

main()
  .catch((error) => {
    console.error(`[sleep-soak] FAILED: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  })
  // The WalletConnect client's timers would keep Node running.
  .finally(() => process.exit());
