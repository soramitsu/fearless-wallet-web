/* global clearTimeout, console, process, setTimeout, structuredClone */
// Real-Chrome check of the extension's two WalletConnect roles in one worker. The dApps and the mobile wallet are the
// in-repo WalletConnect client, or, with WALLETCONNECT_REFERENCE_SDK, the SDK most dApps ship (installed outside this
// repository; scripts/walletconnect-peer.mjs):
// - the wallet: dApps pair with Fearless, which approves, signs a personal_sign and rejects a proposal;
// - the dApp side: Fearless pairs with a mobile wallet and forwards a site's personal_sign to it.
// Both roles run in one worker after a restart, which is how most people start the extension once anything is stored.
// A dApp that pairs after that restart must still get the wallet's answer, every session must survive in storage, and
// after another restart the wallet must list only dApp sessions while the mobile account still signs.
//
//   CHROME_BIN=<Chrome for Testing 147> [WALLETCONNECT_REFERENCE_SDK=<dir>] node scripts/walletconnect-dual-role-smoke.mjs \
//     [--extension dist/extension/chrome] [--out build/reports/walletconnect-pairing-smoke/<time>] [--worker-console] [--keep-going]
//
// It needs the network: the wallet reads the registry, and every side uses the public relay (wss://relay.walletconnect.com).
// The dApps and the mobile wallet run here in Node with their records in memory.
// `--worker-console` adds the worker's console and its relay frames (method, id and topic) to the report.
// `--keep-going` records a failed check and runs the rest, to see everything a build gets wrong in one run.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeAddress } from '@polkadot/util-crypto';
import { HDNodeWallet, Wallet, getBytes, hexlify, toUtf8Bytes, verifyMessage } from 'ethers';
import { startWalletConnectPeer } from './walletconnect-peer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const extensionDir = path.resolve(root, option('--extension', 'dist/extension/chrome'));
const outDir = path.resolve(root, option('--out', `build/reports/walletconnect-pairing-smoke/${new Date().toISOString().replace(/[:.]/g, '-')}`));
const chromeBinary = process.env.CHROME_BIN;
const workerConsole = process.argv.includes('--worker-console');
const keepGoing = process.argv.includes('--keep-going');
const PORT_EXTENSION = 'fw-fearless-extension';
const PASSWORD = 'fearless-walletconnect-smoke-password';
const RELAY_MS = 90_000;
const NAMESPACES = { eip155: { chains: ['eip155:1'], methods: ['personal_sign', 'eth_sendTransaction'], events: ['accountsChanged', 'chainChanged'] } };
const WALLET_CONNECT_RECORD = 'fearless:walletconnect:v1';
// The peers here are separate apps: without this, the SDK gives every client in this process one shared Core.
process.env.DISABLE_GLOBAL_CORE = 'true';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// The SDK rejects a request with the peer's JSON-RPC error object, not an Error.
const describeError = (error) => (typeof error?.message === 'string' ? error.message : JSON.stringify(error) ?? String(error));
const started = Date.now();
const log = (...args) => console.info(`[walletconnect-smoke ${((Date.now() - started) / 1000).toFixed(1)}s]`, ...args);
function assert(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
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

// Settles with the promise, or with `undefined` after `ms`.
function within(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((resolve) => (timer = setTimeout(resolve, ms)))]).finally(() => clearTimeout(timer));
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
      if (!message.id) this.#listeners.forEach((listener) => listener(message));
      const callback = message.id && this.#callbacks.get(message.id);
      if (!callback) continue;
      this.#callbacks.delete(message.id);
      clearTimeout(callback.timer);
      if (message.error) callback.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      else callback.resolve(message.result ?? {});
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

function launchChrome(userDataDir) {
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
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];
  return spawn(chromeBinary, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], env: { ...process.env, TMPDIR: os.tmpdir() } });
}

