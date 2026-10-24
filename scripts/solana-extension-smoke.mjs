/* global Buffer, WebSocket, URL, clearTimeout, console, process, setTimeout */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const productionPopupOnly = process.argv.includes('--production-popup');
// `--search-screenshots <dir>`: check the portfolio search in the real popup, save screenshots there, and stop.
const searchScreenshotsArg = process.argv.indexOf('--search-screenshots');
const searchScreenshotsDir = searchScreenshotsArg === -1 ? undefined : process.argv[searchScreenshotsArg + 1];
const extensionDir = path.resolve(root, `dist/extension/${productionPopupOnly ? 'chrome' : 'chrome-test'}`);
const manifestPath = path.join(extensionDir, 'manifest.json');
const smokeControlPath = path.join(extensionDir, 'smoke-control.html');
let chromeBinary =
  process.env.CHROME_BIN ||
  (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const headless = process.env.SOLANA_EXTENSION_SMOKE_HEADLESS !== 'false';
const timeoutMs = Number(process.env.SOLANA_EXTENSION_SMOKE_TIMEOUT_MS ?? 60_000);
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
const LEGACY_TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
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
  await assertFile(
    manifestPath,
    productionPopupOnly
      ? 'Build the production extension first with `yarn build:extension`.'
      : 'Build the test extension first with `yarn build:extension-test`.'
  );
  if (!productionPopupOnly) {
    await assertFile(smokeControlPath, 'Build the test extension through `yarn test:e2e:solana`.');
  }
  chromeBinary = await resolveExecutable(chromeBinary, 'Set CHROME_BIN to a Chrome/Chromium executable.');

  const deriveWalletFixture = productionPopupOnly ? undefined : await loadWalletFixtureDerivation();
  const [solanaServer, irohaServer] = productionPopupOnly
    ? [undefined, undefined]
    : await Promise.all([startDappServer(), startDappServer()]);
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-solana-extension-smoke-'));
  const chrome = launchChrome(userDataDir);
  let cdp;
  let stopExtensionKeepAlive;

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
        (target) =>
          ['background_page', 'service_worker'].includes(target.type) &&
          target.url.startsWith('chrome-extension://') &&
          ['/background.js', '/service_worker.js'].some((suffix) => target.url.endsWith(suffix)),
        'extension service worker',
        chrome
      );

      extensionId = new URL(extensionTarget.url).hostname;
    }

    const backgroundSession = await openExtensionBackgroundSession(cdp, extensionId, chrome);

    if (productionPopupOnly) {
      const popup = await assertProductionPopup(cdp, extensionId, backgroundSession);

      console.info('[extension-smoke] production popup ready');
      console.info(JSON.stringify({ extensionId, ...popup }, null, 2));

      return;
    }

    const extensionSession = await openExtensionControlPage(cdp, extensionId);

    await setupExtensionMessaging(cdp, extensionSession);
    stopExtensionKeepAlive = startExtensionKeepAlive(cdp, extensionSession, backgroundSession);
    await eventually(() => extensionSend(cdp, extensionSession, 'pri(app.port.ping)', null), 'background ping');
    await eventually(() => extensionSend(cdp, extensionSession, 'pri(app.isReady)', null), 'extension app readiness');
    console.info('[extension-smoke] extension ready');

    await initializeKeyring(cdp, extensionSession);
    const legacyFixture = deriveWalletFixture(LEGACY_TEST_MNEMONIC);
    const legacyAddress = await createSeededWallet(cdp, extensionSession, legacyFixture, false);
    await assertLegacyRecoveryPopup(cdp, extensionId, extensionSession, legacyAddress);
    const mnemonic = await extensionSend(cdp, extensionSession, 'pri(keyring.generateMnemonic)', {
      walletEcosystem: 'substrate', wordCount: 24,
    });
    const universalWalletFixture = deriveWalletFixture(mnemonic);
    const solanaAddress = universalWalletFixture.expected.solana.address;
    const transactionBase64 = validTransactionBase64(solanaAddress);
    const substrateAddress = await seedWallet(cdp, extensionSession, universalWalletFixture);
    await assertSeededUniversalWalletMetadata(cdp, extensionSession, universalWalletFixture, legacyAddress);
    await assertFreshWalletHasNoRecoveryNotice(cdp, extensionId, extensionSession, substrateAddress, legacyAddress);
    console.info('[extension-smoke] wallet seeded');
    if (searchScreenshotsDir) {
      await assertPortfolioSearch(cdp, extensionId, extensionSession, substrateAddress);
      return;
    }
    const dappSession = await openDappPage(cdp, solanaServer.url);

    await waitForExpression(
      cdp,
      dappSession,
      'Boolean(window.fearlessSolana && window.solana && window.fearlessSolana === window.solana && window.fearlessSolana.isFearlessWallet)',
      'Solana provider injection'
    );

    const walletStandardFeatures = await evaluate(
      cdp,
      dappSession,
      'Object.keys(window.fearlessSolana.features).sort()'
    );
    for (const feature of [
      'solana:signAndSendTransaction',
      'solana:signMessage',
      'solana:signTransaction',
      'standard:connect',
      'standard:disconnect',
      'standard:events',
    ]) {
      assert(walletStandardFeatures.includes(feature), `Wallet Standard feature is missing: ${feature}`);
    }

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
    const authRequest = await waitForAuthRequest(cdp, extensionSession, solanaServer.host);

    assert(
      authRequest.accountAuthType === 'solana',
      `Expected Solana auth request, got ${authRequest.accountAuthType}`
    );
    const legacyAuthorizationError = await evaluate(cdp, extensionSession,
      `globalThis.__fearlessExtensionSmoke.send('pri(authorize.approve)', ${JSON.stringify({
        authorizedAccounts: [legacyFixture.expected.solana.address], id: authRequest.id,
      })}).then(() => '', (error) => error.message)`,
      { awaitPromise: true });
    assert(legacyAuthorizationError.includes('recovery-only'), 'Imported wallet was allowed to authorize a dApp');
    console.info('[extension-smoke] legacy wallet authorization rejected');
    await extensionSend(cdp, extensionSession, 'pri(authorize.approve)', {
      authorizedAccounts: [solanaAddress],
      id: authRequest.id,
    });

    const connectResult = await evaluate(cdp, dappSession, 'window.__fearlessSolanaSmoke.connect', {
      awaitPromise: true,
    });
    console.info('[extension-smoke] Solana authorized');

    assert(connectResult.connected === true, 'Provider did not report a connected state');
    assert(connectResult.publicKey === solanaAddress, `Unexpected connected public key ${connectResult.publicKey}`);
    assert(connectResult.accounts?.[0]?.address === solanaAddress, 'Connected account did not use the Solana address');
    assert(
      ['solana:signMessage', 'solana:signTransaction', 'solana:signAndSendTransaction'].every((feature) =>
        connectResult.accountFeatures?.includes(feature)
      ),
      `Connected Wallet Standard account features are incomplete: ${JSON.stringify(connectResult.accountFeatures)}`
    );

    const signMessage = await runSignFlow(cdp, extensionSession, dappSession, solanaAddress, {
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

    assert(signMessage.publicKey === solanaAddress, `Unexpected signing public key ${signMessage.publicKey}`);
    assert(signMessage.signatureLength === 64, `Unexpected Solana signature length ${signMessage.signatureLength}`);
    assert(signMessage.signatureNonZero === true, 'Solana message signature was all zeros');

    const signTransaction = await runSignFlow(cdp, extensionSession, dappSession, solanaAddress, {
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

    const signAllTransactions = await runSignFlow(cdp, extensionSession, dappSession, solanaAddress, {
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
    console.info('[extension-smoke] Solana signing complete');

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

    const irohaDappSession = await openDappPage(cdp, irohaServer.url);
    console.info('[extension-smoke] starting fresh-origin Iroha checks');
    const irohaSmoke = await runIrohaConnectSmoke(
      cdp,
      extensionSession,
      irohaDappSession,
      irohaServer.host,
      universalWalletFixture.expected.iroha
    );

    console.info(
      JSON.stringify(
        {
          authorizedHosts: {
            iroha: irohaServer.host,
            solana: solanaServer.host,
          },
          extensionId,
          irohaNexusAddress: irohaSmoke.nexusAddress,
          irohaTairaAddress: irohaSmoke.tairaAddress,
          signedBatchTransactions: signAllTransactions.count,
          solanaAddress,
          substrateAddress,
        },
        null,
        2
      )
    );
  } finally {
    await stopExtensionKeepAlive?.();
    if (cdp) {
      await cdp.send('Browser.close').catch(() => undefined);
      cdp.close();
    }

    await stopChrome(chrome);
    await Promise.all([solanaServer?.close(), irohaServer?.close()]);
    await fs.rm(userDataDir, { force: true, recursive: true }).catch(() => undefined);
  }
}

// Load the application's derivation helpers in Node, without adding a test-only
// trust marker or generation path to the extension build.
async function loadWalletFixtureDerivation() {
  const { createServer } = await import('vite');
  const { HDNodeWallet } = await import('ethers');
  const server = await createServer({
    configFile: false,
    root,
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': path.join(root, 'src') } },
  });
  try {
    const { deriveUniversalWalletKeyringFields } = await server.ssrLoadModule('/src/util/universalWalletKeyringFields.ts');
    const { encodeIrohaI105Address } = await server.ssrLoadModule('/src/util/iroha.ts');
    return (mnemonic) => {
      const fields = deriveUniversalWalletKeyringFields(mnemonic);
      const irohaAccount = (network) => ({
        i105: encodeIrohaI105Address(fields.irohaPublicKeyHex, network),
        publicKeyHex: fields.irohaPublicKeyHex,
      });
      return {
        mnemonic,
        fields: { ...fields, ethereumAddress: HDNodeWallet.fromPhrase(mnemonic).address },
        expected: {
          solana: { address: fields.solanaAddress },
          iroha: { nexus: irohaAccount('nexus'), taira: irohaAccount('taira') },
        },
      };
    };
  } finally {
    await server.close();
  }
}

async function assertSeededUniversalWalletMetadata(cdp, sessionId, fixture, legacyAddress) {
  const accounts = await extensionSend(cdp, sessionId, 'pri(accounts.subscribe)', null);
  const account = accounts.find((candidate) => candidate.solanaAddress === fixture.expected.solana.address);
  const legacy = accounts.find((candidate) => candidate.address === legacyAddress);

  assert(account, 'Fresh account did not appear in the extension account list');
  assert(account.walletSecurityGeneration === 1, 'Backend-generated wallet did not retain its security provenance');
  assert(legacy && legacy.walletSecurityGeneration === undefined, 'Imported wallet retained an untrusted security marker');
  assert(!legacy.isHardware, 'Imported local secret retained a hardware-wallet exemption');
  assert(
    account.irohaPublicKeyHex === fixture.expected.iroha.nexus.publicKeyHex,
    'Fresh account lost its derived Iroha metadata'
  );
}

async function initializeKeyring(cdp, sessionId) {
  await extensionSend(cdp, sessionId, 'pri(keyring.reset)', null).catch(() => undefined);
  const passwordChanged = await extensionSend(cdp, sessionId, 'pri(keyring.changePassword)', {
    newPassword: TEST_PASSWORD,
    oldPassword: '',
  });
  assert(passwordChanged === true, 'Unable to set test keyring password');
}

async function createSeededWallet(cdp, sessionId, fixture, fresh) {
  return extensionSend(cdp, sessionId, 'pri(accounts.create)', {
    meta: {
      ...fixture.fields,
      name: fresh ? 'Fresh Solana Smoke' : 'Legacy Solana Smoke',
      whenCreated: 1,
      // An import must not become trusted just because its metadata claims so.
      ...(!fresh ? { walletSecurityGeneration: 1, isHardware: true } : {}),
    },
    suri: fixture.mnemonic,
    type: 'sr25519',
    walletEcosystem: 'substrate',
    requireFreshGeneration: fresh,
  });
}

async function seedWallet(cdp, sessionId, fixture) {
  const substrateAddress = await createSeededWallet(cdp, sessionId, fixture, true);
  const hasAccounts = await extensionSend(cdp, sessionId, 'pri(keyring.hasAccounts)', null);
  assert(hasAccounts === true, 'Extension keyring did not retain the seeded account');
  await extensionSend(cdp, sessionId, 'pri(accounts.export.json)', {
    address: substrateAddress,
    password: TEST_PASSWORD,
  });
  assert(
    (await extensionSend(cdp, sessionId, 'pri(keyring.unlock)', { password: TEST_PASSWORD })) === true,
    'Unable to unlock seeded keyring'
  );
  const exported = await extensionSend(cdp, sessionId, 'pri(keyring.export.mnemonic)', {
    address: substrateAddress,
    password: TEST_PASSWORD,
    walletEcosystem: 'substrate',
  });
  assert(exported?.seed === fixture.mnemonic, 'Fresh account mnemonic export did not match its generated phrase');
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

  const invalidNetworkMessage = await evaluate(
    cdp,
    dappSession,
    `window.fearlessIroha.connect({ network: 'invalid' })
      .then(() => 'unexpected-success', (error) => error.message)`
  );
  assert(
    invalidNetworkMessage === 'invalid_iroha_network',
    `Unexpected invalid Iroha network result: ${invalidNetworkMessage}`
  );

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
  console.info('[extension-smoke] Iroha Nexus authorized');

  await startIrohaConnect(cdp, dappSession, 'taira');
  const tairaAuthRequest = await waitForAuthRequest(cdp, extensionSession, host, 'iroha');
  const tairaAllowedAccounts = getAuthRequestAllowedAccounts(tairaAuthRequest);

  assert(
    tairaAllowedAccounts.includes(iroha.taira.i105),
    'Taira authorization request did not include the Taira I105 address'
  );
  assert(!tairaAllowedAccounts.includes(iroha.nexus.i105), 'Taira authorization request leaked the Nexus I105 address');
  await extensionSend(cdp, extensionSession, 'pri(authorize.approve)', {
    authorizedAccounts: [iroha.taira.i105],
    id: tairaAuthRequest.id,
  });

  const tairaConnect = await evaluate(cdp, dappSession, 'window.__fearlessIrohaSmoke.connect', { awaitPromise: true });

  assert(tairaConnect.connected === true, 'Iroha provider did not report connected after Taira authorization');
  assert(tairaConnect.selectedAddress === iroha.taira.i105, 'Iroha provider selected the wrong Taira address');
  assert(tairaConnect.accounts?.[0]?.chain === 'iroha:taira', 'Iroha provider returned the wrong Taira chain id');
  assert(tairaConnect.accounts?.[0]?.network === 'taira', 'Iroha provider returned the wrong Taira network key');
  console.info('[extension-smoke] Iroha Taira authorized');

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
      window.__fearlessSolanaSmoke.connect = window.fearlessSolana.connect().then(
        (response) => ({
          accounts: response.accounts,
          accountFeatures: window.fearlessSolana.accounts[0]?.features ?? [],
          accountChanged: window.__fearlessSolanaSmoke.accountChanged,
          connected: window.fearlessSolana.connected,
          connectEventPublicKey: window.__fearlessSolanaSmoke.connectEventPublicKey,
          publicKey: window.fearlessSolana.publicKey?.toBase58?.()
        }),
        (error) => {
          window.__fearlessSolanaSmoke.connectError = error?.message ?? String(error);
          throw error;
        }
      );
      true;
    `
  );
}

async function runSignFlow(cdp, extensionSession, dappSession, solanaAddress, { method, resultExpression, startExpression }) {
  await evaluate(cdp, dappSession, startExpression);
  const request = await waitForSolanaSigningRequest(cdp, extensionSession, method);

  assert(request.account?.address === solanaAddress, `${method} request used unexpected account`);
  await extensionSend(cdp, extensionSession, 'pri(signing.approve)', { id: request.id });

  return evaluate(cdp, dappSession, resultExpression, { awaitPromise: true });
}

async function waitForAuthRequest(cdp, sessionId, host, accountAuthType = 'solana') {
  return extensionWaitFor(cdp, sessionId, 'pri(authorize.requests)', {
    accountAuthType,
    host,
    kind: 'authorization',
  });
}

function getAuthRequestAllowedAccounts(authRequest) {
  return authRequest.request?.allowedAccounts ?? authRequest.allowedAccounts ?? [];
}

async function waitForSolanaSigningRequest(cdp, sessionId, method) {
  return extensionWaitFor(cdp, sessionId, 'pri(signing.solanaRequests)', {
    kind: 'solana-signing',
    method,
  });
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

        function findSubscriptionMatch(payload, match) {
          if (match.kind === 'authorization') {
            if (!Array.isArray(payload)) return undefined;

            return payload.find((request) => {
              const requestedType = request?.request?.accountAuthType ?? request?.accountAuthType;

              return String(request?.url ?? '').includes(match.host) && requestedType === match.accountAuthType;
            });
          }

          if (match.kind === 'solana-signing') {
            if (!payload || typeof payload !== 'object') return undefined;

            return Object.values(payload).find((request) => request?.method === match.method);
          }

          throw new Error('Unsupported extension smoke subscription match');
        }

        globalThis.__fearlessExtensionSmoke = {
          send(message, request) {
            const id = 'solana-smoke-' + Date.now() + '-' + Math.random().toString(16).slice(2);

            return new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                pending.delete(id);
                reject(new Error('Timed out waiting for ' + message));
              }, ${Math.max(1_000, timeoutMs - 1_000)});

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
          },
          ping() {
            connect().postMessage({
              id: 'extension-smoke-keepalive-' + Date.now(),
              message: 'pri(app.port.ping)',
              origin: 'fearless-solana-extension-smoke',
              request: null
            });
          },
          waitFor(message, request, match) {
            const id = 'extension-smoke-subscription-' + Date.now() + '-' + Math.random().toString(16).slice(2);
            const subscriptionPort = chrome.runtime.connect({ name: ${JSON.stringify(PORT_EXTENSION)} });

            return new Promise((resolve, reject) => {
              let settled = false;
              const cleanup = () => {
                if (settled) return;

                settled = true;
                clearTimeout(timeout);
                setTimeout(() => subscriptionPort.disconnect(), 0);
              };
              const fail = (error) => {
                cleanup();
                reject(error);
              };
              const timeout = setTimeout(() => {
                fail(new Error('Timed out waiting for subscription ' + message));
              }, ${Math.max(1_000, timeoutMs - 1_000)});

              subscriptionPort.onDisconnect.addListener(() => {
                if (settled) return;

                fail(new Error(chrome.runtime.lastError?.message || 'Extension subscription port disconnected'));
              });
              subscriptionPort.onMessage.addListener((response) => {
                if (settled || response.id !== id) return;
                if (response.error) {
                  fail(new Error(response.error));

                  return;
                }

                const payload = Object.prototype.hasOwnProperty.call(response, 'response')
                  ? response.response
                  : response.subscription;
                const found = findSubscriptionMatch(payload, match);

                if (found === undefined) return;

                cleanup();
                resolve(found);
              });
              subscriptionPort.postMessage({
                id,
                message,
                origin: 'fearless-solana-extension-smoke',
                request
              });
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

async function extensionWaitFor(cdp, sessionId, message, match) {
  return evaluate(
    cdp,
    sessionId,
    `globalThis.__fearlessExtensionSmoke.waitFor(${JSON.stringify(message)}, null, ${JSON.stringify(match)})`,
    { awaitPromise: true }
  );
}

function startExtensionKeepAlive(cdp, sessionId, backgroundSession) {
  let stopped = false;
  const completed = (async () => {
    while (!stopped) {
      await sleep(2_000);
      if (stopped) break;
      await cdp
        .send('Runtime.evaluate', { expression: 'Date.now()', returnByValue: true }, backgroundSession)
        .catch(() => undefined);
      await evaluate(cdp, sessionId, 'globalThis.__fearlessExtensionSmoke.ping(); true').catch(() => undefined);
    }
  })();

  return async () => {
    stopped = true;
    await completed;
  };
}

async function openExtensionControlPage(cdp, extensionId) {
  const { targetId } = await cdp.send('Target.createTarget', {
    url: `chrome-extension://${extensionId}/smoke-control.html`,
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });

  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await waitForExpression(cdp, sessionId, 'document.readyState !== "loading"', 'extension control page readiness');

  return sessionId;
}

async function assertLegacyRecoveryPopup(cdp, extensionId, extensionSession, legacyAddress) {
  await extensionSend(cdp, extensionSession, 'pri(onboarding.setComplete)', null);
  await extensionSend(cdp, extensionSession, 'pri(accounts.update.current)', {
    address: legacyAddress, walletEcosystem: 'substrate',
  });
  const { targetId } = await cdp.send('Target.createTarget', {
    url: `chrome-extension://${extensionId}/popup.html#/fearless/portfolio/tokens`,
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });
  try {
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector("dialog.wallet-upgrade[open]"))',
      'legacy wallet security popup');
    const description = await evaluate(cdp, sessionId, 'document.querySelector("#wallet-upgrade-description").textContent');
    assert(description.includes('may be compromised'), 'Legacy popup did not explain the security issue');
    await evaluate(cdp, sessionId, 'document.querySelector(".wallet-upgrade__later").click(); true');
    await waitForExpression(cdp, sessionId,
      '!document.querySelector("dialog.wallet-upgrade[open]") && Boolean(document.querySelector(".wallet-recovery-banner"))',
      'persistent recovery banner after dismissal');
    const recoveryMenu = await evaluate(cdp, sessionId,
      'Array.from(document.querySelectorAll("nav.menu button")).map(button => button.dataset.destination)');
    assert(recoveryMenu.includes('defi'), 'Old wallet cannot reach DeFi recovery actions');
    assert(!recoveryMenu.includes('polkaswap'), 'Old wallet still offers normal swaps');
    await evaluate(cdp, sessionId,
      'document.querySelector("nav.menu [data-destination=defi]").click(); true');
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(".defi-hub"))', 'DeFi recovery access');
    await evaluate(cdp, sessionId, 'location.hash = "#/fearless/polkaswap"; true');
    await waitForExpression(cdp, sessionId,
      'location.hash.includes("portfolio") && !document.querySelector(".defi-hub")', 'normal swap route remains blocked');
    await cdp.send('Page.reload', {}, sessionId);
    // A closed dialog stays closed when the extension is opened again.
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(".wallet-recovery-banner"))',
      'recovery banner after reopening');
    await sleep(1_000);
    assert(!(await evaluate(cdp, sessionId, 'Boolean(document.querySelector("dialog.wallet-upgrade"))')),
      'Closed security popup opened again when the extension was reopened');
    console.info('[extension-smoke] legacy popup, recovery banner, DeFi recovery access, blocked swaps, and reopening verified');
  } catch (error) {
    const state = await evaluate(cdp, sessionId,
      '({ route: location.hash, text: document.body?.innerText?.slice(0, 1500) })').catch(() => undefined);
    throw new Error(`${error.message}; popup state=${JSON.stringify(state)}`, { cause: error });
  } finally {
    await cdp.send('Target.closeTarget', { targetId });
  }
}

