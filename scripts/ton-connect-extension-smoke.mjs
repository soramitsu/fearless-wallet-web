/* global Buffer, URL, clearTimeout, console, process, setTimeout */
// Real-browser check of TON Connect in the built test extension (dist/extension/chrome-test).
//
// A page on https://app.tonconnect.test uses the official @tonconnect/sdk browser bundle. SDK 4 lists an injected wallet
// only when the wallets list names its bridge key, so the page serves two lists: an empty one, which must not show the
// extension, and one with the submitted Fearless entry (docs/ton-connect.md), which must show it as installed. It then
// connects through window.Fearless.tonconnect with a ton_proof,
// restore the connection after a reload, get a text signData signature and send a transaction, each approved in the
// real popup. The proof and both signatures are verified here with independent code. The extension's TON provider
// (TI) is answered through DevTools, so the transaction is signed for TON mainnet but never leaves this computer.
// Finally the wallet disconnects the site and the SDK must hear it.
//
// Build: EXTENSION_TYPE=chrome VUE_APP_TEST_ONLY=true VUE_APP_EXTENSION_SMOKE=true OUTPUT_DIR=chrome-test \
//   IS_EXTENSION=true node_modules/.bin/env-cmd -f .env.extension node scripts/build-extension.mjs --mode development
// Run:   node scripts/ton-connect-extension-smoke.mjs   (TON_CONNECT_SMOKE_HEADLESS=false to watch)
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Address, Cell, beginCell, contractAddress, loadMessage, loadMessageRelaxed, loadStateInit } from '@ton/core';
import { signVerify } from '@ton/crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const extensionDir = path.resolve(root, process.env.FEARLESS_SMOKE_EXTENSION_DIR || 'dist/extension/chrome-test');
const outDir = path.resolve(root, process.env.TON_CONNECT_SMOKE_OUT || 'build/reports/ton-connect-smoke');
const chromeBinary =
  process.env.CHROME_BIN ||
  (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const headless = process.env.TON_CONNECT_SMOKE_HEADLESS !== 'false';
const timeoutMs = Number(process.env.TON_CONNECT_SMOKE_TIMEOUT_MS ?? 90_000);
const HOST = 'app.tonconnect.test';
const PORT_EXTENSION = 'fw-fearless-extension';
const PASSWORD = 'fearless-ton-connect-smoke';
const TI = 'https://ti.soramitsu.io';
const RECIPIENT = Address.parse('EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG');
const ICON = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const report = { startedAt: new Date().toISOString(), steps: [] };
const step = (name, detail = {}) => {
  report.steps.push({ name, ...detail });
  console.info(`[ton-connect-smoke] ${name}`);
};

class CdpPipe {
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

  send(method, params = {}, sessionId) {
    const id = ++this.#id;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#callbacks.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      this.#callbacks.set(id, { resolve, reject, timer });
      this.input.write(`${JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params })}\0`);
    });
  }

  #onData(chunk) {
    this.#buffer += chunk.toString();

    let index = this.#buffer.indexOf('\0');

    while (index >= 0) {
      const raw = this.#buffer.slice(0, index);

      this.#buffer = this.#buffer.slice(index + 1);
      index = this.#buffer.indexOf('\0');
      if (!raw.trim()) continue;

      const message = JSON.parse(raw);

      if (message.id) {
        const callback = this.#callbacks.get(message.id);

        if (!callback) continue;
        this.#callbacks.delete(message.id);
        clearTimeout(callback.timer);
        if (message.error) callback.reject(new Error(message.error.message || JSON.stringify(message.error)));
        else callback.resolve(message.result ?? {});
      } else this.#listeners.forEach((listener) => listener(message));
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function eventually(producer, description) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const value = await producer();

      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${description}.${lastError ? ` Last error: ${lastError.message}` : ''}`);
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true, userGesture: true },
    sessionId
  );

  if (result.exceptionDetails) {
    const exception = result.exceptionDetails.exception;

    throw new Error(exception?.description || exception?.value || result.exceptionDetails.text || 'Evaluation failed');
  }

  return result.result?.value;
}

async function attach(cdp, targetId) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });

  await cdp.send('Runtime.enable', {}, sessionId);

  return sessionId;
}

async function openPage(cdp, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url });
  const sessionId = await attach(cdp, targetId);

  await cdp.send('Page.enable', {}, sessionId);
  await eventually(
    () => evaluate(cdp, sessionId, `location.href.startsWith(${JSON.stringify(url)}) && document.readyState === 'complete'`),
    `page ${url}`
  );

  return { targetId, sessionId };
}

async function screenshot(cdp, sessionId, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  const file = path.join(outDir, `${name}.png`);

  await fs.writeFile(file, Buffer.from(data, 'base64'));

  return path.relative(root, file);
}

// ---------------------------------------------------------------------------------------------------------------
// The dApp server

/** The entry submitted to the public wallets list (ton-connect/wallets-list#370), with this page's icon. */
const listingEntry = (origin) => ({
  app_name: 'Fearless',
  name: 'Fearless Wallet',
  image: `${origin}/icon.png`,
  about_url: 'https://fearlesswallet.io',
  universal_url: 'https://fearlesswallet.io/ton-connect/',
  bridge: [
    { type: 'sse', url: 'https://connect.ton.org/bridge' },
    { type: 'js', key: 'Fearless' },
  ],
  platforms: ['ios', 'chrome'],
  features: [{ name: 'SendTransaction', maxMessages: 4, extraCurrencySupported: false }],
});

async function startDappServer(dir) {
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
    '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'),
    '-subj', `/CN=${HOST}`, '-addext', `subjectAltName=DNS:${HOST}`,
  ], { stdio: 'ignore' });

  const sdk = await fs.readFile(path.join(root, 'node_modules/@tonconnect/sdk/dist/tonconnect-sdk.min.js'));
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>TON Connect smoke</title></head><body>
<h1>TON Connect smoke dApp</h1>
<script src="/sdk.js"></script>
<script>
  window.__smoke = { events: [] };
  window.__smoke.create = (list = '/wallets.json') => {
    const connector = new TonConnectSDK.TonConnect({
      manifestUrl: location.origin + '/tonconnect-manifest.json',
      walletsListSource: location.origin + list,
    });
    window.__smoke.connector = connector;
    connector.onStatusChange(
      (wallet) => window.__smoke.events.push({ type: 'status', wallet: wallet ? JSON.parse(JSON.stringify(wallet)) : null }),
      (error) => window.__smoke.events.push({ type: 'error', name: error && error.constructor && error.constructor.name, message: String(error && error.message || error) })
    );
    return true;
  };
</script></body></html>`;
  let origin;
  const server = https.createServer(
    { key: await fs.readFile(path.join(dir, 'key.pem')), cert: await fs.readFile(path.join(dir, 'cert.pem')) },
    (request, response) => {
      const send = (status, type, body) => {
        response.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
        response.end(body);
      };
      const { pathname } = new URL(request.url, origin);

      if (pathname === '/') send(200, 'text/html', page);
      else if (pathname === '/sdk.js') send(200, 'text/javascript', sdk);
      else if (pathname === '/wallets-empty.json') send(200, 'application/json', '[]');
      else if (pathname === '/wallets.json') send(200, 'application/json', JSON.stringify([listingEntry(origin)]));
      else if (pathname === '/icon.png') send(200, 'image/png', ICON);
      else if (pathname === '/tonconnect-manifest.json')
        send(200, 'application/json', JSON.stringify({ url: origin, name: 'TON Connect Smoke', iconUrl: `${origin}/icon.png` }));
      else send(404, 'text/plain', 'not found');
    }
  );

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `https://${HOST}:${server.address().port}`;

  return { server, origin };
}

