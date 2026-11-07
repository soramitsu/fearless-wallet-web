/* global Buffer, clearTimeout, console, process, setTimeout, structuredClone */
// Real-Chrome check that the wallet pairs with a dApp on the WalletConnect SDK this repository installs (2.23, what
// dApps ship today). That SDK sends a proposal's deadline only as expiryTimestamp, never expiry, and moves
// requiredNamespaces into optionalNamespaces. The dApp proposes a session, the wallet approves it and signs a
// personal_sign through it, then the wallet rejects a second proposal, which must reach the dApp as a rejection.
// The wallet refuses a proposal for a chain it does not support, which the dApp must hear at once. Last, the popup's
// approval screen must warn before it approves a proposal that also asks for a method the wallet does not support.
//
//   CHROME_BIN=<Chrome for Testing 147> node scripts/walletconnect-pairing-smoke.mjs [--extension dist/extension/chrome] \
//     [--out build/reports/walletconnect-pairing-smoke/<time>] [--worker-console]
//
// It needs the network: the wallet reads the registry, and both sides use the public relay (wss://relay.walletconnect.com).
// The dApp runs here in Node with its records in memory; the wallet is the extension's own WalletConnect client.
// `--worker-console` adds the worker's console and its relay frames (method, id and topic) to the report.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HDNodeWallet, hexlify, toUtf8Bytes, verifyMessage } from 'ethers';

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
const PORT_EXTENSION = 'fw-fearless-extension';
const PASSWORD = 'fearless-walletconnect-smoke-password';
const RELAY_MS = 90_000;
const NAMESPACES = { eip155: { chains: ['eip155:1'], methods: ['personal_sign', 'eth_sendTransaction'], events: ['accountsChanged', 'chainChanged'] } };
// No registry network has this chain ID; the check confirms it.
const UNSUPPORTED_CHAIN_ID = 4_242_424_242;
const UNSUPPORTED_CHAIN_NAMESPACES = { eip155: { ...NAMESPACES.eip155, chains: [`eip155:${UNSUPPORTED_CHAIN_ID}`] } };
// The wallet does not support wallet_switchEthereumChain.
const UNSUPPORTED_METHOD = 'wallet_switchEthereumChain';
const UNSUPPORTED_METHOD_NAMESPACES = { eip155: { ...NAMESPACES.eip155, methods: [...NAMESPACES.eip155.methods, UNSUPPORTED_METHOD] } };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const started = Date.now();
const log = (...args) => console.info(`[walletconnect-smoke ${((Date.now() - started) / 1000).toFixed(1)}s]`, ...args);
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
// answer: a subscription first replays what it last published, which can be older.
const MESSAGING = `
  globalThis.__smoke ??= (() => {
    const call = (message, request, accept, answerOnly) => new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: ${JSON.stringify(PORT_EXTENSION)} });
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
    return { call, read };
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

// Resolves once fade-ins have ended (the backdrop's animations never end), or after 5 s.
const settled = (cdp, page) => evaluate(cdp, page.sessionId, `Promise.race([
  Promise.all(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined))),
  new Promise((resolve) => setTimeout(resolve, 5_000)),
]).then(() => true)`);

// Clicks the middle of the element `expression` finds with the mouse, as a person would. A covered element fails.
async function click(cdp, page, expression, description) {
  await settled(cdp, page);
  const point = await evaluate(cdp, page.sessionId, `(() => {
    const element = ${expression};
    if (!element) return null;
    const { x, y, width, height } = element.getBoundingClientRect();
    const top = document.elementFromPoint(x + width / 2, y + height / 2);
    return { x: x + width / 2, y: y + height / 2, onTop: !!top && element.contains(top) };
  })()`);
  assert(point, `There is no ${description}`);
  assert(point.onTop, `Something covers the ${description}`);
  for (const type of ['mousePressed', 'mouseReleased'])
    await cdp.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 }, page.sessionId);
}

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

// The dApp side, on the installed SDK as it ships. It only records the proposals it sends.
async function startWalletConnectDapp() {
  const walletConnect = await import('@walletconnect/sign-client');
  const SignClient = walletConnect.SignClient ?? walletConnect.default?.SignClient ?? walletConnect.default;
  const { getSdkError } = await import('@walletconnect/utils');
  const version = JSON.parse(await fs.readFile(path.join(root, 'node_modules/@walletconnect/sign-client/package.json'), 'utf8')).version;
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
    metadata: { name: 'Fearless WalletConnect smoke', description: 'WalletConnect pairing smoke dApp', url: 'https://fearlesswallet.io/', icons: [] },
    storage,
  });
  const proposals = [];
  const encode = client.core.crypto.encode.bind(client.core.crypto);
  client.core.crypto.encode = (topic, payload, options) => {
    if (payload?.method === 'wc_sessionPropose') proposals.push(structuredClone(payload.params));
    return encode(topic, payload, options);
  };
  return { client, version, proposals, getSdkError, close: async () => client.core.relayer.transportClose() };
}

const describeProposal = (params) => ({
  hasExpiry: Object.hasOwn(params, 'expiry'),
  expiryTimestamp: params.expiryTimestamp ?? null,
  secondsLeft: typeof params.expiryTimestamp === 'number' ? params.expiryTimestamp - Math.floor(Date.now() / 1000) : null,
  requiredNamespaces: params.requiredNamespaces,
  optionalNamespaces: params.optionalNamespaces,
});

// `--worker-console`: the extension worker's console and uncaught errors, through a DevTools session on the worker.
async function recordWorkerConsole(cdp, extensionId, lines) {
  const { targetInfos } = await eventually(async () => {
    const targets = await cdp.send('Target.getTargets');
    return targets.targetInfos.some((info) => info.type === 'service_worker' && info.url.startsWith(`chrome-extension://${extensionId}/`)) && targets;
  }, 'the extension worker');
  const worker = targetInfos.find((info) => info.type === 'service_worker' && info.url.startsWith(`chrome-extension://${extensionId}/`));
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

