/* global Buffer, WebSocket, URL, clearTimeout, console, process, setTimeout */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const extensionDir = path.resolve(root, 'dist/extension/chrome-test');
const manifestPath = path.join(extensionDir, 'manifest.json');
const chromeBinary =
  process.env.CHROME_BIN ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome');
const headless = process.env.SOLANA_EXTENSION_SMOKE_HEADLESS !== 'false';
const timeoutMs = Number(process.env.SOLANA_EXTENSION_SMOKE_TIMEOUT_MS ?? 45_000);
const cdpCommandTimeoutMs = Number(process.env.SOLANA_EXTENSION_SMOKE_CDP_TIMEOUT_MS ?? timeoutMs);
const usePipeTransport = process.env.SOLANA_EXTENSION_SMOKE_TRANSPORT !== 'websocket';

assert(
  Number.isFinite(timeoutMs) && timeoutMs >= 1_000,
  'SOLANA_EXTENSION_SMOKE_TIMEOUT_MS must be a positive millisecond value of at least 1000'
);
assert(
  Number.isFinite(cdpCommandTimeoutMs) && cdpCommandTimeoutMs >= 1_000,
  'SOLANA_EXTENSION_SMOKE_CDP_TIMEOUT_MS must be a positive millisecond value of at least 1000'
);

const PORT_EXTENSION = 'fw-fearless-extension';
const TEST_PASSWORD = 'fearless-solana-smoke-password';
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const SOLANA_ADDRESS = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

class CdpConnection {
  #callbacks = new Map();
  #id = 0;
  #listeners = new Set();

  constructor(url) {
    this.socket = new WebSocket(url);
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;

    await new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (event) => {
        cleanup();
        reject(new Error(`Unable to open Chrome DevTools websocket: ${event.message || 'unknown error'}`));
      };
      const cleanup = () => {
        this.socket.removeEventListener('open', onOpen);
        this.socket.removeEventListener('error', onError);
      };

      this.socket.addEventListener('open', onOpen);
      this.socket.addEventListener('error', onError);
    });

    this.socket.addEventListener('message', ({ data }) => this.#onMessage(data));
  }

  close() {
    this.socket.close();
  }

  onEvent(listener) {
    this.#listeners.add(listener);

    return () => this.#listeners.delete(listener);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.#id;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#callbacks.delete(id);
        reject(new Error(`Timed out waiting for CDP response to ${method}`));
      }, cdpCommandTimeoutMs);

      this.#callbacks.set(id, { reject, resolve, timeout });
      this.socket.send(JSON.stringify(payload));
    });
  }

  #onMessage(data) {
    const message = JSON.parse(data);

    if (message.id) {
      const callback = this.#callbacks.get(message.id);

      if (!callback) return;

      this.#callbacks.delete(message.id);
      clearTimeout(callback.timeout);

      if (message.error) callback.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else callback.resolve(message.result ?? {});

      return;
    }

    for (const listener of this.#listeners) listener(message);
  }
}

class CdpPipeConnection {
  #buffer = '';
  #callbacks = new Map();
  #id = 0;
  #listeners = new Set();

  constructor(chrome) {
    this.chrome = chrome;
    this.input = chrome.stdio[3];
    this.output = chrome.stdio[4];
  }

  async open() {
    assert(this.input && this.output, 'Chrome DevTools pipe file descriptors are not available');

    this.output.on('data', (chunk) => this.#onData(chunk));

    if (this.chrome.exitCode !== null) {
      throw new Error(`Chrome exited before the DevTools pipe was ready (code=${this.chrome.exitCode})`);
    }
  }

  close() {
    this.input?.end();
  }

  onEvent(listener) {
    this.#listeners.add(listener);

    return () => this.#listeners.delete(listener);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.#id;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#callbacks.delete(id);
        reject(new Error(`Timed out waiting for CDP response to ${method}`));
      }, cdpCommandTimeoutMs);