// ---------------------------------------------------------------------------------------------------------------
// The TON provider, answered inside the browser

function answerTonProvider(cdp, backgroundSession, sent) {
  const json = (value) => Buffer.from(JSON.stringify(value)).toString('base64');

  cdp.onEvent(async ({ method, params, sessionId }) => {
    if (method !== 'Fetch.requestPaused' || sessionId !== backgroundSession) return;

    const url = new URL(params.request.url);
    let body;

    if (url.pathname === '/api/indexer/v1/service-info') {
      body = {
        schemaVersion: 1,
        serviceId: 'ti.soramitsu.io',
        ecosystem: 'ton',
        chainId: 'ton:mainnet',
        network: 'mainnet',
        publicBaseUrl: TI,
        capabilities: ['account-balance', 'account-state', 'account-transactions', 'run-get-method'],
        readOnly: false,
      };
    } else if (/^\/api\/indexer\/v1\/accounts\/[^/]+\/state$/.test(url.pathname)) {
      body = { network: 'mainnet', account_state: 'uninitialized' };
    } else if (url.pathname === '/api/v2/jsonRPC') {
      const request = JSON.parse(params.request.postData ?? '{}');

      if (request.method === 'sendBoc') sent.push(request.params.boc);
      body = { ok: true, result: { '@type': 'ok' } };
    }

    await cdp
      .send(
        'Fetch.fulfillRequest',
        body
          ? { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: json(body) }
          : { requestId: params.requestId, responseCode: 404, body: json({ error: 'not answered in the smoke' }) },
        backgroundSession
      )
      .catch(() => undefined);
  });

  return cdp.send('Fetch.enable', { patterns: [{ urlPattern: `${TI}/*` }] }, backgroundSession);
}