// A wallet page talks to the background over its own port, as the popup does. `read` waits for the handler's own
// answer: a subscription first replays what it last published, which can be older. `pairMobile` keeps one port open
// for a whole mobile pairing, as the pairing screen does: the background drops an attempt whose page went away.
const MESSAGING = `
  globalThis.__smoke ??= (() => {
    const connect = () => chrome.runtime.connect({ name: ${JSON.stringify(PORT_EXTENSION)} });
    const call = (message, request, accept, answerOnly) => new Promise((resolve, reject) => {
      const port = connect();
      const id = message + '.' + Date.now() + '.' + Math.random();
      port.onDisconnect.addListener(() => reject(new Error('Wallet port closed')));
      port.onMessage.addListener((data) => {
        if (data.id !== id) return;
        if (data.error) { port.disconnect(); reject(new Error(data.error)); return; }
        const pushed = 'subscription' in data && data.subscription !== undefined;
        if (answerOnly && pushed) return;
        const value = pushed ? data.subscription : data.response;
        if (!accept || accept(value)) { port.disconnect(); resolve(value); }
      });
      port.postMessage({ id, message, request: request ?? null });
    });
    const read = (message, request) => call(message, request, undefined, true);
    const pairings = {};
    const pairMobile = (attempt) => new Promise((resolve, reject) => {
      const port = connect();
      const pairing = (pairings[attempt] = { results: [] });
      const start = 'pairing.' + attempt;
      const watch = 'subscribePairing.' + attempt;
      port.onDisconnect.addListener(() => { pairing.closed = true; reject(new Error('Wallet port closed')); });
      port.onMessage.addListener((data) => {
        if (data.id === start) {
          if (data.error) { reject(new Error(data.error)); return; }
          port.postMessage({ id: watch, message: 'pri(walletConnect.app.subscribePairing)', request: data.response });
          resolve(data.response);
        } else if (data.id === watch) {
          if (data.error) pairing.error = data.error;
          else if ('subscription' in data && data.subscription !== undefined) pairing.results.push(data.subscription);
        }
      });
      port.postMessage({ id: start, message: 'pri(walletConnect.app.pairing)', request: attempt });
    });
    return { call, read, pairings, pairMobile };
  })();
  true;
`;

async function openWalletPage(cdp, extensionId) {
  const url = `chrome-extension://${extensionId}/popup.html`;
  const { targetId } = await cdp.send('Target.createTarget', { url });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  await eventually(() => evaluate(cdp, sessionId, `location.href.startsWith(${JSON.stringify(url)}) && document.readyState === 'complete'`), 'the wallet page to load');
  await evaluate(cdp, sessionId, MESSAGING);
  return { targetId, sessionId };
}

const call = (cdp, page, message, request, accept) =>
  evaluate(cdp, page.sessionId, `__smoke.call(${JSON.stringify(message)}, ${JSON.stringify(request ?? null)}${accept ? `, ${accept}` : ''})`);
const read = (cdp, page, message, request) =>
  evaluate(cdp, page.sessionId, `__smoke.read(${JSON.stringify(message)}, ${JSON.stringify(request ?? null)})`);

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

async function createWallet(cdp, page, keyringFields) {
  await call(cdp, page, 'pri(keyring.changePassword)', { newPassword: PASSWORD, oldPassword: '' });
  const mnemonic = await call(cdp, page, 'pri(keyring.generateMnemonic)', { walletEcosystem: 'substrate', wordCount: 24 });
  const fields = keyringFields(mnemonic);
  const meta = { ...fields, name: 'WalletConnect smoke', whenCreated: Date.now() };
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
  return { address, ethereumAddress };
}

// A peer with its records in memory, a dApp or the mobile wallet: the in-repo client by default, or the reference SDK
// (scripts/walletconnect-peer.mjs). A dApp records the proposals it sends.
async function startPeer(name) {
  return startWalletConnectPeer(root, name, 'WalletConnect pairing smoke');
}

// The mobile wallet approves Fearless's pairing with one Substrate account on every offered chain and one EVM account
// on Ethereum, and signs every personal_sign Fearless forwards to it.
async function startMobileWallet() {
  const peer = await startPeer('Fearless smoke mobile wallet');
  const evm = Wallet.createRandom();
  const substrate = encodeAddress(randomBytes(32), 42);
  const mobile = { ...peer, evm, substrate, approvals: [], requests: [], errors: [] };
  peer.client.on('session_proposal', async ({ id, params }) => {
    try {
      const polkadot = params.optionalNamespaces.polkadot;
      const namespaces = {
        polkadot: { chains: polkadot.chains, methods: polkadot.methods, events: [], accounts: polkadot.chains.map((chain) => `${chain}:${substrate}`) },
        eip155: { chains: ['eip155:1'], methods: params.optionalNamespaces.eip155.methods, events: ['accountsChanged', 'chainChanged'], accounts: [`eip155:1:${evm.address}`] },
      };
      const { topic, acknowledged } = await peer.client.approve({ id, namespaces });
      mobile.approvals.push({ topic, acknowledged: acknowledged().then(() => true, (error) => error.message) });
    } catch (error) {
      mobile.errors.push(`approve: ${error.message}`);
    }
  });
  peer.client.on('session_request', async ({ id, topic, params }) => {
    mobile.requests.push({ id, topic, method: params.request.method, chainId: params.chainId });
    try {
      const [message, address] = params.request.params;
      if (params.request.method !== 'personal_sign' || address.toLowerCase() !== evm.address.toLowerCase())
        throw new Error(`The smoke wallet signs only personal_sign for ${evm.address}`);
      const result = await evm.signMessage(getBytes(message));
      await peer.client.respond({ topic, response: { id, jsonrpc: '2.0', result } });
    } catch (error) {
      mobile.errors.push(`request: ${error.message}`);
      await peer.client.respond({ topic, response: { id, jsonrpc: '2.0', error: { code: 5000, message: error.message } } }).catch(() => undefined);
    }
  });
  return mobile;
}

