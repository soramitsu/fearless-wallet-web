// Exercise the shipped Substrate provider with a disposable wallet/profile. No signing or transfers.
// node scripts/polkaswap-extension-smoke.mjs [--extension dist/extension/chrome] [--live]
// --live additionally loads polkaswap.io; the default regression is local and delays the phishing reply.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import {
  cdp, devtools, freePort, installBuild, launch, openPopup, serviceWorker, stop, waitFor,
} from './upgrade-e2e/chrome.mjs';
import { testExtensionKey } from './upgrade-e2e/config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionOption = process.argv.indexOf('--extension');
const extensionDir = path.resolve(root, extensionOption < 0 ? 'dist/extension/chrome' : process.argv[extensionOption + 1]);
const live = process.argv.includes('--live');
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-polkaswap-'));
const reportDir = path.join(root, 'output/polkaswap-connection', new Date().toISOString().replace(/[:.]/g, '-'));
const report = { extensionDir, live, checks: [], startedAt: new Date().toISOString() };
const server = http.createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Polkaswap connection regression</title><h1>Disposable dapp</h1>');
});
const port = await freePort();
const extDir = path.join(workDir, 'extension');
let chrome;
const clients = [];
const check = (name, details) => {
  report.checks.push({ name, ...details });
  console.info(`[polkaswap-smoke] PASS ${name}`);
};