// ---------------------------------------------------------------------------------------------------------------
// Independent verification of what the wallet signed

function verifyProof(account, proof, domain) {
  const address = Address.parseRaw(account.address);
  const wc = Buffer.alloc(4);
  const ts = Buffer.alloc(8);
  const dl = Buffer.alloc(4);

  wc.writeInt32BE(address.workChain);
  ts.writeBigUInt64LE(BigInt(proof.timestamp));
  dl.writeUInt32LE(Buffer.byteLength(proof.domain.value));

  const message = Buffer.concat([Buffer.from('ton-proof-item-v2/'), wc, address.hash, dl, Buffer.from(proof.domain.value), ts, Buffer.from(proof.payload)]);
  const hash = createHash('sha256')
    .update(Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from('ton-connect'), createHash('sha256').update(message).digest()]))
    .digest();
  const init = loadStateInit(Cell.fromBase64(account.walletStateInit).beginParse());

  assert(contractAddress(address.workChain, init).equals(address), 'walletStateInit does not hash to the account address');
  assert(proof.domain.value === domain, `proof domain ${proof.domain.value}, expected ${domain}`);
  assert(signVerify(hash, Buffer.from(proof.signature, 'base64'), Buffer.from(account.publicKey, 'hex')), 'ton_proof signature does not verify');
}

function verifyTextSignature(account, result, text) {
  const address = Address.parseRaw(result.address);
  const wc = Buffer.alloc(4);
  const dl = Buffer.alloc(4);
  const ts = Buffer.alloc(8);
  const pl = Buffer.alloc(4);
  const domain = Buffer.from(result.domain);
  const payload = Buffer.from(text);

  wc.writeInt32BE(address.workChain);
  dl.writeUInt32BE(domain.length);
  ts.writeBigUInt64BE(BigInt(result.timestamp));
  pl.writeUInt32BE(payload.length);

  const hash = createHash('sha256')
    .update(Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from('ton-connect/sign-data/'), wc, address.hash, dl, domain, ts, Buffer.from('txt'), pl, payload]))
    .digest();

  assert(signVerify(hash, Buffer.from(result.signature, 'base64'), Buffer.from(account.publicKey, 'hex')), 'signData signature does not verify');
}

function verifyTransaction(account, boc, validUntil, amount) {
  const external = loadMessage(Cell.fromBase64(boc).beginParse());
  const body = external.body.beginParse();
  const signature = body.loadBuffer(64);

  assert(external.info.type === 'external-in', 'not an external message');
  assert(external.info.dest.equals(Address.parseRaw(account.address)), 'sent to another wallet');
  assert(signVerify(body.asCell().hash(), signature, Buffer.from(account.publicKey, 'hex')), 'wallet signature does not verify');
  body.loadUint(32);
  assert(body.loadUint(32) === validUntil, 'message expiry is not valid_until');
  body.loadUint(32);
  body.loadUint(8);
  assert(body.loadUint(8) === 3, 'send mode is not 3');

  const internal = loadMessageRelaxed(body.loadRef().beginParse());

  assert(internal.info.dest.equals(RECIPIENT) && internal.info.value.coins === amount, 'internal message differs from the request');
  assert(internal.info.bounce === false, 'non-bounceable destination was sent bounceable');

  return { initIncluded: Boolean(external.init), destination: internal.info.dest.toString() };
}