      this.#callbacks.set(id, { reject, resolve, timeout });
      this.input.write(`${JSON.stringify(payload)}\0`);
    });
  }

  #onData(chunk) {
    this.#buffer += chunk.toString();

    let delimiterIndex = this.#buffer.indexOf('\0');

    while (delimiterIndex >= 0) {
      const raw = this.#buffer.slice(0, delimiterIndex);

      this.#buffer = this.#buffer.slice(delimiterIndex + 1);
      delimiterIndex = this.#buffer.indexOf('\0');

      if (raw.trim()) this.#onMessage(raw);
    }
  }

  #onMessage(data) {
    const message = JSON.parse(data);

    if (message.id) {
      const callback = this.#callbacks.get(message.id);

      if (!callback) return;

      this.#callbacks.delete(message.id);
      clearTimeout(callback.timeout);

      if (message.error) callback.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else callback.resolve(message.result ?? {});

      return;
    }

    for (const listener of this.#listeners) listener(message);
  }
}

async function main() {
  await assertFile(manifestPath, 'Build the test extension first with `npm run build:extension-test`.');
  await assertFile(chromeBinary, `Set CHROME_BIN to a Chrome/Chromium executable if Chrome is not at ${chromeBinary}.`);

  const universalWalletFixture = await loadUniversalWalletFixture();
  const transactionBase64 = validTransactionBase64();
  const server = await startDappServer();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-solana-extension-smoke-'));
  const chrome = launchChrome(userDataDir);
  let cdp;

  try {
    let extensionId;

    if (usePipeTransport) {
      cdp = new CdpPipeConnection(chrome);
      await cdp.open();
      await cdp.send('Target.setDiscoverTargets', { discover: true });

      const loaded = await cdp.send('Extensions.loadUnpacked', { path: extensionDir });

      extensionId = loaded.id;
      assert(extensionId, 'Chrome did not return an extension id from Extensions.loadUnpacked');
    } else {
      const browserWs = await waitForDevToolsEndpoint(chrome);

      cdp = new CdpConnection(browserWs);
      await cdp.open();
      await cdp.send('Target.setDiscoverTargets', { discover: true });

      const extensionTarget = await waitForTarget(
        cdp,
        (target) => target.url.startsWith('chrome-extension://') && target.url.endsWith('/background.js'),
        'extension service worker',
        chrome
      );

      extensionId = new URL(extensionTarget.url).hostname;
    }

    const extensionSession = await openExtensionControlPage(cdp, extensionId);

    await setupExtensionMessaging(cdp, extensionSession);
    await eventually(() => extensionSend(cdp, extensionSession, 'pri(app.port.ping)', null), 'background ping');
    await eventually(() => extensionSend(cdp, extensionSession, 'pri(app.isReady)', null), 'extension app readiness');

    const substrateAddress = await seedWallet(cdp, extensionSession, universalWalletFixture);
    await assertSeededUniversalWalletMetadata(cdp, extensionSession, universalWalletFixture);
    const dappSession = await openDappPage(cdp, server.url);

    await waitForExpression(
      cdp,
      dappSession,
      'Boolean(window.fearlessSolana && window.solana && window.fearlessSolana === window.solana && window.fearlessSolana.isFearlessWallet)',
      'Solana provider injection'
    );

    const malformedMessage = await evaluate(
      cdp,
      dappSession,
      `window.fearlessSolana.request({ method: 'signTransaction', params: { transaction: 'not-serialized' } })
        .then(() => 'unexpected-success', (error) => error.message)`
    );

    assert(
      typeof malformedMessage === 'string' && malformedMessage.includes('serialized transaction'),
      `Expected malformed dApp payload rejection, got ${JSON.stringify(malformedMessage)}`
    );

    await startConnect(cdp, dappSession);
    const authRequest = await waitForAuthRequest(cdp, extensionSession, server.host);

    assert(authRequest.accountAuthType === 'solana', `Expected Solana auth request, got ${authRequest.accountAuthType}`);
    await extensionSend(cdp, extensionSession, 'pri(authorize.approve)', {
      authorizedAccounts: [SOLANA_ADDRESS],
      id: authRequest.id,
    });

    const connectResult = await evaluate(cdp, dappSession, 'window.__fearlessSolanaSmoke.connect', {
      awaitPromise: true,
    });

    assert(connectResult.connected === true, 'Provider did not report a connected state');
    assert(connectResult.publicKey === SOLANA_ADDRESS, `Unexpected connected public key ${connectResult.publicKey}`);
    assert(connectResult.accounts?.[0]?.address === SOLANA_ADDRESS, 'Connected account did not use the Solana address');

    const signMessage = await runSignFlow(cdp, extensionSession, dappSession, {
      method: 'signMessage',
      startExpression: `
        window.__fearlessSolanaSmoke.signMessage = window.fearlessSolana
          .signMessage(new TextEncoder().encode('Fearless Solana challenge'), 'utf8')
          .then(({ publicKey, signature }) => ({
            publicKey: publicKey.toBase58(),
            signatureLength: signature.length,
            signatureNonZero: Array.from(signature).some(Boolean)
          }));
        true;
      `,
      resultExpression: 'window.__fearlessSolanaSmoke.signMessage',
    });

    assert(signMessage.publicKey === SOLANA_ADDRESS, `Unexpected signing public key ${signMessage.publicKey}`);
    assert(signMessage.signatureLength === 64, `Unexpected Solana signature length ${signMessage.signatureLength}`);
    assert(signMessage.signatureNonZero === true, 'Solana message signature was all zeros');

    const signTransaction = await runSignFlow(cdp, extensionSession, dappSession, {
      method: 'signTransaction',
      startExpression: `
        {
          const raw = base64ToBytes(${JSON.stringify(transactionBase64)});
          window.__fearlessSolanaSmoke.signTransaction = window.fearlessSolana
            .signTransaction(raw)
            .then((signed) => ({
              changed: bytesToBase64(signed) !== ${JSON.stringify(transactionBase64)},
              length: signed.length,
              signatureNonZero: Array.from(signed.slice(1, 65)).some(Boolean)
            }));
        }
        true;
      `,
      resultExpression: 'window.__fearlessSolanaSmoke.signTransaction',
    });

    assert(signTransaction.length === base64ByteLength(transactionBase64), 'Signed transaction length changed');
    assert(signTransaction.changed === true, 'Signed transaction bytes did not change');
    assert(signTransaction.signatureNonZero === true, 'Signed transaction signature slot was all zeros');

    const signAllTransactions = await runSignFlow(cdp, extensionSession, dappSession, {
      method: 'signAllTransactions',
      startExpression: `
        {
          const raw = base64ToBytes(${JSON.stringify(transactionBase64)});
          window.__fearlessSolanaSmoke.signAllTransactions = window.fearlessSolana
            .signAllTransactions([raw, raw])
            .then((signedTransactions) => ({
              count: signedTransactions.length,
              allChanged: signedTransactions.every((signed) => bytesToBase64(signed) !== ${JSON.stringify(
                transactionBase64
              )}),
              allSignatureNonZero: signedTransactions.every((signed) => Array.from(signed.slice(1, 65)).some(Boolean))
            }));
        }
        true;
      `,
      resultExpression: 'window.__fearlessSolanaSmoke.signAllTransactions',
    });

    assert(signAllTransactions.count === 2, `Expected two signed transactions, got ${signAllTransactions.count}`);
    assert(signAllTransactions.allChanged === true, 'At least one batch transaction was not signed');
    assert(signAllTransactions.allSignatureNonZero === true, 'At least one batch signature slot was all zeros');

    const disconnectResult = await evaluate(
      cdp,
      dappSession,
      `window.fearlessSolana.disconnect().then(() => ({
        accountCount: window.fearlessSolana.accounts.length,
        connected: window.fearlessSolana.connected,
        disconnectedEventCount: window.__fearlessSolanaSmoke.events.filter((event) => event === 'disconnect').length
      }))`,
      { awaitPromise: true }
    );

    assert(disconnectResult.connected === false, 'Provider stayed connected after disconnect');
    assert(disconnectResult.accountCount === 0, 'Provider kept Solana accounts after disconnect');
    assert(disconnectResult.disconnectedEventCount === 1, 'Provider did not emit exactly one disconnect event');

    const irohaSmoke = await runIrohaConnectSmoke(cdp, extensionSession, dappSession, server.host, universalWalletFixture.expected.iroha);

    console.info(
      JSON.stringify(
        {
          authorizedHost: server.host,
          extensionId,
          irohaNexusAddress: irohaSmoke.nexusAddress,
          irohaTairaAddress: irohaSmoke.tairaAddress,
          signedBatchTransactions: signAllTransactions.count,
          solanaAddress: SOLANA_ADDRESS,
          substrateAddress,
        },
        null,
        2
      )
    );
  } finally {
    if (cdp) {
      await cdp.send('Browser.close').catch(() => undefined);
      cdp.close();
    }

    await stopChrome(chrome);
    await server.close();
    await fs.rm(userDataDir, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function loadUniversalWalletFixture() {
  const raw = await fs.readFile(path.join(root, 'docs/universal-wallet-v2-vectors.json'), 'utf8');
  const payload = JSON.parse(raw);
  const fixture = payload?.vectors?.[0];

  assert(fixture?.expected?.iroha?.nexus?.i105, 'Universal Wallet fixture does not include a Nexus Iroha address');
  assert(fixture?.expected?.iroha?.taira?.i105, 'Universal Wallet fixture does not include a Taira Iroha address');

  return fixture;
}

async function assertSeededUniversalWalletMetadata(cdp, sessionId, fixture) {
  const accounts = await extensionSend(cdp, sessionId, 'pri(accounts.subscribe)', null);
  const account = accounts.find((candidate) => candidate.solanaAddress === SOLANA_ADDRESS);

  assert(account, `Seeded account did not appear in the extension account list: ${JSON.stringify(accounts)}`);
  assert(
    account.irohaPublicKeyHex === fixture.expected.iroha.nexus.publicKeyHex,
    `Seeded account lost Iroha metadata: ${JSON.stringify(account)}`
  );
}

async function seedWallet(cdp, sessionId, fixture) {
  await extensionSend(cdp, sessionId, 'pri(keyring.reset)', null).catch(() => undefined);
  const passwordChanged = await extensionSend(cdp, sessionId, 'pri(keyring.changePassword)', {
    newPassword: TEST_PASSWORD,
    oldPassword: '',
  });

  assert(passwordChanged === true, 'Unable to set test keyring password');

  const substrateAddress = await extensionSend(cdp, sessionId, 'pri(accounts.create)', {
    meta: {
      irohaPublicKeyHex: fixture.expected.iroha.nexus.publicKeyHex,
      name: 'Solana Smoke',
      solanaAddress: SOLANA_ADDRESS,
      whenCreated: 1,
    },
    suri: TEST_MNEMONIC,
    type: 'sr25519',
    walletEcosystem: 'substrate',
  });

  const hasAccounts = await extensionSend(cdp, sessionId, 'pri(keyring.hasAccounts)', null);

  assert(hasAccounts === true, 'Extension keyring did not retain the seeded account');
  const exportedJson = await extensionSend(cdp, sessionId, 'pri(accounts.export.json)', {
    address: substrateAddress,
    password: TEST_PASSWORD,
  }).catch((error) => ({ error: error.message }));
  assert(
    (await extensionSend(cdp, sessionId, 'pri(keyring.unlock)', { password: TEST_PASSWORD })) === true,
    'Unable to unlock seeded keyring'
  );

  const exported = await extensionSend(cdp, sessionId, 'pri(keyring.export.mnemonic)', {
    address: substrateAddress,
    password: TEST_PASSWORD,
    walletEcosystem: 'substrate',
  });
  const exportedWithEmptyPassword =
    exported?.seed === TEST_MNEMONIC
      ? undefined
      : await extensionSend(cdp, sessionId, 'pri(keyring.export.mnemonic)', {
          address: substrateAddress,
          password: '',
          walletEcosystem: 'substrate',
        });

  assert(
    exported?.seed === TEST_MNEMONIC,
    `Seeded account mnemonic export did not match the vector mnemonic: ${JSON.stringify({
      exported,
      exportedWithEmptyPassword,
      exportedJson,
    })}`
  );

  return substrateAddress;
}

async function runIrohaConnectSmoke(cdp, extensionSession, dappSession, host, iroha) {
  await waitForExpression(
    cdp,
    dappSession,
    'Boolean(window.fearlessIroha && window.fearlessIroha.isFearlessWallet && window.fearlessIroha.version === "1.0.0")',
    'Iroha provider injection'
  );

  const initialAccounts = await evaluate(cdp, dappSession, 'window.fearlessIroha.request({ method: "accounts" })', {
    awaitPromise: true,
  });

  assert(initialAccounts.accounts?.length === 0, 'Iroha provider returned accounts before authorization');

  const failClosedMessage = await evaluate(
    cdp,
    dappSession,
    `window.fearlessIroha.request({ method: 'signTransaction', params: { transaction: new Uint8Array([1, 2, 3]) } })
      .then(() => 'unexpected-success', (error) => error.message)`,
    { awaitPromise: true }
  );

  assert(
    typeof failClosedMessage === 'string' && failClosedMessage.includes('not available in this browser build'),
    `Expected fail-closed Iroha signing rejection, got ${JSON.stringify(failClosedMessage)}`
  );

  await initializeIrohaSmoke(cdp, dappSession);

  await startIrohaConnect(cdp, dappSession, 'nexus');
  const nexusAuthRequest = await waitForAuthRequest(cdp, extensionSession, host, 'iroha');
  const nexusAllowedAccounts = getAuthRequestAllowedAccounts(nexusAuthRequest);

  assert(
    nexusAllowedAccounts.includes(iroha.nexus.i105),
    'Nexus authorization request did not include the Nexus I105 address'
  );
  await extensionSend(cdp, extensionSession, 'pri(authorize.approve)', {
    authorizedAccounts: [iroha.nexus.i105],
    id: nexusAuthRequest.id,
  });

  const nexusConnect = await evaluate(cdp, dappSession, 'window.__fearlessIrohaSmoke.connect', { awaitPromise: true });

  assert(nexusConnect.connected === true, 'Iroha provider did not report connected after Nexus authorization');
  assert(nexusConnect.selectedAddress === iroha.nexus.i105, 'Iroha provider selected the wrong Nexus address');
  assert(nexusConnect.publicKeyHex === iroha.nexus.publicKeyHex, 'Iroha provider exposed the wrong public key');
  assert(nexusConnect.accounts?.[0]?.chain === 'sora:nexus', 'Iroha provider returned the wrong Nexus chain id');
  assert(nexusConnect.accounts?.[0]?.network === 'nexus', 'Iroha provider returned the wrong Nexus network key');

  await startIrohaConnect(cdp, dappSession, 'taira');
  const tairaAuthRequest = await waitForAuthRequest(cdp, extensionSession, host, 'iroha');
  const tairaAllowedAccounts = getAuthRequestAllowedAccounts(tairaAuthRequest);

  assert(
    tairaAllowedAccounts.includes(iroha.taira.i105),
    'Taira authorization request did not include the Taira I105 address'
  );
  assert(
    !tairaAllowedAccounts.includes(iroha.nexus.i105),
    'Taira authorization request leaked the Nexus I105 address'
  );
  await extensionSend(cdp, extensionSession, 'pri(authorize.approve)', {
    authorizedAccounts: [iroha.taira.i105],
    id: tairaAuthRequest.id,
  });

  const tairaConnect = await evaluate(cdp, dappSession, 'window.__fearlessIrohaSmoke.connect', { awaitPromise: true });

  assert(tairaConnect.connected === true, 'Iroha provider did not report connected after Taira authorization');
  assert(tairaConnect.selectedAddress === iroha.taira.i105, 'Iroha provider selected the wrong Taira address');
  assert(tairaConnect.accounts?.[0]?.chain === 'iroha:taira', 'Iroha provider returned the wrong Taira chain id');
  assert(tairaConnect.accounts?.[0]?.network === 'taira', 'Iroha provider returned the wrong Taira network key');

  const disconnectResult = await evaluate(
    cdp,
    dappSession,
    `window.fearlessIroha.disconnect().then(() => ({
      accountCount: window.fearlessIroha.accounts.length,
      connected: window.fearlessIroha.connected,
      disconnectedEventCount: window.__fearlessIrohaSmoke.events.filter((event) => event === 'disconnect').length
    }))`,
    { awaitPromise: true }
  );

  assert(disconnectResult.connected === false, 'Iroha provider stayed connected after disconnect');
  assert(disconnectResult.accountCount === 0, 'Iroha provider kept accounts after disconnect');
  assert(disconnectResult.disconnectedEventCount >= 1, 'Iroha provider did not emit disconnect');

  return {
    nexusAddress: iroha.nexus.i105,
    tairaAddress: iroha.taira.i105,
  };
}

async function initializeIrohaSmoke(cdp, sessionId) {
  await evaluate(
    cdp,
    sessionId,
    `
      window.__fearlessIrohaSmoke = {
        events: []
      };
      window.fearlessIroha.on('connect', (account) => {
        window.__fearlessIrohaSmoke.events.push('connect');
        window.__fearlessIrohaSmoke.connectEventAddress = account?.address ?? null;
      });
      window.fearlessIroha.on('disconnect', () => {
        window.__fearlessIrohaSmoke.events.push('disconnect');
      });
      window.fearlessIroha.on('accountChanged', (account) => {
        window.__fearlessIrohaSmoke.accountChanged = account?.address ?? null;
      });
      true;
    `
  );
}

async function startIrohaConnect(cdp, sessionId, network) {
  await evaluate(
    cdp,
    sessionId,
    `
      window.__fearlessIrohaSmoke.connect = window.fearlessIroha.connect({ network: ${JSON.stringify(network)} }).then((response) => ({
        accounts: response.accounts,
        accountChanged: window.__fearlessIrohaSmoke.accountChanged,
        connected: window.fearlessIroha.connected,
        connectEventAddress: window.__fearlessIrohaSmoke.connectEventAddress,
        publicKeyHex: window.fearlessIroha.publicKeyHex,
        selectedAddress: window.fearlessIroha.selectedAddress
      }));
      true;
    `
  );
}

async function startConnect(cdp, sessionId) {
  await evaluate(
    cdp,
    sessionId,
    `
      window.__fearlessSolanaSmoke = {
        events: []
      };
      window.fearlessSolana.on('connect', (publicKey) => {
        window.__fearlessSolanaSmoke.events.push('connect');
        window.__fearlessSolanaSmoke.connectEventPublicKey = publicKey?.toBase58?.();
      });
      window.fearlessSolana.on('disconnect', () => {
        window.__fearlessSolanaSmoke.events.push('disconnect');
      });
      window.fearlessSolana.on('accountChanged', (publicKey) => {
        window.__fearlessSolanaSmoke.accountChanged = publicKey?.toBase58?.() ?? null;
      });
      window.__fearlessSolanaSmoke.connect = window.fearlessSolana.connect().then((response) => ({
        accounts: response.accounts,
        accountChanged: window.__fearlessSolanaSmoke.accountChanged,
        connected: window.fearlessSolana.connected,
        connectEventPublicKey: window.__fearlessSolanaSmoke.connectEventPublicKey,
        publicKey: window.fearlessSolana.publicKey?.toBase58?.()
      }));
      true;
    `
  );
}

async function runSignFlow(cdp, extensionSession, dappSession, { method, resultExpression, startExpression }) {
  await evaluate(cdp, dappSession, startExpression);
  const request = await waitForSolanaSigningRequest(cdp, extensionSession, method);

  assert(request.account?.address === SOLANA_ADDRESS, `${method} request used unexpected account`);
  await extensionSend(cdp, extensionSession, 'pri(signing.approve)', { id: request.id });

  return evaluate(cdp, dappSession, resultExpression, { awaitPromise: true });
}

async function waitForAuthRequest(cdp, sessionId, host, accountAuthType = 'solana') {
  return eventually(async () => {
    const requests = await extensionSend(cdp, sessionId, 'pri(authorize.requests)', null);

    return requests.find((request) => {
      const requestedType = request.request?.accountAuthType ?? request.accountAuthType;

      return request.url.includes(host) && requestedType === accountAuthType;
    });
  }, `pending ${accountAuthType} authorization request`);
}

function getAuthRequestAllowedAccounts(authRequest) {
  return authRequest.request?.allowedAccounts ?? authRequest.allowedAccounts ?? [];
}

async function waitForSolanaSigningRequest(cdp, sessionId, method) {
  return eventually(async () => {
    const requests = await extensionSend(cdp, sessionId, 'pri(signing.solanaRequests)', null);

    return Object.values(requests).find((request) => request.method === method);
  }, `pending Solana ${method} request`);
}

async function setupExtensionMessaging(cdp, sessionId) {
  await waitForExpression(cdp, sessionId, 'Boolean(globalThis.chrome?.runtime?.connect)', 'extension runtime API');
  await evaluate(
    cdp,
    sessionId,
    `
      (() => {
        if (globalThis.__fearlessExtensionSmoke) return true;

        const pending = new Map();
        let port;

        function rejectPending(error) {
          for (const [id, handler] of pending) {
            pending.delete(id);
            handler.reject(error);
          }
        }

        function connect() {
          if (port) return port;

          port = chrome.runtime.connect({ name: ${JSON.stringify(PORT_EXTENSION)} });

          port.onDisconnect.addListener(() => {
            const message = chrome.runtime.lastError?.message || 'Extension port disconnected';

            port = undefined;
            rejectPending(new Error(message));
          });

          port.onMessage.addListener((message) => {
            const handler = pending.get(message.id);

            if (!handler) return;

            pending.delete(message.id);

            if (message.error) {
              handler.reject(new Error(message.error));
            } else if (Object.prototype.hasOwnProperty.call(message, 'response')) {
              handler.resolve(message.response);
            } else {
              handler.resolve(message.subscription);
            }
          });

          return port;
        }

        globalThis.__fearlessExtensionSmoke = {
          send(message, request) {
            const id = 'solana-smoke-' + Date.now() + '-' + Math.random().toString(16).slice(2);

            return new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                pending.delete(id);
                reject(new Error('Timed out waiting for ' + message));
              }, ${Math.min(timeoutMs, 20_000)});

              pending.set(id, {
                reject(error) {
                  clearTimeout(timeout);
                  reject(error);
                },
                resolve(response) {
                  clearTimeout(timeout);
                  resolve(response);
                }
              });

              try {
                connect().postMessage({
                  id,
                  message,
                  origin: 'fearless-solana-extension-smoke',
                  request
                });
              } catch (error) {
                pending.delete(id);
                clearTimeout(timeout);
                port = undefined;
                reject(error);
              }
            });
          }
        };

        connect();

        return true;
      })();
    `
  );
}

async function extensionSend(cdp, sessionId, message, request) {
  return evaluate(
    cdp,
    sessionId,
    `globalThis.__fearlessExtensionSmoke.send(${JSON.stringify(message)}, ${JSON.stringify(request)})`,
    { awaitPromise: true }
  );
}

async function openExtensionControlPage(cdp, extensionId) {
  const { targetId } = await cdp.send('Target.createTarget', {
    url: `chrome-extension://${extensionId}/popup.html#/`,
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });

  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await waitForExpression(cdp, sessionId, 'document.readyState !== "loading"', 'extension control page readiness');

  return sessionId;
}

async function openDappPage(cdp, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url });
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });

  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await waitForExpression(cdp, sessionId, 'document.readyState === "complete"', 'dApp page load');
  await evaluate(
    cdp,
    sessionId,
    `
      function base64ToBytes(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

        return bytes;
      }

      function bytesToBase64(bytes) {
        let binary = '';

        bytes.forEach((byte) => {
          binary += String.fromCharCode(byte);
        });

        return btoa(binary);
      }

      true;
    `
  );

  return sessionId;
}