async function nextProposal(cdp, wallet, uri, known) {
  const paired = await within(call(cdp, wallet, 'pri(walletConnect.connect)', { uri }), RELAY_MS);
  assert(paired === true, `The wallet did not pair: ${JSON.stringify(paired ?? 'no answer')}`);
  const accept = `(requests) => Array.isArray(requests) && requests.some((r) => !${JSON.stringify(known)}.includes(r.id))`;
  const requests = await within(call(cdp, wallet, 'pri(walletConnect.requests.connect.subscribe)', null, accept), RELAY_MS);
  assert(requests, 'The wallet got no session proposal');
  return requests.find((request) => !known.includes(request.id));
}

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
  };
  const step = (name, result) => {
    report.steps.push({ name, at: new Date().toISOString(), ...result });
    log(name, JSON.stringify(result));
  };
  let dapp;

  try {
    report.chrome = (await cdp.send('Browser.getVersion')).product;
    const { id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: extensionDir });
    if (workerConsole) await recordWorkerConsole(cdp, extensionId, (report.workerConsole = []));
    const wallet = await openWalletPage(cdp, extensionId);
    await eventually(() => call(cdp, wallet, 'pri(app.isReady)', null), 'the background to answer');
    const account = await createWallet(cdp, wallet, keyringFields);
    // WalletConnect's eip155:1 is the registry's Ethereum.
    const networkMap = await call(cdp, wallet, 'pri(networkMap.getSubscription)', null, '(map) => !!map && Object.values(map).some((n) => n.name === "Ethereum" && Number(n.chainId) === 1)');
    assert(!Object.values(networkMap).some((network) => Number(network.chainId) === UNSUPPORTED_CHAIN_ID), `The registry has a network for eip155:${UNSUPPORTED_CHAIN_ID}`);
    step('wallet created', account);

    dapp = await startWalletConnectDapp();
    step('dApp started', { sdk: dapp.version });

    // 1. The dApp proposes a session and the wallet approves it.
    const { uri, approval } = await dapp.client.connect({ requiredNamespaces: NAMESPACES });
    const sessionApproved = approval();
    sessionApproved.catch(() => undefined);
    const proposal = await nextProposal(cdp, wallet, uri, []);
    step('proposal received', { sent: describeProposal(dapp.proposals.at(-1)), wallet: describeProposal(proposal.request.params) });
    assert(!Object.hasOwn(dapp.proposals.at(-1), 'expiry'), 'The dApp sent an expiry: this is not the SDK the check is about');
    const approved = await call(cdp, wallet, 'pri(walletConnect.session.approve)', { id: proposal.id, accounts: [account.ethereumAddress] });
    step('wallet answered the approval', { response: approved });
    assert(approved?.status === true, `The wallet did not approve the session: ${JSON.stringify(approved)}`);
    const session = await within(sessionApproved, RELAY_MS);
    assert(session, 'The dApp got no session');
    const accounts = session.namespaces.eip155?.accounts ?? [];
    step('dApp got the session', { topic: session.topic, accounts, methods: session.namespaces.eip155?.methods });
    assert(accounts.some((item) => item.toLowerCase() === `eip155:1:${account.ethereumAddress}`.toLowerCase()), 'The session does not name the wallet\'s Ethereum account');
    // The wallet signs only in a session the dApp has acknowledged. Its session list is not published again when that
    // happens, so read it afresh.
    let listed = [];
    const walletSessions = await eventually(async () => {
      listed = await read(cdp, wallet, 'pri(walletConnect.session.subscribe)', null);
      return listed.some((item) => item.topic === session.topic && item.acknowledged === true) && listed;
    }, 'the wallet to list the acknowledged session', RELAY_MS, 1_000).catch((error) => {
      throw new Error(`${error.message}; it lists ${JSON.stringify(listed.map(({ topic, acknowledged, expiry }) => ({ topic, acknowledged, expiry })))}`);
    });
    step('wallet lists the acknowledged session', { sessions: walletSessions.length });

    // 2. The session works: a personal_sign, approved in the wallet, signed by its Ethereum key.
    const message = `Fearless WalletConnect smoke ${report.startedAt}`;
    const signing = dapp.client.request({
      topic: session.topic,
      chainId: 'eip155:1',
      request: { method: 'personal_sign', params: [hexlify(toUtf8Bytes(message)), account.ethereumAddress] },
    });
    const signingAnswer = signing.then((signature) => ({ signature }), (error) => ({ error: error?.message ?? String(error) }));
    const signRequests = await within(call(cdp, wallet, 'pri(walletConnect.signing.requests.subscribe)', null, '(requests) => Array.isArray(requests) && requests.some((r) => r.params?.request?.method === "personal_sign")'), RELAY_MS);
    if (!signRequests) throw new Error(`The wallet got no personal_sign request; the dApp has ${JSON.stringify((await within(signingAnswer, 1_000)) ?? 'no answer')}`);
    const signRequest = signRequests.find((request) => request.params.request.method === 'personal_sign');
    // The wallet may close its request window once nothing is left to approve: the outcome is read on the dApp.
    const signApproved = await call(cdp, wallet, 'pri(walletConnect.request.approve)', { address: account.ethereumAddress, approvalId: signRequest.approvalId }).catch((error) => ({ error: error.message }));
    const signed = await within(signingAnswer, RELAY_MS);
    const signer = signed?.signature ? verifyMessage(message, signed.signature) : null;
    step('personal_sign through the session', { walletAnswer: signApproved, dappSaw: signed ?? 'no answer', signer });
    assert(signer?.toLowerCase() === account.ethereumAddress.toLowerCase(), 'The dApp did not get a signature from the wallet\'s Ethereum key');

    // 3. A second proposal that the person rejects reaches the dApp as a rejection.
    const second = await dapp.client.connect({ requiredNamespaces: NAMESPACES });
    const secondAnswer = second.approval().then(() => ({ approved: true }), (error) => ({ code: error?.code ?? null, message: error?.message ?? String(error) }));
    const secondProposal = await nextProposal(cdp, wallet, second.uri, [proposal.id]);
    const rejected = await call(cdp, wallet, 'pri(walletConnect.session.reject)', { id: secondProposal.id });
    const dappSaw = await within(secondAnswer, RELAY_MS);
    step('rejected proposal reached the dApp', { walletAnswer: rejected, dappSaw: dappSaw ?? 'no answer' });
    assert(dappSaw?.code === dapp.getSdkError('USER_REJECTED').code, 'The dApp was not told the wallet rejected its proposal');

    // 4. A proposal for only a chain the wallet does not support is refused, and the dApp hears why without waiting for
    //    the proposal to expire.
    const unsupported = await dapp.client.connect({ requiredNamespaces: UNSUPPORTED_CHAIN_NAMESPACES });
    const unsupportedAnswer = unsupported.approval().then(() => ({ approved: true }), (error) => ({ code: error?.code ?? null, message: error?.message ?? String(error) }));
    const unsupportedProposal = await nextProposal(cdp, wallet, unsupported.uri, [proposal.id, secondProposal.id]);
    const refusedAt = Date.now();
    const refused = await call(cdp, wallet, 'pri(walletConnect.session.approve)', { id: unsupportedProposal.id, accounts: [account.ethereumAddress] });
    const refusal = await within(unsupportedAnswer, RELAY_MS);
    step('unsupported chain refused and the dApp told', {
      wallet: describeProposal(unsupportedProposal.request.params),
      walletAnswer: refused,
      dappSaw: refusal ?? 'no answer',
      secondsToAnswer: refusal ? (Date.now() - refusedAt) / 1000 : null,
    });
    assert(refused?.status === false && refused.title === 'walletConnect.notifications.unsupportedProposal.title', `The wallet did not refuse the proposal as unsupported: ${JSON.stringify(refused)}`);
    assert(refusal?.code === dapp.getSdkError('UNSUPPORTED_CHAINS').code, 'The dApp was not told the wallet refused its proposal for an unsupported chain');

    // 5. The dApp disconnects, and the wallet drops the session.
    await dapp.client.disconnect({ topic: session.topic, reason: dapp.getSdkError('USER_DISCONNECTED') });
    const remaining = await eventually(async () => {
      const sessions = await read(cdp, wallet, 'pri(walletConnect.session.subscribe)', null);
      return !sessions.some((item) => item.topic === session.topic) && sessions;
    }, 'the wallet to drop the session the dApp disconnected', RELAY_MS, 1_000);
    step('wallet dropped the disconnected session', { sessions: remaining.length });

    // 6. A proposal that also asks for a method the wallet does not support, which the dApp's SDK sends as optional.
    //    The approval screen warns before approving. The session approved through the warning lists the method, and
    //    the wallet answers a request for it with an error.
    const extra = await dapp.client.connect({ requiredNamespaces: UNSUPPORTED_METHOD_NAMESPACES });
    const extraApproved = extra.approval();
    extraApproved.catch(() => undefined);
    await nextProposal(cdp, wallet, extra.uri, [proposal.id, secondProposal.id, unsupportedProposal.id]);
    const popup = await openWalletPage(cdp, extensionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 561, height: 600, deviceScaleFactor: 1, mobile: false }, popup.sessionId);
    const approveButton = `[...document.querySelectorAll('.controls button')].find((button) => button.innerText.trim() === 'Approve' && !button.disabled)`;
    await eventually(() => evaluate(cdp, popup.sessionId, `!!(${approveButton})`), 'the approval screen');
    await click(cdp, popup, approveButton, 'Approve button');
    const warning = await eventually(() => evaluate(cdp, popup.sessionId, `(() => {
      const text = document.querySelector('[data-testid="notificationText"]')?.innerText;
      return text && { text, subtext: document.querySelector('[data-testid="notificationSubtext"]')?.innerText ?? null };
    })()`), 'the unsupported-method warning', 20_000);
    await settled(cdp, popup);
    const { data: capture } = await cdp.send('Page.captureScreenshot', { format: 'png' }, popup.sessionId);
    await fs.writeFile(path.join(outDir, 'unsupported-method-warning.png'), Buffer.from(capture, 'base64'));
    step('approval screen warned about the unsupported method', { sent: describeProposal(dapp.proposals.at(-1)), warning, screenshot: 'unsupported-method-warning.png' });
    await click(cdp, popup, `document.querySelector('[data-testid="acceptBtn"] button')`, 'warning\'s Approve button');
    const extraSession = await within(extraApproved, RELAY_MS);
    assert(extraSession, 'The dApp got no session after the warning was accepted');
    const extraMethods = extraSession.namespaces.eip155?.methods ?? [];
    const extraCall = await within(dapp.client.request({
      topic: extraSession.topic,
      chainId: 'eip155:1',
      request: { method: UNSUPPORTED_METHOD, params: [{ chainId: '0x1' }] },
    }).then((result) => ({ result }), (error) => ({ error: error?.message ?? String(error) })), RELAY_MS);
    step('session approved through the warning', { methods: extraMethods, unsupportedMethodAnswer: extraCall ?? 'no answer' });
    assert(extraMethods.includes(UNSUPPORTED_METHOD), `The session does not list ${UNSUPPORTED_METHOD}`);
    assert(extraCall?.error, `The wallet did not answer ${UNSUPPORTED_METHOD} with an error`);
    report.result = 'passed';
  } catch (error) {
    report.result = 'failed';
    report.failure = error.message;
    throw error;
  } finally {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), sleep(10_000)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
    await dapp?.close().catch(() => undefined);
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
  // The WalletConnect client's timers would keep Node running.
  .finally(() => process.exit());