// ---------------------------------------------------------------------------------------------------------------

// The wallet opens its popup window for a request; headless Chrome does not show popup windows, so the review page is
// opened the way the toolbar opens it, and it routes itself to the waiting request.
async function approveInPopup(cdp, extensionId, testId, name, expectText = []) {
  const { targetId } = await cdp.send('Target.createTarget', { url: `chrome-extension://${extensionId}/popup.html` });
  const sessionId = await attach(cdp, targetId);

  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);

  const selector = `[data-testid="${testId}"] button, button[data-testid="${testId}"]`;

  await eventually(
    () => evaluate(cdp, sessionId, `(() => { const b = document.querySelector(${JSON.stringify(selector)}); return !!b && !b.disabled && !b.getAttribute('aria-disabled'); })()`),
    `${testId} enabled`
  );

  const text = await evaluate(cdp, sessionId, 'document.body.innerText');

  expectText.forEach((expected) => assert(text.includes(expected), `${name}: popup does not show "${expected}"`));

  const shot = await screenshot(cdp, sessionId, name);

  await evaluate(cdp, sessionId, `document.querySelector(${JSON.stringify(selector)}).click(), true`);
  await sleep(1500);
  await cdp.send('Target.closeTarget', { targetId }).catch(() => undefined);

  return shot;
}

