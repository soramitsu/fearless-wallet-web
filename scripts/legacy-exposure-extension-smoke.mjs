#!/usr/bin/env node

// Real-Chrome check of the 3.0.x security notice (WK-9) on the production build in dist/extension/chrome.
// The built extension's storage is replaced with what released builds wrote (tests/fixtures/upgrade),
// Chrome starts again on that profile, and the script unlocks with the fixture's synthetic password and
// walks the notice and the guide. All name resolution except localhost fails, so nothing leaves the machine.
//
// Needs a Chrome that still honours --load-extension: Chrome for Testing or Chromium (CHROME_BIN).
// Usage: node scripts/legacy-exposure-extension-smoke.mjs [--screenshots DIR]

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = path.join(root, 'dist/extension/chrome');
const chromeBinary = process.env.CHROME_BIN;
const screenshotIndex = process.argv.indexOf('--screenshots');
const screenshotDir = screenshotIndex > 0 ? path.resolve(process.argv[screenshotIndex + 1] ?? '') : undefined;
const timeoutMs = Number(process.env.LEGACY_EXPOSURE_SMOKE_TIMEOUT_MS ?? 30_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.info('[legacy-exposure-smoke]', ...args);
const readFixture = async (name) =>
  JSON.parse(await fs.readFile(path.join(root, `tests/fixtures/upgrade/${name}.storage.json`), 'utf8'));

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

async function launch(profileDir) {
  const chrome = spawn(
    chromeBinary,
    [
      '--headless=new',
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--remote-debugging-port=0',
      '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--no-default-browser-check',
      '--no-first-run',
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';

    chrome.stderr.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/u);

      if (match) resolve(match[1]);
    });
    chrome.once('exit', (code) => reject(new Error(`Chrome exited before DevTools was ready (${code}).\n${output}`)));
  });
  const socket = new WebSocket(endpoint);
  const callbacks = new Map();
  let id = 0;

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const callback = callbacks.get(message.id);

    if (!callback) return;
    callbacks.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
    else callback.resolve(message.result ?? {});
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      id += 1;
      callbacks.set(id, { resolve, reject });
      socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  const evaluate = async (sessionId, expression) => {
    const { result, exceptionDetails } = await send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId
    );

    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);

    return result.value;
  };
  const worker = await eventually(
    async () =>
      (await send('Target.getTargets')).targetInfos.find(
        ({ type, url }) => type === 'service_worker' && url.startsWith('chrome-extension://') && url.endsWith('/background.js')
      ),
    'the extension service worker'
  );
  const extensionId = new URL(worker.url).hostname;

  async function openPopup(hash = '#/') {
    const { targetId } = await send('Target.createTarget', { url: `chrome-extension://${extensionId}/popup.html${hash}` });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

    await send('Runtime.enable', {}, sessionId);
    await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 561, height: 600, deviceScaleFactor: 2, mobile: false }, sessionId);
    await eventually(
      () => evaluate(sessionId, 'document.readyState === "complete" && Boolean(globalThis.chrome?.storage)'),
      'the wallet window'
    ).catch(async (error) => {
      const state = await evaluate(sessionId, '({ url: location.href, readyState: document.readyState, hasStorage: Boolean(globalThis.chrome?.storage), title: document.title })');
      throw new Error(`${error.message} ${JSON.stringify(state)}`);
    });

    return sessionId;
  }

  async function close() {
    await send('Browser.close').catch(() => undefined);
    await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), sleep(5_000)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
    socket.close();
  }

  const message = (sessionId, name, request = {}) => evaluate(sessionId, `new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: 'fw-fearless-extension' });
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => { port.disconnect(); reject(new Error('Wallet message timed out')); }, ${timeoutMs});
    port.onMessage.addListener((reply) => {
      if (reply.id !== id) return;
      clearTimeout(timeout);
      port.disconnect();
      if (reply.error) reject(new Error(reply.error));
      else resolve(reply.response);
    });
    port.postMessage({ id, message: ${JSON.stringify(name)}, request: ${JSON.stringify(request)} });
  })`);

  return { send, evaluate, openPopup, close, message };
}