async function assertFreshWalletHasNoRecoveryNotice(cdp, extensionId, extensionSession, freshAddress, legacyAddress) {
  await extensionSend(cdp, extensionSession, 'pri(accounts.update.current)', {
    address: freshAddress, walletEcosystem: 'substrate',
  });
  const { targetId } = await cdp.send('Target.createTarget', {
    url: `chrome-extension://${extensionId}/popup.html#/fearless/portfolio/tokens`,
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });
  try {
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    // The old wallet stays stored; only the wallet being viewed decides the warning.
    await waitForExpression(cdp, sessionId,
      'document.querySelector("[data-testid=walletNameHeader]")?.textContent.trim() === "Fresh Solana Smoke"',
      'fresh wallet portfolio');
    await sleep(1_000);
    const notice = await evaluate(cdp, sessionId,
      '({ dialog: Boolean(document.querySelector("dialog.wallet-upgrade")), banner: Boolean(document.querySelector(".wallet-recovery-banner")) })');
    assert(!notice.dialog && !notice.banner, `Fresh wallet showed the old-wallet warning: ${JSON.stringify(notice)}`);
    await extensionSend(cdp, extensionSession, 'pri(accounts.update.current)', {
      address: legacyAddress, walletEcosystem: 'substrate',
    });
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(".wallet-recovery-banner"))',
      'recovery banner after switching to the old wallet');
    console.info('[extension-smoke] fresh wallet shows no old-wallet warning; the old wallet still does');
  } catch (error) {
    const state = await evaluate(cdp, sessionId,
      '({ route: location.hash, text: document.body?.innerText?.slice(0, 1500) })').catch(() => undefined);
    throw new Error(`${error.message}; popup state=${JSON.stringify(state)}`, { cause: error });
  } finally {
    await cdp.send('Target.closeTarget', { targetId });
  }
}