const describeProposal = (params) => ({
  hasExpiry: Object.hasOwn(params, 'expiry'),
  expiryTimestamp: params.expiryTimestamp ?? null,
  secondsLeft: typeof params.expiryTimestamp === 'number' ? params.expiryTimestamp - Math.floor(Date.now() / 1000) : null,
  requiredNamespaces: params.requiredNamespaces,
  optionalNamespaces: params.optionalNamespaces,
});

// The site that asks the mobile account to sign: a plain page the content script injects the EVM provider into.
function startSite() {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><head><meta charset="utf-8"><title>Fearless WalletConnect smoke site</title></head><body>smoke</body></html>');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}/`, host: `127.0.0.1:${port}`, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

async function openSitePage(cdp, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  await eventually(() => evaluate(cdp, sessionId, `location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && typeof window.fearlessWallet?.request === 'function'`), 'the site and its provider');
  return { targetId, sessionId };
}

// The site's personal_sign from the mobile account: Fearless queues it, the person approves, and Fearless forwards it
// to the mobile wallet over WalletConnect.
async function signOnMobile(cdp, wallet, site, mobile, mobileAccount, label) {
  const message = `Fearless WalletConnect smoke mobile signing ${label} ${new Date().toISOString()}`;
  const known = Object.keys((await read(cdp, wallet, 'pri(signing.evmRequests)', null)) ?? {});
  await evaluate(cdp, site.sessionId, `window.__smokeSign = window.fearlessWallet.request({ method: 'personal_sign', params: [${JSON.stringify(hexlify(toUtf8Bytes(message)))}, ${JSON.stringify(mobile.evm.address)}] })
    .then((signature) => ({ signature }), (error) => ({ error: error?.message ?? String(error) })); true`);
  const accept = `(requests) => !!requests && Object.values(requests).some((r) => r.method === 'personal_sign' && !${JSON.stringify(known)}.includes(String(r.id)))`;
  const requests = await within(call(cdp, wallet, 'pri(signing.evmRequests)', null, accept), RELAY_MS);
  const request = requests && Object.values(requests).find((r) => r.method === 'personal_sign' && !known.includes(String(r.id)));
  if (!request) {
    const siteSaw = await within(evaluate(cdp, site.sessionId, 'window.__smokeSign'), 1_000);
    assert(false, 'The wallet queued no personal_sign for the mobile account', { siteSaw: siteSaw ?? 'no answer' });
  }
  assert(request.account?.isMobile === true, 'The wallet did not queue the request for the mobile account', { account: request.account });
  const forwarded = mobile.requests.length;
  const approved = await call(cdp, wallet, 'pri(signing.approve)', { id: request.id }).catch((error) => ({ error: error.message }));
  const siteSaw = await within(evaluate(cdp, site.sessionId, 'window.__smokeSign'), RELAY_MS);
  const signer = siteSaw?.signature ? verifyMessage(message, siteSaw.signature) : null;
  const result = { walletAnswer: approved, siteSaw: siteSaw ?? 'no answer', signer, mobileGot: mobile.requests.slice(forwarded) };
  assert(signer?.toLowerCase() === mobile.evm.address.toLowerCase(), 'The site did not get the mobile wallet\'s signature', result);
  assert(mobileAccount.ethereumAddress?.toLowerCase() === mobile.evm.address.toLowerCase(), 'The mobile account names another EVM address', result);
  return result;
}

// `--worker-console`: the extension worker's console and uncaught errors, through a DevTools session on the worker.
async function recordWorkerConsole(cdp, extensionId, lines) {
  const worker = await workerTarget(cdp, extensionId);
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
  const text = (arg) => {
    if (arg.value !== undefined) return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
    if (arg.preview) return JSON.stringify(Object.fromEntries((arg.preview.properties ?? []).map(({ name, value }) => [name, value])));
    return arg.description ?? arg.type;
  };
  const relaySockets = new Set();
  cdp.onEvent(({ method, params, sessionId: from }) => {
    if (from !== sessionId) return;
    const at = new Date().toISOString();
    if (method === 'Runtime.consoleAPICalled') lines.push(`${at} ${params.type} ${params.args.map(text).join(' ')}`.slice(0, 4_000));
    if (method === 'Runtime.exceptionThrown') lines.push(`${at} exception ${params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text}`.slice(0, 4_000));
    if (method === 'Log.entryAdded') lines.push(`${at} log ${params.entry.level} ${params.entry.text} ${params.entry.url ?? ''}`.slice(0, 4_000));
    // The relay's JSON-RPC frames: method, id and topic only.
    if (method === 'Network.webSocketCreated' && /walletconnect/.test(params.url)) relaySockets.add(params.requestId);
    if ((method === 'Network.webSocketFrameSent' || method === 'Network.webSocketFrameReceived') && relaySockets.has(params.requestId)) {
      let frame;
      try {
        frame = JSON.parse(params.response.payloadData);
      } catch {
        frame = { raw: params.response.payloadData.slice(0, 80) };
      }
      const topic = frame.params?.topic ?? frame.params?.data?.topic ?? frame.params?.sessionTopic ?? frame.params?.pairingTopic;
      const topics = frame.params?.topics?.length;
      lines.push(`${at} relay ${method.endsWith('Sent') ? 'sent' : 'got'} ${frame.method ?? (frame.result !== undefined ? 'result' : frame.error ? 'error' : '?')} id=${frame.id ?? ''} ${topic ? `topic=${topic.slice(0, 8)}` : ''}${topics ? ` topics=${topics}` : ''}${frame.params?.data?.tag ? ` tag=${frame.params.data.tag}` : ''}${frame.params?.tag ? ` tag=${frame.params.tag}` : ''}${frame.error ? ` ${JSON.stringify(frame.error)}` : ''}`);
    }
  });
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Log.enable', {}, sessionId);
  await cdp.send('Network.enable', {}, sessionId);
}

async function workerTarget(cdp, extensionId) {
  const { targetInfos } = await eventually(async () => {
    const targets = await cdp.send('Target.getTargets');
    return targets.targetInfos.some((info) => info.type === 'service_worker' && info.url.startsWith(`chrome-extension://${extensionId}/`)) && targets;
  }, 'the extension worker');
  return targetInfos.find((info) => info.type === 'service_worker' && info.url.startsWith(`chrome-extension://${extensionId}/`));
}

// How many times the worker built a WalletConnect Core, and how many listeners take its relay messages: the Core's
// pairing controller and each sign-client engine. Every engine handles every message, so a second one answers requests
// on sessions it does not know with errors.
async function probeWorker(cdp, extensionId) {
  const worker = await workerTarget(cdp, extensionId);
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
  try {
    return await evaluate(cdp, sessionId, `(() => {
      const core = globalThis._walletConnectCore_;
      return { coreInits: globalThis._walletConnectCore__count ?? 0, relayListeners: core?.relayer?.events?.listenerCount?.('relayer_message') ?? 0 };
    })()`);
  } finally {
    await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
  }
}

// Loading through CDP works without developer mode, but Chrome disables such an extension on runtime.reload().
// Developer mode in this throwaway profile lets a restart keep the extension and its storage.
async function enableUnpackedReload(cdp) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'chrome://extensions/' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  try {
    await cdp.send('Runtime.enable', {}, sessionId);
    await eventually(() => evaluate(cdp, sessionId, 'Boolean(chrome.developerPrivate)'), 'the extension developer settings');
    const error = await evaluate(cdp, sessionId, `new Promise((resolve) => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, () => resolve(chrome.runtime.lastError?.message ?? null)))`);
    assert(!error, `Could not enable extension reloads in the test profile: ${error}`);
  } finally {
    await cdp.send('Target.closeTarget', { targetId });
  }
}