const storedRecord = (browser, session) =>
  browser.evaluate(session, 'chrome.storage.local.get("legacyExposure").then(({ legacyExposure }) => legacyExposure)');

// Which accounts have new network addresses attached, and whether every stored key is byte-identical.
const accountState = (browser, session, storage) =>
  browser.evaluate(
    session,
    `chrome.storage.local.get(null).then((all) => {
      const original = ${JSON.stringify(
        Object.fromEntries(
          Object.entries(storage)
            .filter(([key]) => key.startsWith('fw:account:'))
            .map(([key, value]) => [key, value.encoded])
        )
      )};
      const accounts = Object.entries(all).filter(([key]) => key.startsWith('fw:account:'));
      return {
        enrolled: accounts.filter(([, value]) => value.meta.bitcoinAddress || value.meta.solanaAddress).length,
        keysUnchanged: accounts.length === Object.keys(original).length && accounts.every(([key, value]) => value.encoded === original[key]),
      };
    })`
  );

async function replaceStorage(browser, storage) {
  const session = await browser.openPopup();

  await eventually(
    () => browser.evaluate(session, 'chrome.storage.local.get(null).then((all) => "legacyExposure" in all)'),
    'the first start of this build'
  );
  const fresh = await storedRecord(browser, session);

  await browser.evaluate(
    session,
    `chrome.storage.local.clear().then(() => chrome.storage.local.set(${JSON.stringify(storage)})).then(() => true)`
  );
  await sleep(500);

  return fresh;
}