// A fresh wallet holds nothing, so every search answer is a token at zero: none may read "No matching assets".
async function assertPortfolioSearch(cdp, extensionId, extensionSession, address) {
  assert(searchScreenshotsDir, 'Pass a directory after --search-screenshots');
  await fs.mkdir(searchScreenshotsDir, { recursive: true });
  await extensionSend(cdp, extensionSession, 'pri(accounts.update.current)', { address, walletEcosystem: 'substrate' });
  // A fresh universal wallet gets the rows of its other ecosystems with its first balance fetch; a failed read is fine.
  await extensionSend(cdp, extensionSession, 'pri(fetch.balance)', {
    address, networks: ['Bitcoin', 'Solana'], walletEcosystem: 'substrate',
  }).catch(() => undefined);
  const { targetId } = await cdp.send('Target.createTarget', {
    url: `chrome-extension://${extensionId}/popup.html#/fearless/portfolio/tokens`,
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });
  // Typed as a person would: replace the field's text with trusted input events.
  const search = async (query) => {
    await evaluate(cdp, sessionId, `(() => {
      const input = document.querySelector('[data-testid="searchInput"] input');
      input.focus();
      input.select();
      return true;
    })()`);
    await cdp.send('Input.insertText', { text: query }, sessionId);
  };
  const state = () => evaluate(cdp, sessionId, `({
    empty: document.querySelector('[data-testid="infoText"]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
    networks: Array.from(document.querySelectorAll('.network-section')).map((section) => ({
      name: section.querySelector('.network-title')?.textContent.trim(),
      rows: Array.from(section.querySelectorAll('.asset-row')).map((row) => row.innerText.replace(/\\s+/g, ' ').trim()),
    })),
  })`);

  try {
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 561, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId);
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(\'[data-testid="searchInput"] input\'))',
      'portfolio search field');
    await waitForExpression(cdp, sessionId,
      'Boolean(document.querySelector(\'[data-testid="portfolioNetworkList"], [data-testid="infoText"]\'))', 'portfolio list');
    await evaluate(cdp, sessionId, 'document.querySelector("dialog[open] .wallet-upgrade__later")?.click(); true');
    await waitForExpression(cdp, sessionId, `(document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      .state.value.accounts?.balances ?? []).some(({ balances }) =>
        balances.some(({ name, state }) => name.toLowerCase() === 'bitcoin' && state === 'ready'))`,
    'Bitcoin rows of the universal wallet');

    const results = {};
    // The test build lists test networks and the universal wallet's own chains, so no USDT: SOL stands in.
    for (const query of ['btc', 'sol', 'zzz']) {
      await search(query);
      await sleep(800);
      results[query] = await state();
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      await fs.writeFile(path.join(searchScreenshotsDir, `search-${query}.png`), Buffer.from(data, 'base64'));
    }

    // The zero row opens the token's own page, where it can be received.
    await search('btc');
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(".network-section .asset-row"))', 'BTC row');
    await evaluate(cdp, sessionId, 'document.querySelector(".network-section .asset-row").click(); true');
    await waitForExpression(cdp, sessionId, 'Boolean(document.querySelector(\'[data-testid="receiveBtn"]\'))',
      'BTC page with Receive');
    const opened = await evaluate(cdp, sessionId, '({ route: decodeURIComponent(location.hash) })');
    const { data: assetPage } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await fs.writeFile(path.join(searchScreenshotsDir, 'open-btc.png'), Buffer.from(assetPage, 'base64'));
    assert(/BTC\/Bitcoin$/.test(opened.route), `The BTC row opened ${opened.route}`);

    console.info(`[extension-smoke] portfolio search ${JSON.stringify({ ...results, opened }, null, 2)}`);
    const btcRows = results.btc.networks.flatMap(({ rows }) => rows);
    assert(btcRows.some((row) => /^BTC\b.*\b0 BTC\b/.test(row)), 'Searching btc did not list BTC at 0');
    assert(!results.btc.empty && !results.sol.empty, 'A search for a supported token said nothing matches');
    assert(results.sol.networks.filter(({ name }) => name === 'Solana').flatMap(({ rows }) => rows).length === 3,
      'Searching sol did not list SOL, USDC and USDT once each on Solana');
    assert(!results.sol.networks.some(({ name }) => /devnet/i.test(name)), 'Searching sol listed a test-network zero');
    assert(results.zzz.empty.startsWith('No matching assets'), 'A search for no token did not say nothing matches');
    console.info(`[extension-smoke] portfolio search verified; screenshots in ${searchScreenshotsDir}`);
  } catch (error) {
    // What the popup holds: its networks and the balance rows of the selected wallet.
    const popup = await evaluate(cdp, sessionId, `(() => {
      const stores = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?.state.value ?? {};
      return {
        route: location.hash,
        networks: (stores.networks?.allNetworks ?? []).map(({ name, ecosystem, options }) =>
          [name, ecosystem, ...(options ?? [])].join('/')),
        balances: (stores.accounts?.balances ?? []).flatMap(({ balances }) =>
          balances.map(({ name, symbol, state, total }) => [name, symbol, state, total ?? '-'].join('/'))),
        wallet: Object.keys(stores.accounts?.selectedWallet ?? {}).filter((key) => stores.accounts.selectedWallet[key]),
      };
    })()`).catch(() => undefined);
    throw new Error(`${error.message}; popup state=${JSON.stringify(popup)}`, { cause: error });
  } finally {
    await cdp.send('Target.closeTarget', { targetId });
  }
}