// A new worker on the same storage, as after Chrome ends an idle worker or restarts: the wallet starts locked, and
// both WalletConnect roles start from what is stored. Extension pages close with the old worker.
async function restartWorker(cdp, extensionId, page) {
  const before = await workerTarget(cdp, extensionId);
  await evaluate(cdp, page.sessionId, 'setTimeout(() => chrome.runtime.reload(), 0); true');
  await eventually(async () => {
    const { targetInfos } = await cdp.send('Target.getTargets');
    return !targetInfos.some((info) => info.targetId === before.targetId);
  }, 'the old worker to end');
  const wallet = await openWalletPage(cdp, extensionId);
  await eventually(() => call(cdp, wallet, 'pri(app.isReady)', null), 'the restarted background to answer');
  assert(await call(cdp, wallet, 'pri(keyring.unlock)', { password: PASSWORD }) === true, 'The wallet did not unlock after the restart');
  return wallet;
}

async function nextProposal(cdp, wallet, uri, known) {
  const paired = await within(call(cdp, wallet, 'pri(walletConnect.connect)', { uri }), RELAY_MS);
  assert(paired === true, `The wallet did not pair: ${JSON.stringify(paired ?? 'no answer')}`);
  const accept = `(requests) => Array.isArray(requests) && requests.some((r) => !${JSON.stringify(known)}.includes(r.id))`;
  const requests = await within(call(cdp, wallet, 'pri(walletConnect.requests.connect.subscribe)', null, accept), RELAY_MS);
  assert(requests, 'The wallet got no session proposal');
  return requests.find((request) => !known.includes(request.id));
}