async function waitForTarget(cdp, predicate, description, chrome) {
  const deadline = Date.now() + timeoutMs;
  let targets = [];

  while (Date.now() < deadline) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find(predicate);

    targets = targetInfos;
    if (target) return target;

    await sleep(250);
  }

  const formattedTargets = targets
    .map((target) => `${target.type} ${target.url || '<no-url>'} ${target.title || ''}`.trim())
    .join('\n');

  const chromeOutput = chrome?.debugOutput?.trim();
  const outputSuffix = chromeOutput ? `\n\nChrome output:\n${chromeOutput}` : '';

  throw new Error(
    `Timed out waiting for ${description}. Available Chrome targets:\n${formattedTargets || '<none>'}${outputSuffix}`
  );
}

async function waitForExpression(cdp, sessionId, expression, description) {
  return eventually(async () => {
    const value = await evaluate(cdp, sessionId, expression);

    return value ? value : undefined;
  }, description);
}

async function evaluate(cdp, sessionId, expression, options = {}) {
  const result = await cdp.send(
    'Runtime.evaluate',
    {
      awaitPromise: options.awaitPromise ?? true,
      expression,
      returnByValue: true,
      userGesture: true,
    },
    sessionId
  );

  if (result.exceptionDetails) {
    const exception = result.exceptionDetails.exception;
    const message = exception?.description || exception?.value || result.exceptionDetails.text || 'Evaluation failed';

    throw new Error(message);
  }

  return result.result?.value;
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

  const suffix = lastError ? ` Last error: ${lastError.message}` : '';

  throw new Error(`Timed out waiting for ${description}.${suffix}`);
}

