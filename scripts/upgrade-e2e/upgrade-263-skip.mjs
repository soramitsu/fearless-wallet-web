// A real in-place upgrade of a Fearless Wallet 2.6.3 per-account-password profile to a 4.2.0 build, driven through
// the popup the way a user who forgot one account password goes through it:
//   1. the real 2.6.3 build creates three wallets, each with its own password (capture-263.mjs);
//   2. the 4.2.0 build replaces it under the same extension id, so chrome.storage.local carries over;
//   3. in the popup: Start, create the master password, unlock "Savings" with its old password, Skip for now;
//   4. the wallet opens; the skipped records are still in storage byte for byte;
//   5. the browser restarts: Unlock leads to the wallet, not back to the prompt, and the password rows stay reachable;
//   6. Account access unlocks the forgotten wallet (and its Ethereum account) with its recovery phrase.
// Public test phrases only; every host name is unresolvable. Exits non-zero on the first failed check.
// Usage: node upgrade-263-skip.mjs <2.6.3 build dir> <4.2.0 build dir> <work dir> [port]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Keyring } from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { M2, WALLETS, capture263 } from './capture-263.mjs';
import { dumpStorage, installBuild, launch, openPopup, reloadExtension, serviceWorker, sleep, stop, waitFor } from './chrome.mjs';

const [, , oldBuild, newBuild, workDir, port = '9471'] = process.argv;
const MASTER = 'Master password created during the upgrade';
const extDir = join(workDir, 'extension');
const profileDir = join(workDir, 'profile');
const report = { checks: [] };