async function main() {
  await fs.access(path.join(extensionDir, 'smoke-control.html')).catch(() => {
    throw new Error(`Build the test extension first (see the header of ${path.relative(root, fileURLToPath(import.meta.url))}).`);
  });
  await fs.mkdir(outDir, { recursive: true });

  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-ton-connect-smoke-'));
  const { server, origin } = await startDappServer(work);
  const domain = new URL(origin).host;
  const args = [
    '--enable-unsafe-extension-debugging',
    '--remote-debugging-pipe',
    '--ignore-certificate-errors',
    `--host-resolver-rules=MAP ${HOST} 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE raw.githubusercontent.com`,
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--no-default-browser-check',
    '--no-first-run',
    '--password-store=basic',
    `--user-data-dir=${path.join(work, 'profile')}`,
    'about:blank',
  ];

  if (headless) args.unshift('--headless=new');

  const chrome = spawn(chromeBinary, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const cdp = new CdpPipe(chrome);
  const sent = [];
  const diagnostics = {};

  try {
    await cdp.send('Target.setDiscoverTargets', { discover: true });

    const { id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: extensionDir });
    const worker = await eventually(async () => {
      const { targetInfos } = await cdp.send('Target.getTargets');

      return targetInfos.find((info) => info.type === 'service_worker' && info.url.startsWith(`chrome-extension://${extensionId}/`));
    }, 'the extension worker');
    const backgroundSession = await attach(cdp, worker.targetId);

    await answerTonProvider(cdp, backgroundSession, sent);

    const control = await openPage(cdp, `chrome-extension://${extensionId}/smoke-control.html`);
    const send = (message, request = null) =>
      evaluate(
        cdp,
        control.sessionId,
        `new Promise((resolve, reject) => {
          const port = chrome.runtime.connect({ name: ${JSON.stringify(PORT_EXTENSION)} });
          const id = 'ton-smoke-' + Math.random().toString(16).slice(2);
          port.onMessage.addListener((m) => { if (m.id !== id) return; port.disconnect(); m.error ? reject(new Error(m.error)) : resolve(m.response ?? m.subscription); });
          port.postMessage({ id, message: ${JSON.stringify(message)}, origin: 'fearless-ton-connect-smoke', request: ${JSON.stringify(request)} });
        })`
      );

    await eventually(() => send('pri(app.isReady)'), 'extension readiness');
    await send('pri(keyring.reset)').catch(() => undefined);
    assert(await send('pri(keyring.changePassword)', { newPassword: PASSWORD, oldPassword: '' }), 'could not set the password');
    await send('pri(onboarding.setComplete)');

    const mnemonic = await send('pri(keyring.generateMnemonic)', { walletEcosystem: 'ton', wordCount: 24 });
    const address = await send('pri(accounts.create)', {
      suri: mnemonic,
      type: 'ed25519',
      walletEcosystem: 'ton',
      meta: { name: 'TON Connect smoke' },
      requireFreshGeneration: true,
    });

    assert(typeof address === 'string' && Address.isFriendly(address), 'no TON wallet was created');
    await send('pri(accounts.update.current)', { address, walletEcosystem: 'ton' });
    assert(await send('pri(keyring.unlock)', { password: PASSWORD }), 'could not unlock');

    const exposure = await send('pri(security.legacyExposure.status)').catch(() => undefined);

    if (exposure && exposure.state && exposure.state !== 'none') await send('pri(security.legacyExposure.acknowledge)').catch(() => undefined);
    step('fresh TON wallet ready', { address, legacyExposure: exposure?.state });

    // 1. The SDK finds the injected wallet.
    const dapp = await openPage(cdp, `${origin}/`);

    diagnostics.dapp = () => evaluate(cdp, dapp.sessionId, 'JSON.stringify(window.__smoke.events)');
    diagnostics.requests = () => send('pri(tonConnect.requests)');
    diagnostics.targets = async () => (await cdp.send('Target.getTargets')).targetInfos.map((info) => `${info.type} ${info.url}`);

    await eventually(() => evaluate(cdp, dapp.sessionId, `typeof window.Fearless?.tonconnect?.connect === 'function'`), 'window.Fearless.tonconnect');

    const unlisted = await evaluate(cdp, dapp.sessionId, `window.__smoke.create('/wallets-empty.json'), window.__smoke.connector.getWallets()`);

    assert(!unlisted.some((wallet) => wallet.jsBridgeKey === 'Fearless'), 'SDK 4 unexpectedly listed an unlisted injected wallet');

    await evaluate(cdp, dapp.sessionId, 'window.__smoke.create()');

    const wallets = await evaluate(cdp, dapp.sessionId, 'window.__smoke.connector.getWallets()');
    const fearless = wallets.find((wallet) => wallet.jsBridgeKey === 'Fearless');

    assert(fearless && fearless.injected === true, `the SDK did not show the listed extension as installed: ${JSON.stringify(wallets)}`);
    step('SDK hides the unlisted bridge and shows the listed one as installed', { name: fearless.name, appName: fearless.appName, injected: fearless.injected });

    // 2. Connect with a proof, approved in the popup.
    const nonce = `smoke-${Date.now()}`;

    await evaluate(cdp, dapp.sessionId, `window.__smoke.connector.connect({ jsBridgeKey: 'Fearless' }, { request: { tonProof: ${JSON.stringify(nonce)} } }), true`);

    const connectShot = await approveInPopup(cdp, extensionId, 'approveTonConnect', '01-connect-approval', ['TON Connect Smoke', domain.split(':')[0]]);
    const connected = await eventually(
      () => evaluate(cdp, dapp.sessionId, `window.__smoke.events.find((e) => e.type === 'status' && e.wallet) || window.__smoke.events.find((e) => e.type === 'error')`),
      'the connected wallet in the dApp'
    );

    assert(connected.type === 'status', `connect failed: ${JSON.stringify(connected)}`);

    const { account, connectItems, device } = connected.wallet;

    assert(Address.parseRaw(account.address).equals(Address.parse(address)), 'the dApp got another address');
    assert(account.chain === '-239', 'the dApp got another network');
    verifyProof(account, connectItems.tonProof.proof, domain);
    step('connected with a verified ton_proof', { screenshot: connectShot, device, proofDomain: connectItems.tonProof.proof.domain.value });

    // 3. A reload restores the connection without a prompt.
    await cdp.send('Page.reload', {}, dapp.sessionId);
    await eventually(() => evaluate(cdp, dapp.sessionId, `document.readyState === 'complete' && !!window.__smoke`), 'the reloaded dApp');
    await evaluate(cdp, dapp.sessionId, 'window.__smoke.create(), window.__smoke.connector.restoreConnection().then(() => true)');

    const restored = await eventually(
      () => evaluate(cdp, dapp.sessionId, 'window.__smoke.connector.connected && window.__smoke.connector.account'),
      'the restored connection'
    );

    assert(restored.address === account.address, 'restore returned another account');
    step('restored after reload without a prompt');

    // 4. signData (text), approved in the popup.
    const text = `Log in to ${HOST} at ${new Date().toISOString()}`;

    await evaluate(cdp, dapp.sessionId, `window.__smoke.signData = window.__smoke.connector.signData({ type: 'text', text: ${JSON.stringify(text)} }).then((r) => (window.__smoke.signed = r), (e) => (window.__smoke.signed = { error: String(e && e.message || e) })), true`);

    const signShot = await approveInPopup(cdp, extensionId, 'approveSigning', '02-sign-data', [text]);
    const signed = await eventually(() => evaluate(cdp, dapp.sessionId, 'window.__smoke.signed'), 'the signData result');

    assert(!signed.error, `signData failed: ${signed.error}`);
    assert(signed.domain === domain, `signData domain ${signed.domain}`);
    verifyTextSignature(account, signed, text);
    step('signData text signature verified', { screenshot: signShot, domain: signed.domain });

    // 5. sendTransaction, approved in the popup; the provider records the message instead of broadcasting it.
    const validUntil = Math.floor(Date.now() / 1000) + 300;
    const amount = 1_000_000n;
    const comment = beginCell().storeUint(0, 32).storeStringTail('TON Connect smoke').endCell().toBoc().toString('base64');
    const transaction = {
      validUntil,
      network: '-239',
      messages: [{ address: RECIPIENT.toString({ bounceable: false }), amount: amount.toString(), payload: comment }],
    };

    await evaluate(cdp, dapp.sessionId, `window.__smoke.connector.sendTransaction(${JSON.stringify(transaction)}).then((r) => (window.__smoke.sent = r), (e) => (window.__smoke.sent = { error: String(e && e.message || e) })), true`);

    const sendShot = await approveInPopup(cdp, extensionId, 'approveSigning', '03-send-transaction', ['TON Connect smoke', '0.001 TON']);
    const result = await eventually(() => evaluate(cdp, dapp.sessionId, 'window.__smoke.sent'), 'the sendTransaction result');

    assert(!result.error, `sendTransaction failed: ${result.error}`);
    assert(sent.length === 1 && Cell.fromBase64(sent[0]).hash().equals(Cell.fromBase64(result.boc).hash()), 'the dApp got another message than the one sent');
    step('transaction signed and handed to the provider', { screenshot: sendShot, ...verifyTransaction(account, result.boc, validUntil, amount) });

    // 6. The wallet disconnects the site; the dApp hears it.
    const sessions = await send('pri(tonConnect.disconnect)', { origin });

    assert(Array.isArray(sessions) && sessions.length === 0, 'the session was not removed');
    await eventually(
      () => evaluate(cdp, dapp.sessionId, `window.__smoke.connector.connected === false && window.__smoke.events.some((e) => e.type === 'status' && e.wallet === null)`),
      'the disconnect in the dApp'
    );
    step('wallet-side disconnect reached the dApp');

    report.result = 'pass';
  } catch (error) {
    report.result = 'fail';
    report.error = error.stack || String(error);
    for (const [name, read] of Object.entries(diagnostics)) {
      report[`diagnostic_${name}`] = await Promise.race([read().catch((e) => `unavailable: ${e.message}`), sleep(5000).then(() => 'timeout')]);
    }
    console.error(JSON.stringify(Object.fromEntries(Object.entries(report).filter(([key]) => key.startsWith('diagnostic_'))), null, 2));
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    chrome.kill('SIGTERM');
    server.close();
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().then(
  () => {
    console.info(`[ton-connect-smoke] pass; report in ${path.relative(root, outDir)}/report.json`);
    process.exit(0);
  },
  (error) => {
    console.error(`[ton-connect-smoke] FAIL: ${error.stack || error}`);
    process.exit(1);
  }
);