async function assertProductionPopup(cdp, extensionId, backgroundSession) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const popupPath = manifest.action?.default_popup;
  const runtimeErrors = [];
  const runtimeSessions = new Map([[backgroundSession, 'background']]);
  const stopCollectingErrors = cdp.onEvent((message) => {
    const runtimeLabel = runtimeSessions.get(message.sessionId);

    if (!runtimeLabel) return;

    if (message.method === 'Runtime.exceptionThrown') {
      runtimeErrors.push(
        `${runtimeLabel}: ${message.params?.exceptionDetails?.exception?.description || 'uncaught exception'}`
      );
    }

    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      const stack = message.params.stackTrace?.callFrames
        ?.slice(0, 5)
        .map(({ functionName, lineNumber, url }) => `${functionName || '<anonymous>'}@${url}:${lineNumber + 1}`)
        .join(' <- ');
      runtimeErrors.push(
        `${runtimeLabel}: ${
          message.params.args
            ?.map((argument) => argument.value ?? argument.description ?? '')
            .filter(Boolean)
            .join(' ') || 'console.error'
        }${stack ? ` [${stack}]` : ''}`
      );
    }
  });

  assert(
    typeof popupPath === 'string' && popupPath.length > 0,
    'Production manifest does not define action.default_popup'
  );

  const popupUrl = new URL(popupPath, `chrome-extension://${extensionId}/`).href;
  const { targetId } = await cdp.send('Target.createTarget', { url: popupUrl });
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });
  runtimeSessions.set(sessionId, 'popup');

  try {
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await waitForExpression(cdp, sessionId, 'document.readyState === "complete"', 'production popup load');
    await waitForExpression(
      cdp,
      sessionId,
      'Boolean(document.querySelector("#app[data-v-app]"))',
      'production popup Vue mount'
    );
    await setupExtensionMessaging(cdp, sessionId);
    await eventually(() => extensionSend(cdp, sessionId, 'pri(app.port.ping)', null), 'production background ping');
    await eventually(() => extensionSend(cdp, sessionId, 'pri(app.isReady)', null), 'production app readiness');
    await waitForExpression(
      cdp,
      sessionId,
      'Boolean(document.querySelector("#app[data-v-app] button, #app[data-v-app] input, #app[data-v-app] a"))',
      'production popup interactive route'
    );

    const state = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const app = document.querySelector('#app');
        const runtimeManifest = chrome.runtime.getManifest();

        return {
          appHtmlLength: app?.innerHTML.length ?? 0,
          bodyTextLength: document.body?.innerText.trim().length ?? 0,
          interactiveElementCount: document.querySelectorAll('button, a, input, [role="button"]').length,
          manifestVersion: runtimeManifest.manifest_version,
          name: runtimeManifest.name,
          runtimeId: chrome.runtime.id,
          title: document.title,
          version: runtimeManifest.version
        };
      })()`
    );

    assert(runtimeErrors.length === 0, `Production popup logged runtime errors: ${runtimeErrors.join(' | ')}`);
    assert(
      state.runtimeId === extensionId,
      `Popup runtime id ${state.runtimeId} did not match loaded id ${extensionId}`
    );
    assert(state.manifestVersion === 3, `Expected Manifest V3, got ${state.manifestVersion}`);
    assert(
      state.version === manifest.version,
      `Popup version ${state.version} did not match packed manifest ${manifest.version}`
    );
    assert(
      state.appHtmlLength >= 100,
      `Production popup Vue tree was unexpectedly small (${state.appHtmlLength} bytes)`
    );
    assert(state.bodyTextLength > 0, 'Production popup rendered no visible text');
    assert(state.interactiveElementCount > 0, 'Production popup rendered no interactive controls');

    return state;
  } finally {
    stopCollectingErrors();
  }
}

async function openExtensionBackgroundSession(cdp, extensionId, chrome) {
  const target = await waitForTarget(
    cdp,
    (candidate) =>
      ['background_page', 'service_worker'].includes(candidate.type) &&
      candidate.url.startsWith(`chrome-extension://${extensionId}/`),
    'extension background target',
    chrome
  );
  const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId: target.targetId });

  await cdp.send('Runtime.enable', {}, sessionId);

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
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--disable-popup-blocking',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--no-default-browser-check',
    '--no-first-run',
    '--password-store=basic',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];

  if (usePipeTransport) args.unshift('--enable-unsafe-extension-debugging', '--remote-debugging-pipe');
  else
    args.unshift(
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--remote-debugging-port=0'
    );

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

async function resolveExecutable(executable, message) {
  const candidates =
    path.isAbsolute(executable) || executable.includes(path.sep)
      ? [executable]
      : (process.env.PATH ?? '')
          .split(path.delimiter)
          .filter(Boolean)
          .map((directory) => path.join(directory, executable));

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);

      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }

  throw new Error(`${executable} is not available. ${message}`);
}

function validTransactionBase64(solanaAddress) {
  return Buffer.from(transaction(legacyMessage(solanaAddress))).toString('base64');
}

function legacyMessage(solanaAddress) {
  return bytes(
    [1, 0, 1],
    compact(2),
    base58Decode(solanaAddress),
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