// A dApp proposes a session and the wallet approves it with its Ethereum account. The wallet signs only in a session
// the dApp has acknowledged; its session list is not published again when that happens, so it is read afresh.
async function pairDapp(cdp, wallet, dapp, account, known) {
  const { uri, approval } = await dapp.client.connect({ requiredNamespaces: NAMESPACES });
  const sessionApproved = approval();
  sessionApproved.catch(() => undefined);
  const proposal = await nextProposal(cdp, wallet, uri, known);
  known.push(proposal.id);
  assert(!Object.hasOwn(dapp.proposals.at(-1), 'expiry'), 'The dApp sent an expiry: this is not the SDK the check is about');
  const approved = await call(cdp, wallet, 'pri(walletConnect.session.approve)', { id: proposal.id, accounts: [account.ethereumAddress] });
  assert(approved?.status === true, `The wallet did not approve the session: ${JSON.stringify(approved)}`);
  const session = await within(sessionApproved, RELAY_MS);
  assert(session, 'The dApp got no session');
  const accounts = session.namespaces.eip155?.accounts ?? [];
  assert(accounts.some((item) => item.toLowerCase() === `eip155:1:${account.ethereumAddress}`.toLowerCase()), 'The session does not name the wallet\'s Ethereum account');
  let listed = [];
  await eventually(async () => {
    listed = await read(cdp, wallet, 'pri(walletConnect.session.subscribe)', null);
    return listed.some((item) => item.topic === session.topic && item.acknowledged === true);
  }, 'the wallet to list the acknowledged session', RELAY_MS, 1_000).catch((error) => {
    throw new Error(`${error.message}; it lists ${JSON.stringify(listed.map(({ topic, acknowledged, expiry }) => ({ topic, acknowledged, expiry })))}`);
  });
  return { session, proposal: { sent: describeProposal(dapp.proposals.at(-1)), wallet: describeProposal(proposal.request.params) }, walletSessions: listed.length };
}

// The session works: a personal_sign, approved in the wallet and signed by its Ethereum key. A dApp takes the first
// answer it gets, so an error from anything else in the worker fails this even when the wallet signs afterwards.
async function signOnWallet(cdp, wallet, dapp, session, account, label) {
  const message = `Fearless WalletConnect smoke ${label} ${new Date().toISOString()}`;
  const messageHex = hexlify(toUtf8Bytes(message));
  const signing = dapp.client.request({
    topic: session.topic,
    chainId: 'eip155:1',
    request: { method: 'personal_sign', params: [messageHex, account.ethereumAddress] },
  });
  const signingAnswer = signing.then((signature) => ({ signature }), (error) => ({ error: describeError(error) }));
  const accept = `(requests) => Array.isArray(requests) && requests.some((r) => r.params?.request?.method === "personal_sign" && r.topic === ${JSON.stringify(session.topic)} && r.params.request.params[0] === ${JSON.stringify(messageHex)})`;
  const signRequests = await within(call(cdp, wallet, 'pri(walletConnect.signing.requests.subscribe)', null, accept), RELAY_MS);
  const signRequest = signRequests?.find((request) => request.params.request.method === 'personal_sign' && request.topic === session.topic && request.params.request.params[0] === messageHex);
  if (!signRequest) assert(false, 'The wallet got no personal_sign request', { dappSaw: (await within(signingAnswer, 1_000)) ?? 'no answer' });
  assert(new Set(signRequests.map(({ topic, id }) => `${topic}:${id}`)).size === signRequests.length, 'The wallet offered a duplicate pending request');
  // The wallet may close its request window once nothing is left to approve: the outcome is read on the dApp.
  const signApproved = await call(cdp, wallet, 'pri(walletConnect.request.approve)', { address: account.ethereumAddress, approvalId: signRequest.approvalId }).catch((error) => ({ error: error.message }));
  const signed = await within(signingAnswer, RELAY_MS);
  const signer = signed?.signature ? verifyMessage(message, signed.signature) : null;
  const result = { walletAnswer: signApproved, dappSaw: signed ?? 'no answer', signer };
  assert(signer?.toLowerCase() === account.ethereumAddress.toLowerCase(), 'The dApp did not get a signature from the wallet\'s Ethereum key', result);
  return result;
}

async function storedSessions(cdp, wallet) {
  const stored = await evaluate(cdp, wallet.sessionId, `chrome.storage.local.get(${JSON.stringify(WALLET_CONNECT_RECORD)}).then((data) => data[${JSON.stringify(WALLET_CONNECT_RECORD)}]?.sessions ?? [])`);
  return stored.map(({ topic, peer }) => ({ topic, peer: peer?.metadata?.name }));
}