function launchChrome(userDataDir) {
  const args = [
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--disable-popup-blocking',
    '--disable-sync',
    '--no-default-browser-check',
    '--no-first-run',
    '--password-store=basic',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];

  if (usePipeTransport) args.unshift('--enable-unsafe-extension-debugging', '--remote-debugging-pipe');
  else args.unshift(`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--remote-debugging-port=0');

  if (headless) args.unshift('--headless=new');

  const child = spawn(chromeBinary, args, {
    env: {
      ...process.env,
      TMPDIR: os.tmpdir(),
    },
    stdio: usePipeTransport ? ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
  });

  child.debugOutput = '';

  const capture = (chunk) => {
    child.debugOutput = `${child.debugOutput}${chunk.toString()}`.slice(-20_000);
  };

  if (!usePipeTransport) child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  return child;
}

function waitForDevToolsEndpoint(chrome) {
  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;

      settled = true;
      cleanup();

      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      output += chunk.toString();

      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);

      if (match) finish(null, match[1]);
    };
    const onExit = (code, signal) => {
      finish(new Error(`Chrome exited before DevTools was ready (code=${code}, signal=${signal}).\n${output}`));
    };
    const cleanup = () => {
      chrome.stdout.off('data', onData);
      chrome.stderr.off('data', onData);
      chrome.off('exit', onExit);
    };

    chrome.stdout.on('data', onData);
    chrome.stderr.on('data', onData);
    chrome.once('exit', onExit);
  });
}

async function stopChrome(chrome) {
  if (!chrome || chrome.exitCode !== null) return;

  chrome.kill('SIGTERM');

  await Promise.race([
    new Promise((resolve) => chrome.once('exit', resolve)),
    sleep(2_000).then(() => {
      if (chrome.exitCode === null) chrome.kill('SIGKILL');
    }),
  ]);
}

function startDappServer() {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');

    if (request.url !== '/' && request.url !== '/dapp.html') {
      response.writeHead(404);
      response.end('not found');

      return;
    }

    response.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Fearless Solana Smoke</title>
  </head>
  <body>
    <main id="app">Fearless Solana Smoke</main>
  </body>
</html>`);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('Unable to allocate local dApp server port'));

        return;
      }

      resolve({
        close: () => new Promise((closeResolve) => server.close(closeResolve)),
        host: `127.0.0.1:${address.port}`,
        url: `http://127.0.0.1:${address.port}/dapp.html`,
      });
    });
  });
}