async function openDapp(url, delayMs = 0) {
  const target = await (await devtools(port, '/json/new?about:blank', { method: 'PUT' })).json();
  const page = cdp(target.webSocketDebuggerUrl, { timeoutMs: 30000 });
  clients.push(page);
  await page.ready;
  await page.send('Page.enable');
  // Delay a genuine phishing reply at the page transport boundary. The extension bundle,
  // permission store, approval handler and account enumeration remain unmodified.
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    window.__connectionMessages = [];
    window.__delayedPhishingReplies = [];
    const phishing = new Set();
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (data?.origin === 'fw-fearless-page') {
        window.__connectionMessages.push(data.message);
        if (data.message === 'pub(phishing.redirectIfDenied)') phishing.add(data.id);
      }
      if (data?.origin === 'fw-fearless-content' && phishing.delete(data.id) && ${delayMs} > 0) {
        event.stopImmediatePropagation();
        const timing = { receivedAt: performance.now() };
        window.__delayedPhishingReplies.push(timing);
        setTimeout(() => {
          timing.deliveredAt = performance.now();
          window.dispatchEvent(new MessageEvent('message', { data, source: window, origin: location.origin }));
        }, ${delayMs});
      }
    }, true);
  })()` });
  await page.send('Page.navigate', { url });
  try {
    await waitFor(() => page.eval("!!window.injectedWeb3?.['fearless-wallet']"), 30000, 'Substrate injection');
  } catch (error) {
    report.pageFailure = await page.eval('({ url: location.href, text: document.body?.innerText.slice(0, 1000), scripts: [...document.scripts].map(s => s.src) })');
    throw error;
  }
  return page;
}

async function startConnect(page, count = 1) {
  await page.eval(`(() => {
    window.__connectionResult = null;
    Promise.all(Array.from({ length: ${count} }, () => window.injectedWeb3['fearless-wallet'].enable('Polkaswap')))
      .then(async (providers) => {
        window.__connectedProvider = providers[0];
        window.__connectionResult = { accounts: await providers[0].accounts.get(), count: providers.length };
      }).catch((error) => { window.__connectionResult = { error: error.message }; });
    return true;
  })()`);
}

async function result(page) {
  return waitFor(() => page.eval('window.__connectionResult'), 30000, 'connection result');
}

async function assertStartupDelay(page) {
  const replies = await page.eval('window.__delayedPhishingReplies');
  assert.equal(replies.length, 1, 'Expected one delayed phishing readiness reply');
  const delayMs = replies[0].deliveredAt - replies[0].receivedAt;
  assert(delayMs >= 4400, `Expected a 4.5-second readiness delay; measured ${delayMs} ms`);
  return { observedReadinessDelayMs: Math.round(delayMs) };
}

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const dappUrl = `http://localhost:${server.address().port}`;
  report.version = installBuild(extensionDir, extDir, testExtensionKey());
  report.provenance = JSON.parse(await fs.readFile(path.join(extensionDir, 'extension-build-metadata.json'), 'utf8'));
  chrome = launch({
    profileDir: path.join(workDir, 'profile'), extDir, port,
    // The live check uses the actual site. All accounts exist only in this throwaway profile.
    hostRules: live ? ['EXCLUDE *'] : [],
  });
  await waitFor(async () => (await devtools(port, '/json/version')).ok, 30000, 'Chrome');
  const sw = await serviceWorker(port);
  const extId = new URL(sw.url).hostname;
  const popup = await openPopup(port, extId);
  clients.push(popup);
  const call = async (message, request) => {
    const value = await popup.call(message, request);
    assert(!value.err, `${message}: ${value.err}`);
    return value.ok;
  };
  await call('pri(app.isReady)');
  await call('pri(keyring.changePassword)', { oldPassword: '', newPassword: 'disposable-polkaswap-test' });
  const mnemonic = await call('pri(keyring.generateMnemonic)', { walletEcosystem: 'substrate', wordCount: 24 });
  const address = await call('pri(accounts.create)', {
    suri: mnemonic, type: 'sr25519', walletEcosystem: 'substrate',
    meta: { name: 'Polkaswap disposable test' }, requireFreshGeneration: true,
  });
  await popup.eval(`(() => {
    window.__authRequests = [];
    window.__p.onMessage.addListener((data) => {
      if (data.id === 'polkaswap-auth-subscription' && Array.isArray(data.subscription))
        window.__authRequests = data.subscription;
    });
    window.__p.postMessage({ id: 'polkaswap-auth-subscription', message: 'pri(authorize.requests)', request: null });
    return true;
  })()`);
  const approve = async (page, authorizedAccounts = [address]) => {
    const request = await waitFor(async () => {
      const failure = await page.eval('window.__connectionResult?.error');
      if (failure) throw new Error(failure);
      return popup.eval('window.__authRequests[0]');
    }, 15000, 'authorization popup');
    await call('pri(authorize.approve)', { id: request.id, authorizedAccounts });
  };
  const assertConnected = (value, expectedAccounts = [address]) => {
    assert(!value.error, value.error);
    assert.deepEqual(value.accounts.map((account) => account.address).sort(), [...expectedAccounts].sort());
  };

  const delayed = await openDapp(dappUrl, 4500);
  await startConnect(delayed, 2);
  await approve(delayed);
  assertConnected(await result(delayed));
  assert.equal(await delayed.eval("window.__connectionMessages.filter((m) => m === 'pub(authorize.tab)').length"), 1);
  check('Fresh connection survives a 4.5-second startup reply and concurrent enable calls', await assertStartupDelay(delayed));

  const reconnect = await openDapp(dappUrl, 4500);
  await startConnect(reconnect);
  assertConnected(await result(reconnect));
  assert.equal((await popup.eval('window.__authRequests')).length, 0);
  const grants = await call('pri(authorize.list)');
  assert.equal(grants.list[dappUrl].isAllowed, true);
  check('Saved allowed permission reconnects after delayed startup without another approval', await assertStartupDelay(reconnect));

  await call('pri(authorize.remove)', dappUrl);
  await assert.rejects(() => reconnect.eval('window.__connectedProvider.accounts.get()'), /has not been enabled/);
  await startConnect(reconnect);
  await approve(reconnect);
  assertConnected(await result(reconnect));
  check('Revocation blocks account access and reconnect requires a fresh approval');

  // Reproduce the real popup failure: an old/imported wallet is selected while
  // a fresh wallet is available. Exercise the rendered Approve button, not the
  // privileged approval message used by the provider-only checks above.
  await call('pri(onboarding.setComplete)');
  const recoveryAddress = await call('pri(accounts.create)', {
    suri: 'legal winner thank year wave sausage worth useful legal winner thank yellow',
    type: 'sr25519', walletEcosystem: 'substrate', meta: { name: 'Imported Polkaswap test' },
  });
  const exposure = await call('pri(security.legacyExposure.status)');
  assert(exposure.importedWallets.some((account) => account.address === recoveryAddress),
    'The imported fixture must retain its recovery-only classification');
  assert(!exposure.newWallets.some((account) => account.address === recoveryAddress),
    'The fixture must not be classified as a newly generated wallet');
  await call('pri(security.legacyExposure.acknowledge)');
  await call('pri(accounts.update.current)', { address: recoveryAddress, walletEcosystem: 'substrate' });
  await call('pri(authorize.remove)', dappUrl);
  const mixedWalletPage = await openDapp(dappUrl);
  await startConnect(mixedWalletPage);
  await waitFor(() => popup.eval('window.__authRequests[0]'), 15000, 'mixed-wallet approval request');
  const approvalPopup = await openPopup(port, extId);
  clients.push(approvalPopup);
  await waitFor(() => approvalPopup.eval(`location.hash === '#/authorize' &&
    !!document.querySelector('[data-testid="approveAuthorization"] button:not(:disabled)')`),
  15000, 'visible mixed-wallet Approve button');
  const offeredAccounts = await approvalPopup.eval(`Array.from(document.querySelectorAll('.auth-account'))
    .map((row) => ({ text: row.innerText, checked: row.querySelector('input[type="checkbox"]')?.checked }))`);
  assert.equal(offeredAccounts.length, 2, 'Fresh and imported wallets should both be offered');
  assert(offeredAccounts.some(({ text }) => text.includes('Polkaswap disposable test')));
  assert(offeredAccounts.some(({ text }) => text.includes('Imported Polkaswap test')));
  assert(offeredAccounts.every(({ checked }) => checked));
  await approvalPopup.eval(`(() => {
    const fresh = [...document.querySelectorAll('.auth-account')]
      .find((row) => row.innerText.includes('Polkaswap disposable test'));
    fresh.querySelector('input[type="checkbox"]').click();
    return true;
  })()`);
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, 'mixed-wallet-approval.png'),
    Buffer.from((await approvalPopup.send('Page.captureScreenshot')).result.data, 'base64'));
  await approvalPopup.eval(`document.querySelector('[data-testid="approveAuthorization"] button').click(), true`);
  assertConnected(await result(mixedWalletPage), [recoveryAddress]);
  check('Real approval popup connects an imported recovery-only wallet while it is selected', {
    eligibleAccountsShown: offeredAccounts.length, recoveryOnlyAccountOffered: true,
  });
  const importedReconnect = await openDapp(dappUrl, 4500);
  await startConnect(importedReconnect);
  assertConnected(await result(importedReconnect), [recoveryAddress]);
  assert.equal((await popup.eval('window.__authRequests')).length, 0);
  check('Saved imported-wallet permission reconnects without another approval', await assertStartupDelay(importedReconnect));
  await call('pri(authorize.update)', { url: dappUrl, authType: 'substrate', authorizedAccounts: [address] });
  assertConnected(await importedReconnect.eval('window.__connectedProvider.accounts.get().then(accounts => ({ accounts }))'));
  await call('pri(authorize.update)', { url: dappUrl, authType: 'substrate', authorizedAccounts: [address, recoveryAddress] });
  assertConnected(await importedReconnect.eval('window.__connectedProvider.accounts.get().then(accounts => ({ accounts }))'), [address, recoveryAddress]);
  await call('pri(authorize.remove)', dappUrl);
  await assert.rejects(() => importedReconnect.eval('window.__connectedProvider.accounts.get()'), /has not been enabled/);
  check('Manage dapps adds imported accounts and revocation removes their access');

  if (live) {
    const page = await openDapp('https://polkaswap.io/');
    await startConnect(page);
    await approve(page, [recoveryAddress]);
    assertConnected(await result(page), [recoveryAddress]);
    await startConnect(page);
    assertConnected(await result(page), [recoveryAddress]);
    assert.equal((await popup.eval('window.__authRequests')).length, 0);
    check('Live polkaswap.io origin: imported-wallet connection and saved-permission reconnect');
    await waitFor(() => page.eval("!!document.querySelector('.disclaimer__acknowledgement input[type=checkbox]')"), 30000, 'Polkaswap disclaimer');
    await page.eval("document.querySelector('.disclaimer__acknowledgement input[type=checkbox]').click(), true");
    await waitFor(() => page.eval("!!document.querySelector('.disclaimer__accept-btn:not(:disabled)')"), 10000, 'disclaimer acceptance');
    await page.eval("document.querySelector('.disclaimer__accept-btn').click(), true");
    await waitFor(() => page.eval("!document.querySelector('.disclaimer__acknowledgement')"), 10000, 'dismissed disclaimer');
    await page.eval(`(() => {
      const connect = [...document.querySelectorAll('button')].find((button) => button.textContent.trim().toUpperCase() === 'CONNECT ACCOUNT');
      if (!connect) throw new Error('Polkaswap connect button missing');
      connect.click(); return true;
    })()`);
    await waitFor(() => page.eval("!!document.querySelector('.wallet-provider-list .account-card')"), 15000, 'Polkaswap wallet selection');
    await page.eval(`(() => {
      const wallet = [...document.querySelectorAll('.wallet-provider-list .account-card')]
        .find((card) => card.querySelector('.extension-name')?.textContent.includes('Fearless Wallet'));
      if (!wallet) throw new Error('Fearless Wallet absent from Polkaswap');
      wallet.querySelector('.account').click(); return true;
    })()`);
    await waitFor(() => page.eval("!!document.querySelector('.connection__accounts .account-card')"), 15000, 'Polkaswap account selection');
    report.liveAccountSelection = await page.eval("document.querySelector('.connection__accounts').innerText");
    assert(report.liveAccountSelection.includes('Imported Polkaswap test'));
    check('Polkaswap wallet selector enumerates the imported Fearless account without Access denied');
    await page.eval(`(() => {
      const account = [...document.querySelectorAll('.connection__accounts .account-card')]
        .find((card) => card.querySelector('.account-credentials_name')?.textContent.includes('Imported Polkaswap test'));
      if (!account) throw new Error('Authorized account absent from Polkaswap');
      account.querySelector('.account').click(); return true;
    })()`);
    await waitFor(() => page.eval("document.querySelector('.account-control.s-pressed .account-control-title.name')?.textContent.includes('Imported Polkaswap test')"), 30000, 'Polkaswap connected account');
    check('Polkaswap displays the imported Fearless account as connected');
    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(path.join(reportDir, 'polkaswap.png'), Buffer.from((await page.send('Page.captureScreenshot')).result.data, 'base64'));
    report.livePage = await page.eval('({ title: document.title, url: location.href, text: document.body.innerText.slice(0, 2500) })');
  }
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const client of clients) client.close();
  if (chrome) await stop(chrome);
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.info(`[polkaswap-smoke] Report: ${path.join(reportDir, 'report.json')}`);
}