// The reference SDK throws from a timer when it gets a second answer to one of its requests ("emitting ... without any
// listeners"). Those are recorded and fail the run; anything else still ends it.
const peerErrors = [];
process.on('uncaughtException', (error) => {
  if (!String(error?.stack).includes('@walletconnect/') && !String(error?.stack).includes('walletconnect-peer')) throw error;
  peerErrors.push({ at: new Date().toISOString(), error: error.message });
  log('a peer\'s WalletConnect SDK threw:', error.message);
});

async function main() {
  assert(chromeBinary, 'Set CHROME_BIN to Chrome for Testing (branded Chrome ignores unpacked extensions loaded this way).');
  await fs.access(path.join(extensionDir, 'manifest.json'));
  await fs.mkdir(outDir, { recursive: true });
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-walletconnect-smoke-'));
  const keyringFields = await loadKeyringFields();
  const stderr = [];
  const chrome = launchChrome(userDataDir);
  chrome.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
  const cdp = new Cdp(chrome);
  const report = {
    build: extensionDir,
    version: JSON.parse(await fs.readFile(path.join(extensionDir, 'manifest.json'), 'utf8')).version,
    chromeBinary,
    startedAt: new Date().toISOString(),
    steps: [],
    worker: [],
  };
  const failures = [];
  // One check: its result goes to the report. A failure stops the run, or with --keep-going is recorded and the
  // checks that do not depend on it still run.
  const step = async (name, run) => {
    try {
      const result = await run();
      report.steps.push({ name, at: new Date().toISOString(), result: 'passed', ...result });
      log(name, JSON.stringify(result));
      return result ?? {};
    } catch (error) {
      report.steps.push({ name, at: new Date().toISOString(), result: 'failed', failure: error.message, ...(error.details ?? {}) });
      log(`${name}: FAILED`, error.message, JSON.stringify(error.details ?? {}));
      failures.push(`${name}: ${error.message}`);
      if (!keepGoing) throw error;
      return undefined;
    }
  };
  const skipped = (name, reason) => {
    report.steps.push({ name, at: new Date().toISOString(), result: 'skipped', reason });
    log(`${name}: skipped (${reason})`);
  };
  const probe = async (when) => {
    const counts = await probeWorker(cdp, extensionId).catch((error) => ({ error: error.message }));
    report.worker.push({ when, ...counts });
    log('worker', when, JSON.stringify(counts));
  };
  const peers = [];
  let site;
  let extensionId;

  try {
    report.chrome = (await cdp.send('Browser.getVersion')).product;
    ({ id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: extensionDir }));
    await enableUnpackedReload(cdp);
    let wallet = await openWalletPage(cdp, extensionId);
    await eventually(() => call(cdp, wallet, 'pri(app.isReady)', null), 'the background to answer');
    // Attached once the worker runs: under load a new worker can take a minute to start.
    if (workerConsole) await recordWorkerConsole(cdp, extensionId, (report.workerConsole = []));
    const account = await createWallet(cdp, wallet, keyringFields);
    // WalletConnect's eip155:1 is the registry's Ethereum.
    await call(cdp, wallet, 'pri(networkMap.getSubscription)', null, '(map) => !!map && Object.values(map).some((n) => n.name === "Ethereum" && Number(n.chainId) === 1)');
    report.steps.push({ name: 'wallet created', at: new Date().toISOString(), result: 'passed', ...account });

    const dappA = await startPeer('Fearless WalletConnect smoke dApp A');
    const dappB = await startPeer('Fearless WalletConnect smoke dApp B');
    const mobile = await startMobileWallet();
    peers.push(dappA, dappB, mobile);
    report.peer = dappA.kind;
    const known = [];

    // 1. A dApp pairs while the wallet's client is the only one running, as on the first connection in a new profile.
    const pairedA = await step('dApp A paired with the wallet', () => pairDapp(cdp, wallet, dappA, account, known));
    if (pairedA) await step('dApp A personal_sign', () => signOnWallet(cdp, wallet, dappA, pairedA.session, account, 'A'));
    await probe('wallet client only');

    // 2. Restart immediately after the peer gets its signature, without waiting for SDK request cleanup. A restored
    // pending request may need renewed approval, but must not block this session or an independent dApp's request.
    // With something stored, a new worker starts both roles.
    wallet = await restartWorker(cdp, extensionId, wallet);
    if (workerConsole) await recordWorkerConsole(cdp, extensionId, report.workerConsole);
    if (pairedA) await step('dApp A personal_sign after a restart', () => signOnWallet(cdp, wallet, dappA, pairedA.session, account, 'A after restart'));

    // 3. A dApp that pairs after that restart.
    const pairedB = await step('dApp B paired after the restart', () => pairDapp(cdp, wallet, dappB, account, known));
    if (pairedB) await step('dApp B personal_sign', () => signOnWallet(cdp, wallet, dappB, pairedB.session, account, 'B'));

    // 4. Fearless pairs with the mobile wallet in the same worker.
    const attempt = `smoke-${Date.now()}`;
    const mobilePaired = await step('Fearless paired with the mobile wallet', async () => {
      const uri = await evaluate(cdp, wallet.sessionId, `__smoke.pairMobile(${JSON.stringify(attempt)})`);
      await mobile.client.pair({ uri });
      const outcome = await eventually(async () => {
        const pairing = await evaluate(cdp, wallet.sessionId, `__smoke.pairings[${JSON.stringify(attempt)}]`);
        return (pairing.results.length || pairing.error || pairing.closed || mobile.errors.length) && pairing;
      }, 'the pairing result', RELAY_MS, 1_000);
      assert(outcome.results.some((result) => result.status === true), 'Fearless did not finish the pairing', { pairing: outcome, mobileErrors: mobile.errors });
      const approval = mobile.approvals.at(-1);
      const acknowledged = await within(approval.acknowledged, RELAY_MS);
      assert(acknowledged === true, 'Fearless did not acknowledge the mobile wallet\'s session', { acknowledged: acknowledged ?? 'no answer' });
      const accounts = await read(cdp, wallet, 'pri(accounts.subscribe)', null);
      const mobileAccount = accounts.find((item) => item.ethereumAddress?.toLowerCase() === mobile.evm.address.toLowerCase());
      assert(mobileAccount?.isMobile === true, 'Fearless saved no mobile account', { accounts: accounts.map(({ address, name, isMobile }) => ({ address, name, isMobile })) });
      return { topic: approval.topic, mobileAccount: { address: mobileAccount.address, name: mobileAccount.name, ethereumAddress: mobileAccount.ethereumAddress } };
    });
    await probe('both roles started');

    // 5. A site asks the mobile account to sign; Fearless forwards it to the mobile wallet.
    if (mobilePaired) {
      site = await startSite();
      const sitePage = await openSitePage(cdp, site.url);
      const authorized = await step('site connected to the mobile account', async () => {
        await evaluate(cdp, sitePage.sessionId, `window.__smokeAccounts = window.fearlessWallet.request({ method: 'eth_requestAccounts' })
          .then((accounts) => ({ accounts }), (error) => ({ error: error?.message ?? String(error) })); true`);
        const requests = await call(cdp, wallet, 'pri(authorize.requests)', null, `(requests) => Array.isArray(requests) && requests.some((r) => r.url.includes(${JSON.stringify(site.host)}))`);
        const request = requests.find((item) => item.url.includes(site.host));
        await call(cdp, wallet, 'pri(authorize.approve)', { id: request.id, authorizedAccounts: [mobilePaired.mobileAccount.address] });
        const siteSaw = await within(evaluate(cdp, sitePage.sessionId, 'window.__smokeAccounts'), RELAY_MS);
        assert(siteSaw?.accounts?.[0]?.toLowerCase() === mobile.evm.address.toLowerCase(), 'The site did not get the mobile account', { siteSaw });
        return { siteSaw };
      });
      if (authorized) await step('mobile wallet signed the site\'s personal_sign', () => signOnMobile(cdp, wallet, sitePage, mobile, mobilePaired.mobileAccount, 'before restart'));
      await step('mobile wallet pinged Fearless', async () => {
        const before = peerErrors.length;
        const answer = await within(mobile.client.ping({ topic: mobilePaired.topic }).then(() => 'answered', (error) => ({ error: describeError(error) })), RELAY_MS);
        // A second answer to the same ping would arrive right after the first.
        await sleep(3_000);
        const extra = peerErrors.slice(before);
        assert(answer === 'answered' && !extra.length, 'Fearless did not answer the mobile wallet\'s ping exactly once', { answer: answer ?? 'no answer', peerErrors: extra });
        return { answer };
      });
    } else skipped('mobile signing', 'the mobile pairing failed');

    // 6. Every live session is stored, whichever role made it.
    await step('stored sessions', async () => {
      const stored = await storedSessions(cdp, wallet);
      const expected = { dappA: pairedA?.session.topic, dappB: pairedB?.session.topic, mobile: mobilePaired?.topic };
      const missing = Object.entries(expected).filter(([, topic]) => topic && !stored.some((item) => item.topic === topic)).map(([name]) => name);
      assert(!missing.length, `Stored sessions lack ${missing.join(', ')}`, { stored, expected });
      return { stored };
    });

    // 7. Another worker: the wallet lists only dApp sessions, the dApp signs, and so does the mobile account.
    wallet = await restartWorker(cdp, extensionId, wallet);
    if (workerConsole) await recordWorkerConsole(cdp, extensionId, report.workerConsole);
    await step('wallet lists its dApp sessions after the restart', async () => {
      const expected = [pairedA?.session.topic, pairedB?.session.topic].filter(Boolean).sort();
      let listed = [];
      await eventually(async () => {
        listed = (await read(cdp, wallet, 'pri(walletConnect.session.subscribe)', null)).map(({ topic, peer }) => ({ topic, peer: peer.metadata.name }));
        return JSON.stringify(listed.map(({ topic }) => topic).sort()) === JSON.stringify(expected);
      }, 'the wallet to list exactly its dApp sessions', 30_000, 1_000).catch((error) => {
        throw Object.assign(new Error(error.message), { details: { listed, expected } });
      });
      return { listed };
    });
    if (pairedB) await step('dApp B personal_sign after another restart', () => signOnWallet(cdp, wallet, dappB, pairedB.session, account, 'B after restart'));
    if (mobilePaired) {
      // The old page's content script belongs to the ended worker: load the site again, as a person would.
      const sitePage = await openSitePage(cdp, site.url);
      await step('mobile wallet signed after the restart', () => signOnMobile(cdp, wallet, sitePage, mobile, mobilePaired.mobileAccount, 'after restart'));
    }
    await probe('after another restart');

    // 8. A proposal that the person rejects reaches the dApp as a rejection.
    await step('rejected proposal reached the dApp', async () => {
      const second = await dappA.client.connect({ requiredNamespaces: NAMESPACES });
      const secondAnswer = second.approval().then(() => ({ approved: true }), (error) => ({ code: error?.code ?? null, message: error?.message ?? String(error) }));
      const secondProposal = await nextProposal(cdp, wallet, second.uri, known);
      known.push(secondProposal.id);
      const rejected = await call(cdp, wallet, 'pri(walletConnect.session.reject)', { id: secondProposal.id });
      const dappSaw = await within(secondAnswer, RELAY_MS);
      assert(dappSaw?.code === dappA.getSdkError('USER_REJECTED').code, 'The dApp was not told the wallet rejected its proposal', { walletAnswer: rejected, dappSaw: dappSaw ?? 'no answer' });
      return { walletAnswer: rejected, dappSaw };
    });

    // 9. Each peer disconnects: the wallet drops the dApp's session, and Fearless forgets the mobile account.
    if (pairedA) {
      await step('wallet dropped the session dApp A disconnected', async () => {
        await dappA.client.disconnect({ topic: pairedA.session.topic, reason: dappA.getSdkError('USER_DISCONNECTED') });
        const remaining = await eventually(async () => {
          const sessions = await read(cdp, wallet, 'pri(walletConnect.session.subscribe)', null);
          return !sessions.some((item) => item.topic === pairedA.session.topic) && sessions;
        }, 'the wallet to drop the session the dApp disconnected', RELAY_MS, 1_000);
        return { sessions: remaining.length };
      });
    }
    if (mobilePaired) {
      await step('Fearless forgot the mobile account the mobile wallet disconnected', async () => {
        await mobile.client.disconnect({ topic: mobilePaired.topic, reason: mobile.getSdkError('USER_DISCONNECTED') });
        await eventually(async () => {
          const accounts = await read(cdp, wallet, 'pri(accounts.subscribe)', null);
          return !accounts.some((item) => item.address === mobilePaired.mobileAccount.address);
        }, 'Fearless to forget the mobile account', RELAY_MS, 1_000);
        return {};
      });
    }
    await step('peers got one answer to each request', async () => {
      assert(!peerErrors.length, 'A peer got a second answer to one of its requests', { peerErrors });
      return {};
    });
    report.result = failures.length ? 'failed' : 'passed';
    if (failures.length) throw new Error(`${failures.length} check(s) failed:\n  ${failures.join('\n  ')}`);
  } catch (error) {
    report.result = 'failed';
    report.failure = error.message;
    throw error;
  } finally {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), sleep(10_000)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
    await Promise.all(peers.map((peer) => peer.close().catch(() => undefined)));
    await site?.close();
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await fs.writeFile(path.join(outDir, 'chrome-stderr.log'), stderr.join('').slice(-200_000));
    await fs.rm(userDataDir, { recursive: true, force: true });
    log('report', path.join(outDir, 'report.json'));
  }
}

main()
  .catch((error) => {
    console.error(`[walletconnect-smoke] FAILED: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  })
  // The WalletConnect clients' timers would keep Node running.
  .finally(() => process.exit());