async function assertFile(filePath, message) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`${filePath} is not available. ${message}`);
  }
}

function validTransactionBase64() {
  return Buffer.from(transaction(legacyMessage())).toString('base64');
}

function legacyMessage() {
  return bytes(
    [1, 0, 1],
    compact(2),
    base58Decode(SOLANA_ADDRESS),
    base58Decode(SYSTEM_PROGRAM),
    new Uint8Array(32).fill(9),
    compact(1),
    [1],
    compact(1),
    [0],
    compact(0)
  );
}

function transaction(message) {
  return bytes(compact(1), new Uint8Array(64), message);
}

function compact(value) {
  const result = [];
  let next = value;

  do {
    let byte = next & 0x7f;

    next >>= 7;
    if (next > 0) byte |= 0x80;
    result.push(byte);
  } while (next > 0);

  return result;
}

function bytes(...chunks) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function base58Decode(value) {
  let leadingZeroes = 0;

  for (const char of value) {
    if (char !== BASE58_ALPHABET[0]) break;
    leadingZeroes += 1;
  }

  const result = [0];

  for (const char of value.slice(leadingZeroes)) {
    const carryStart = BASE58_ALPHABET.indexOf(char);

    if (carryStart < 0) throw new Error(`Invalid base58 character: ${char}`);

    let carry = carryStart;

    for (let index = 0; index < result.length; index += 1) {
      const next = result[index] * 58 + carry;

      result[index] = next & 0xff;
      carry = next >> 8;
    }

    while (carry > 0) {
      result.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const decoded = value.length === leadingZeroes ? [] : result.reverse();

  return Uint8Array.from([...new Array(leadingZeroes).fill(0), ...decoded]);
}

function base64ByteLength(value) {
  return Buffer.from(value, 'base64').length;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