async function main() {
  assert(chromeBinary, 'Set CHROME_BIN to Chrome for Testing or Chromium (branded Chrome ignores --load-extension).');
  await fs.access(path.join(extensionDir, 'manifest.json')).catch(() => {
    throw new Error('Build the production extension first with `yarn build:extension`.');
  });
  if (screenshotDir) await fs.mkdir(screenshotDir, { recursive: true });

  const master305 = await readFixture('chrome-3.0.5-master-password');
  const passwords263 = await readFixture('chrome-2.6.3-account-passwords');
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-legacy-exposure-'));
  let browser;

  try {
    // A fresh install records nothing; then the profile a real 3.0.5 build left takes its place.
    browser = await launch(profileDir);
    assert.deepEqual((await replaceStorage(browser, master305.storage)).accounts, []);
    await browser.close();

    browser = await launch(profileDir);
    let page = await browser.openPopup();
    const route = () => browser.evaluate(page, 'location.hash');
    const shot = async (name) => {
      if (!screenshotDir) return;
      await sleep(900);
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' }, page);
      await fs.writeFile(path.join(screenshotDir, `${name}.png`), Buffer.from(data, 'base64'));
    };
    const click = (testId) =>
      browser.evaluate(
        page,
        `(document.querySelector('[data-testid="${testId}"] button') ?? document.querySelector('[data-testid="${testId}"]')).click(), true`
      );

    await eventually(async () => (await route()).includes('/unlock'), 'the unlock screen');
    const record = await eventually(() => storedRecord(browser, page), 'the record of the 3.0.5 wallets');
    assert.deepEqual(record.evidence, ['masterPassword', 'tonAccount']);
    assert.equal(record.accounts.length, 4);
    log('recorded the 3.0.5 wallets', record.accounts.map(({ name }) => name).join(', '));

    await browser.evaluate(page, 'document.querySelector("input").focus(), true');
    await browser.send('Input.insertText', { text: master305.provenance.masterPassword }, page);
    for (const type of ['keyDown', 'keyUp']) {
      await browser.send(
        'Input.dispatchKeyEvent',
        { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) },
        page
      );
    }
    await eventually(async () => (await route()).startsWith('#/security-notice?'), 'the notice after unlock');
    await shot('01-notice');

    // Unlock is when 4.2.0 would attach new networks; it must hold them back while the notice is open.
    await sleep(5_000);
    assert.deepEqual(await accountState(browser, page, master305.storage), { enrolled: 0, keysUnchanged: true });
    await browser.evaluate(page, 'location.hash = "#/fearless/settings", true');
    await eventually(async () => (await route()) === '#/security-notice?redirect=/fearless/settings', 'the notice again');
    log('notice shown after unlock; no network enrolled; every other screen leads back to it');

    await browser.evaluate(page, 'document.querySelector("[data-testid=securityNoticeConfirm] input").click(), true');
    await click('securityNoticeContinue');
    await eventually(async () => (await route()).startsWith('#/security-notice/guide'), 'the guide');
    await shot('02-guide');

    // The wallets get their networks one after the other, so wait for both before comparing.
    const enrolled = await eventually(async () => {
      const state = await accountState(browser, page, master305.storage);

      return state.enrolled >= 2 ? state : undefined;
    }, 'networks attached to both wallets after the confirmation');
    assert.deepEqual(enrolled, { enrolled: 2, keysUnchanged: true });
    assert.ok((await storedRecord(browser, page)).acknowledgedAt > 0);
    log('confirmed; networks attached afterwards; keys unchanged');

    await click('securityNoticeLater');
    await eventually(async () => (await route()) === '#/fearless/settings', 'the screen the user was opening');
    const banner = await eventually(
      () => browser.evaluate(page, 'document.querySelector("[data-testid=legacyExposureBanner]")?.innerText'),
      'the reminder'
    );
    assert.match(banner, /3 wallets from before this update may be exposed/u);
    await shot('03-reminder');

    await click('legacyExposureBannerDismiss');
    assert.equal(await browser.evaluate(page, '!!document.querySelector("[data-testid=legacyExposureBanner]")'), false);
    page = await browser.openPopup('#/fearless/settings');
    await eventually(() => browser.evaluate(page, '!!document.querySelector("[data-testid=settings-legacy-exposure]")'), 'Settings guide after reopening')
      .catch(async (error) => { throw new Error(`${error.message} Route: ${await route()}`); });
    assert.equal(await browser.evaluate(page, '!!document.querySelector("[data-testid=legacyExposureBanner]")'), false);
    await click('settings-legacy-exposure');
    await eventually(async () => (await route()).startsWith('#/security-notice/guide'), 'guide from Settings');
    log('dismissal survives reopening; the guide remains reachable from Settings');

    const generatedPhrase = await browser.message(page, 'pri(keyring.generateMnemonic)', { walletEcosystem: 'substrate', wordCount: 12 });
    const freshAddress = await browser.message(page, 'pri(accounts.create)', {
      suri: generatedPhrase, type: 'sr25519', walletEcosystem: 'substrate',
      meta: { name: 'Created after update' }, requireFreshGeneration: true,
    });
    await browser.evaluate(page, 'location.hash = "#/fearless/settings", true');
    await eventually(async () => (await route()) === '#/fearless/settings', 'fresh wallet Settings');
    await eventually(async () => {
      const status = await browser.message(page, 'pri(security.legacyExposure.status)');
      return status.newWallets.some(({ address }) => address === freshAddress);
    }, 'the generated wallet classified as new');
    assert.equal(await browser.evaluate(page, '!!document.querySelector("[data-testid=legacyExposureBanner]")'), false);
    await shot('04-created-wallet');

    // Public test phrase, used only in this isolated offline profile.
    const importedAddress = await browser.message(page, 'pri(accounts.create)', {
      suri: 'legal winner thank year wave sausage worth useful legal winner thank yellow',
      type: 'sr25519', walletEcosystem: 'substrate',
      meta: { name: 'Imported after update', walletSecurityGeneration: 1 },
    });
    await browser.evaluate(page, 'location.hash = "#/fearless/portfolio", true');
    const importedBanner = await eventually(
      () => browser.evaluate(page, 'document.querySelector("[data-testid=legacyExposureBanner]")?.innerText'),
      'the imported-wallet reminder'
    );
    assert.match(importedBanner, /imported key/u);
    const importedStatus = await browser.message(page, 'pri(security.legacyExposure.status)');
    assert.ok(importedStatus.importedWallets.some(({ address }) => address === importedAddress));
    assert.ok(!importedStatus.newWallets.some(({ address }) => address === importedAddress));
    await shot('05-imported-wallet');
    await browser.message(page, 'pri(accounts.update.current)', { address: freshAddress, walletEcosystem: 'substrate' });
    await eventually(() => browser.evaluate(page, '!document.querySelector("[data-testid=legacyExposureBanner]")'), 'no reminder when switching back to the generated wallet');
    log('created wallets stay quiet; imported keys are reminded and excluded as fresh destinations');

    // The integrated dashboard can show all holdings without changing the selected wallet.
    await eventually(() => browser.evaluate(page, '!!document.querySelector("[data-testid=portfolioDashboard]")'), 'the integrated portfolio dashboard');
    await click('walletNameHeader');
    await eventually(() => browser.evaluate(page, '!!document.querySelector("[data-testid=allWalletsRow]")'), 'the All wallets picker row');
    await click('allWalletsRow');
    await eventually(() => browser.evaluate(page, '!!document.querySelector("[data-testid=allWalletsPanel]")'), 'the All wallets view');
    assert.equal(await browser.evaluate(page, '!!document.querySelector("[data-testid=legacyExposureBanner]")'), false);
    await shot('06-all-wallets-fresh-selected');

    const pickWallet = async (name) => {
      await click('walletNameHeader');
      await eventually(() => browser.evaluate(page, '!!document.querySelector("[data-testid=walletContent]")'), 'the wallet picker');
      await browser.evaluate(page, `(() => {
        const row = [...document.querySelectorAll('[data-testid="walletContent"]')]
          .find((item) => item.querySelector('[data-testid="name"]')?.innerText.trim() === ${JSON.stringify(name)});
        if (!row) throw new Error('Expected wallet is absent from picker');
        row.querySelector('[data-testid="content"]').click();
        return true;
      })()`);
      await eventually(() => browser.evaluate(page, `document.querySelector('[data-testid="walletNameHeader"]')?.innerText.trim() === ${JSON.stringify(name)}`), 'the selected wallet header');
    };
    await pickWallet('Imported after update');
    await eventually(() => browser.evaluate(page, 'document.querySelector("[data-testid=legacyExposureBanner]")?.innerText.includes("imported key")'), 'the reminder after selecting the imported wallet');
    await pickWallet('Created after update');
    await eventually(() => browser.evaluate(page, '!document.querySelector("[data-testid=legacyExposureBanner]")'), 'no reminder after selecting the generated wallet');
    log('dashboard All wallets and the wallet picker preserve per-wallet reminder behavior');
    await browser.close();

    // A 2.6.3 profile nobody unlocked in 3.0.x holds nothing 3.0.x could have sent: no notice.
    browser = await launch(profileDir);
    await replaceStorage(browser, passwords263.storage);
    await browser.close();
    browser = await launch(profileDir);
    const quiet = await browser.openPopup();
    const quietRecord = await eventually(() => storedRecord(browser, quiet), 'the record of the 2.6.3 profile');
    assert.deepEqual({ evidence: quietRecord.evidence, accounts: quietRecord.accounts }, { evidence: [], accounts: [] });
    log('2.6.3 profile: nothing to tell');
  } finally {
    await browser?.close().catch(() => undefined);
    await fs.rm(profileDir, { force: true, recursive: true });
  }

  console.info('Legacy exposure extension smoke passed');
}

main().catch((error) => {
  console.error(`Legacy exposure extension smoke failed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