function check(name, ok, details) {
  report.checks.push({ name, ok: !!ok, ...(details === undefined ? {} : { details }) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
  if (!ok) throw new Error(`check failed: ${name}`);
}

// UI helpers evaluated in the popup page.
const ui = (page) => ({
  hash: () => page.eval('location.hash'),
  waitHash: (pattern, label) =>
    waitFor(async () => new RegExp(pattern).test(await page.eval('location.hash')), 30000, label ?? pattern),
  exists: (selector) => page.eval(`!!document.querySelector(${JSON.stringify(selector)})`),
  text: (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? null`),
  // FButton puts data-testid on its wrapper; the handler sits on the button inside.
  click: (selector) =>
    page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('no ' + ${JSON.stringify(selector)});
      (el.matches('button, a, input') ? el : el.querySelector('button') ?? el).click(); return true; })()`),
  clickButton: (label) =>
    page.eval(`(() => { const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled); if (!el) throw new Error('no enabled button ' + ${JSON.stringify(label)}); el.click(); return true; })()`),
  type: (selector, value) => typeInto(page, `document.querySelector(${JSON.stringify(selector)})`, value),
});

// Types into the element the expression finds, through the browser's own input pipeline (a synthetic input event
// does not reach every field's v-model).
async function typeInto(page, elementExpression, value) {
  await page.eval(`(() => { const el = ${elementExpression}; if (!el) throw new Error('nothing to type into'); el.focus(); el.select?.(); return true; })()`);
  await page.send('Input.insertText', { text: value });
  await sleep(300);
}

const accountRecords = (storage) =>
  Object.fromEntries(Object.entries(storage).filter(([key]) => key.startsWith('fw:account:')));
const recordOf = (records, address) =>
  Object.values(records).find((json) => json.address?.toLowerCase() === address.toLowerCase()) ??
  records[`fw:account:${address.toLowerCase()}`];

mkdirSync(workDir, { recursive: true });
const manifestKey = JSON.parse(readFileSync(join(oldBuild, 'manifest.json'), 'utf8')).key;
let chrome;
try {
  // 1. The 2.6.3 build writes the profile.
  const before = await capture263({ oldBuild, extDir, profileDir, port });
  const [savings, forgotten, staking] = before.wallets;
  const shipped = accountRecords(before.storage);
  report.from = { version: before.manifestVersion, extId: before.extId, wallets: before.wallets };
  // 2.6.3 predates the master password: it has no message for it and stores no keyring hash.
  check(
    '2.6.3 wrote five keys on three passwords and no master password',
    Object.keys(shipped).length === 5 &&
      Object.values(shipped).every(({ meta }) => !meta.isMasterPassword) &&
      !Object.keys(before.storage).some((key) => key.startsWith('fw:keyring'))
  );

  // 2. The update: same extension id, new code.
  report.to = { version: installBuild(newBuild, extDir, manifestKey) };
  chrome = launch({ profileDir, extDir, port });
  const sw = await serviceWorker(port);
  const extId = new URL(sw.url).host;
  check('the update keeps the extension id (and with it chrome.storage.local)', extId === before.extId, extId);
  report.reload = await reloadExtension(port, extId);
  check('Chrome runs the 4.2.0 build', report.reload.reload === 'ok' && report.reload.version === report.to.version, report.reload);

  // 3. The prompt.
  let popup = await openPopup(port, extId);
  let page = ui(popup);
  await page.waitHash('migration-description', 'the per-account password prompt');
  check('the popup opens on the prompt', true, await page.hash());
  check('"Later" needs a master password first, so it is not offered yet', !(await page.exists('[data-testid="migrationLater"]')));
  await page.click('[data-testid="migrationStart"]');
  await page.waitHash('change-password');
  await page.type('[data-testid="enterPasswordInput"] input', MASTER);
  await page.type('[data-testid="reEnterPasswordInput"] input', MASTER);
  await page.clickButton('Confirm');
  await page.waitHash('migration-accounts', 'the password rows');
  check('creating the master password leads to the password rows', true);

  await waitFor(() => popup.eval('document.querySelectorAll("li.wallets__item").length === 5'), 30000, 'five rows');
  const rowLabels = await popup.eval('[...document.querySelectorAll("li.wallets__item .json__info")].map((el) => el.textContent.replace(/\\s+/g, " ").trim())');
  check('one row per key, the Ethereum accounts named after their wallet', rowLabels.filter((label) => label.startsWith('Ethereum account of ')).length === 2, rowLabels);

  // The remembered password: select the "Savings" row, type its 2.6.3 password, Confirm.
  const savingsRow = `[...document.querySelectorAll("li.wallets__item")].find((li) => li.querySelector(".json__info .wallet__checkbox")?.textContent.trim() === "Savings")`;
  await popup.eval(`${savingsRow}.querySelector(".json__info").click()`);
  await sleep(500);
  await typeInto(popup, `${savingsRow}.querySelector(".json__controls input")`, 'legacy-pw-A');
  await popup.eval(`${savingsRow}.querySelector(".button__confirm button").click()`);
  await waitFor(
    async () => {
      const pending = (await popup.call('pri(keyring.getMigrationAccounts)')).ok ?? [];
      return pending.length === 3;
    },
    120000,
    'Savings and its Ethereum account to open with the master password'
  );
  const pendingAfterSavings = (await popup.call('pri(keyring.getMigrationAccounts)')).ok.map(({ address }) => address);
  check(
    'the remembered password opened the account and its Ethereum account; the other three still wait',
    [forgotten.address, forgotten.ethereumAddress, staking.address].every((address) => pendingAfterSavings.includes(address)),
    pendingAfterSavings
  );
  check('Continue stays disabled while accounts wait', await popup.eval('document.querySelector(\'[data-testid="migrationContinue"] button\').disabled'));

  // Skip for now.
  await page.click('[data-testid="migrationSkip"]');
  await waitFor(() => page.exists('[data-testid="acceptBtn"]'), 10000, 'the skip confirmation');
  report.skipConfirmation = await page.text('[data-testid="notificationSubtext"]');
  await page.click('[data-testid="acceptBtn"]');
  await page.waitHash('^#/fearless/', 'the wallet');
  check('Skip for now opens the wallet', true, await page.hash());
  await waitFor(() => page.exists('[data-testid="accountAccessBanner"]'), 15000, 'the Account access reminder');
  report.banner = await page.text('[data-testid="accountAccessBanner"]');
  check('the wallet reminds that accounts wait, without blocking', true, report.banner);

  // 4. Storage after the skip.
  let status = (await popup.call('pri(keyring.getAccessStatus)')).ok;
  check('the prompt is deferred, not pending', status.deferred === true && status.promptPending === false && status.hasMasterPassword === true);
  check('the three skipped keys are listed in Account access', status.issues.length === 3 && status.issues.every(({ kind }) => kind === 'legacy_account_password'), status.issues.map(({ address }) => address));
  let after = accountRecords(await dumpStorage(port));
  check('no account record was added or removed', Object.keys(after).sort().join() === Object.keys(shipped).sort().join(), Object.keys(after));
  for (const address of [forgotten.address, forgotten.ethereumAddress, staking.address]) {
    check(`the skipped record of ${address} is byte for byte what 2.6.3 wrote`, JSON.stringify(recordOf(after, address)) === JSON.stringify(recordOf(shipped, address)));
  }
  for (const address of [savings.address, savings.ethereumAddress]) {
    const record = recordOf(after, address);
    check(`${address} is now stored under the master password, same address and creation time`, record.meta.isMasterPassword === true && record.address === recordOf(shipped, address).address && record.meta.whenCreated === recordOf(shipped, address).meta.whenCreated);
  }
  report.migratedRecords = { savings: recordOf(after, savings.address), savingsEthereum: recordOf(after, savings.ethereumAddress) };
  popup.close();

  // 5. A browser restart (and with it a new service worker).
  await stop(chrome);
  chrome = launch({ profileDir, extDir, port });
  await serviceWorker(port);
  popup = await openPopup(port, extId);
  page = ui(popup);
  await page.waitHash('unlock', 'the unlock screen');
  await page.type('.pass-block input', MASTER);
  await page.click('.unlock-btn');
  await page.waitHash('^#/fearless/', 'the wallet after unlock');
  check('after a restart, Unlock opens the wallet, not the prompt', true, await page.hash());
  status = (await popup.call('pri(keyring.getAccessStatus)')).ok;
  check('the skip survived the restart', status.deferred === true && status.promptPending === false && status.issues.length === 3);
  await popup.eval('location.hash = "#/migration-accounts"');
  await sleep(1500);
  check('the password rows stay reachable while accounts wait', /migration-accounts/.test(await page.hash()), await page.hash());

  // 6. Account access: the forgotten wallet comes back with its recovery phrase.
  await popup.eval('location.hash = "#/fearless/settings/account-access"');
  await waitFor(() => popup.eval('document.querySelectorAll(\'[data-testid="accessRow"]\').length === 3'), 30000, 'three Account access rows');
  for (const address of [forgotten.address, forgotten.ethereumAddress]) {
    const row = `document.querySelector('[data-testid="accessRow"][data-address="${address}"]')`;
    await popup.eval(`${row}.querySelector('[data-testid="accessMode"]').click()`);
    await sleep(300);
    await typeInto(popup, `${row}.querySelector('[data-testid="accessSecret"] textarea, [data-testid="accessSecret"] input')`, M2);
    await popup.eval(`(${row}.querySelector('[data-testid="accessUnlock"] button') ?? ${row}.querySelector('[data-testid="accessUnlock"]')).click()`);
    await waitFor(() => popup.eval(`!${row}`), 120000, `the ${address} row to go`);
  }
  status = (await popup.call('pri(keyring.getAccessStatus)')).ok;
  check('the recovery phrase unlocked the forgotten account and its Ethereum account; only the derived one waits', status.issues.length === 1 && status.issues[0].address === staking.address, status.issues.map(({ address }) => address));
  after = accountRecords(await dumpStorage(port));
  for (const address of [forgotten.address, forgotten.ethereumAddress]) {
    check(`${address} is now stored under the master password at the same address`, recordOf(after, address).meta.isMasterPassword === true && recordOf(after, address).address === recordOf(shipped, address).address);
  }
  check('the derived account is still exactly what 2.6.3 wrote', JSON.stringify(recordOf(after, staking.address)) === JSON.stringify(recordOf(shipped, staking.address)));
  report.recoveredRecords = { forgotten: recordOf(after, forgotten.address), forgottenEthereum: recordOf(after, forgotten.ethereumAddress) };

  // 7. Outside the browser: every record 4.2.0 wrote opens with the master password and holds the key the 2.6.3
  // phrase derives, so it signs for the same address.
  await cryptoWaitReady();
  const payload = new TextEncoder().encode('Fearless 2.6.3 -> 4.2.0 upgrade check');
  for (const [{ substrateSuri, ethereumSuri }, { address, ethereumAddress }] of [
    [WALLETS[0], savings],
    [WALLETS[1], forgotten],
  ]) {
    for (const [suri, expected, type] of [
      [substrateSuri, address, 'sr25519'],
      [ethereumSuri, ethereumAddress, 'ethereum'],
    ]) {
      const record = recordOf(after, expected);
      const pair = new Keyring({ type }).addFromJson(record);
      pair.decodePkcs8(MASTER);
      const derived = new Keyring({ type }).addFromUri(suri);
      check(
        `${expected} opens with the master password and signs with the key its 2.6.3 phrase derives`,
        pair.address === expected && u8aToHex(pair.publicKey) === u8aToHex(derived.publicKey) && derived.verify(payload, pair.sign(payload), derived.publicKey),
        { scryptN: new DataView(Buffer.from(record.encoded, 'base64').buffer, Buffer.from(record.encoded, 'base64').byteOffset + 32, 4).getUint32(0, true) }
      );
    }
  }
  report.ok = true;
  popup.close();
} catch (error) {
  report.ok = false;
  report.error = String(error?.stack ?? error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await stop(chrome);
  writeFileSync(join(workDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
