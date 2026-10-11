// Scenarios S1-S8, R1 and the ECDSA cohorts (web-keys.md §6.3). Each starts a new profile, lets a released build write
// it through that build's own background messages (drivers.mjs), and replaces the build in place.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sleep, waitFor } from './chrome.mjs';
import { root } from './config.mjs';
import {
  checkColdStarts,
  checkCurrentAccount,
  checkDappSigning,
  checkExports,
  checkFirstStart,
  checkLandingRoute,
  checkStable,
  checkTonExports,
  checkTonTransfers,
  checkUnlock,
  unlockToWallet,
} from './checks.mjs';
import { legacyDriver, legacyJsonFile } from './drivers.mjs';
import { compareKeyRecords, keyEntries, typeInto, ui, WALLET_ROUTE } from './head.mjs';
import { PASSWORDS, PHRASES, RAW } from './secrets.mjs';
import { Session } from './session.mjs';
import { upgradeEcdsa } from './upgrade-ecdsa.mjs';
import { isAt305Cost, openAs305 } from './keyring-305.mjs';
import { signatureVerify } from '@polkadot/util-crypto';

const fixture = (name) => JSON.parse(readFileSync(path.join(root, 'tests/fixtures/upgrade', name), 'utf8'));

function session(ctx) {
  ctx.session = new Session({ workDir: ctx.workDir, port: ctx.port, manifestKey: ctx.manifestKey, hostRules: ctx.hostRules, args: ctx.args });
  return ctx.session;
}

// The WalletConnect client seed a build generates is a random secret of its own, not a wallet key; fixtures leave it out.
const OMITTED_KEYS = ['wc@2:core:0.3//keychain'];

/** 6.5: the profile a released build wrote, as a fixture for fast unit tests (tests/fixtures/upgrade/<version>/<state>.json). */
function writeSnapshot(ctx, { version, state, scenario, storage, profile }) {
  if (!ctx.snapshot) return;
  const provenance = ctx.provenance[version];
  const dir = path.join(root, 'tests/fixtures/upgrade', version);
  mkdirSync(dir, { recursive: true });
  const publicProfile = {
    master: profile.master,
    wallets: profile.wallets,
    standalone: profile.standalone ?? [],
    ton: profile.ton ?? [],
  };
  writeFileSync(
    path.join(dir, `${state}.json`),
    `${JSON.stringify(
      {
        provenance: {
          scenario,
          writtenBy: `Fearless Wallet ${version}, built from its own source and lockfile and driven in Chrome for Testing`,
          commit: provenance.commit,
          yarnLockSha256: provenance.yarnLockSha256,
          node: provenance.node,
          deviations: provenance.deviations,
          chrome: ctx.chromeVersion,
          harness: 'scripts/upgrade-e2e/run.mjs --snapshot',
          extensionId: 'plnlnnlkcnkiokjgpefakfhgngpbnaec (test key)',
          syntheticSecretsOnly: true,
          omittedKeys: OMITTED_KEYS.filter((key) => key in storage),
        },
        profile: publicProfile,
        storage: Object.fromEntries(Object.entries(storage).filter(([key]) => !OMITTED_KEYS.includes(key))),
      },
      null,
      2
    )}\n`
  );
}

/** A 2.6.3 Staking record (//staking of the all-zero phrase), as 2.6.3 stored it: a real polkadot-js JSON file. */
function staking263() {
  const s1 = fixture('s1-2.6.3-per-account-passwords.json');
  const wallet = s1.wallets.find(({ name }) => name === 'Staking');
  return {
    json: Object.values(s1.storage).find((value) => value?.address === wallet.address),
    password: 'legacy-pw-C',
    phrase: PHRASES.abandon12,
    path: '//staking',
  };
}

/** S3's profile: everything 3.0.5 can hold under one master password. Used by S3, S4 and R1. */
async function write305Fresh(ctx, legacy) {
  await legacy.createMasterPassword(PASSWORDS.master);
  const created = await legacy.generateMnemonic('substrate', 12);
  const wallets = [];
  wallets.push({ ...(await legacy.addMnemonicWallet({ name: 'Created in 3.0.5', phrase: created })), phraseStored: true });
  wallets.push({ ...(await legacy.addMnemonicWallet({ name: 'Imported 24 words', phrase: PHRASES.legalWinner24 })), phraseStored: true });
  wallets.push(await legacy.addRawSeedWallet({ name: 'Raw seed', seed: RAW.sr25519Seed, evmPrivateKey: RAW.evmPrivateKey }));
  const staking = staking263();
  const json = await legacy.restoreJsonWallet({ substrate: staking });
  // "Add Ethereum account" to the JSON wallet, which came without one.
  wallets.push({ ...(await legacy.addEthereumToWallet({ ...json, path: staking.path }, PHRASES.schemeSpot12)), path: staking.path });
  const tonPhrase = await legacy.generateMnemonic('ton', 24);
  const ton = [
    await legacy.addTonWallet({ name: 'TON created in 3.0.5', phrase: tonPhrase }),
    await legacy.addTonWallet({ name: 'TON from a BIP39 phrase', phrase: PHRASES.legalWinner12 }),
    await legacy.addTonWallet({ name: 'TON native import', phrase: PHRASES.nativeTon24 }),
  ];
  // The second wallet is the current account.
  await legacy.setCurrentAccount(wallets[1].address);
  return { master: PASSWORDS.master, wallets, ton, current: wallets[1].address };
}


/** S1's per-account profile (2.6.3 and earlier): every way such a build stored a key, each with its own password. */
async function writePerAccount(ctx, legacy, { withRawAndStandalone = true } = {}) {
  const wallets = [
    await legacy.addMnemonicWallet({ name: 'Alpha', phrase: PHRASES.legalWinner12, password: PASSWORDS.pwA }),
    await legacy.addMnemonicWallet({ name: 'Bravo', phrase: PHRASES.legalWinner24, password: PASSWORDS.pwB }),
    // Two JSON files with different passwords: the Substrate one and the Ethereum one.
    await legacy.restoreJsonWallet({
      substrate: legacyJsonFile(ctx.legacy, { phrase: PHRASES.schemeSpot12, name: 'Charlie', password: PASSWORDS.pwC1 }),
      ethereum: legacyJsonFile(ctx.legacy, { phrase: PHRASES.schemeSpot12, type: 'ethereum', name: 'Charlie', password: PASSWORDS.pwC2 }),
    }),
  ];
  const standalone = [];
  if (withRawAndStandalone) {
    wallets.push(await legacy.addRawSeedWallet({ name: 'Delta', seed: RAW.sr25519Seed, evmPrivateKey: RAW.evmPrivateKey, password: PASSWORDS.pwD }));
    const echo = legacyJsonFile(ctx.legacy, { phrase: PHRASES.letterAdvice12, type: 'ethereum', name: 'Echo', password: PASSWORDS.pwE });
    standalone.push(await legacy.restoreStandaloneEthereum({ json: echo.json, password: echo.password, phrase: echo.phrase, name: 'Echo' }));
  }
  return { wallets, standalone };
}

/** The checks every scenario runs once the wallet is open and every key is under the master password. */
async function checkSigningAndExports(ctx, r, s, popup, profile) {
  await checkUnlock(r, s, popup, profile.master);
  await checkDappSigning(r, ctx, s, popup, profile);
  await checkExports(r, popup, profile);
  await checkTonExports(r, popup, profile);
  await checkTonTransfers(r, ctx, s, popup, profile);
}

async function accessStatus(popup) {
  // TON phrases are checked in the background after unlock (`scanComplete`).
  return waitFor(async () => {
    const status = (await popup.call('pri(keyring.getAccessStatus)')).ok;
    return status?.scanComplete ? status : undefined;
  }, 30000, 'the account access scan');
}

const pendingAddresses = async (popup) => ((await popup.call('pri(keyring.getMigrationAccounts)')).ok ?? []).map(({ address }) => address);

/** The password row of one account, as the user selects it, types the password and confirms. */
async function migrateRowThroughUi(popup, label, password) {
  const row = `[...document.querySelectorAll("li.wallets__item")].find((li) => li.querySelector(".wallet__checkbox")?.textContent.trim() === ${JSON.stringify(label)})`;
  await popup.eval(`(() => { const row = ${row}; if (!row) throw new Error('no row ' + ${JSON.stringify(label)}); if (!row.querySelector('.json__controls') || row.querySelector('.json__controls').style.display === 'none') row.querySelector('.json__info').click(); return true; })()`);
  await sleep(500);
  await typeInto(popup, `${row}.querySelector(".json__controls input")`, password);
  await popup.eval(`${row}.querySelector(".button__confirm button").click(), true`);
}

/** The per-account password prompt for a profile with no master password: Start, create the master password, rows. */
async function startPromptThroughUi(r, popup, master) {
  const page = ui(popup);
  r.check('A1', '"Later" needs a master password first, so it is not offered yet', !(await page.exists('[data-testid="migrationLater"]')));
  await page.click('[data-testid="migrationStart"]');
  await page.waitHash('change-password');
  await page.type('[data-testid="enterPasswordInput"] input', master);
  await page.type('[data-testid="reEnterPasswordInput"] input', master);
  await page.clickButton('Confirm');
  const rows = await page.waitHash('migration-accounts', 'the password rows').then(() => true, () => false);
  r.check('A1', 'creating the master password leads to the password rows', rows, await page.hash());
}

/** S1/S7: a per-account profile through the prompt; `rows` lists [label, password, addresses that open] in order. */
async function migratePerAccountProfile(ctx, r, s, popup, profile, { rows, wrongFirst }) {
  const page = ui(popup);
  const pending = await popup.call('pri(keyring.getMigrationAccounts)');
  const expected = profile.wallets.flatMap(({ address, ethereumAddress }) => [address, ethereumAddress]).concat((profile.standalone ?? []).map(({ ethereumAddress }) => ethereumAddress)).filter(Boolean);
  r.check('A7', 'pri(keyring.getMigrationAccounts) over the popup port returns one plain row per waiting key',
    Array.isArray(pending.ok) && pending.ok.length === expected.length && pending.ok.every((row) => typeof row.address === 'string' && typeof row.name === 'string'), pending.err ?? pending.ok?.map(({ address }) => address));
  await startPromptThroughUi(r, popup, profile.master);
  const domRows = await waitFor(async () => {
    const count = await popup.eval('document.querySelectorAll("li.wallets__item").length');
    return count === expected.length ? count : undefined;
  }, 30000, 'one row per waiting key').catch(() => popup.eval('document.querySelectorAll("li.wallets__item").length'));
  r.check('A7', 'the password rows show one row per waiting key', domRows === expected.length, domRows);

  for (const [label, password, opens] of rows) {
    if (wrongFirst?.label === label) {
      const before = (await s.storage());
      await migrateRowThroughUi(popup, label, PASSWORDS.wrong);
      await sleep(4000);
      const after = await s.storage();
      r.check('A7', `${label}: a wrong password changes nothing`, (await pendingAddresses(popup)).includes(opens[0]) && compareKeyRecords(before, after).length === 0 &&
        JSON.stringify(keyEntries(before)) === JSON.stringify(keyEntries(after)));
    }
    await migrateRowThroughUi(popup, label, password);
    const opened = await waitFor(async () => {
      const left = await pendingAddresses(popup);
      return opens.every((address) => !left.includes(address)) ? left : undefined;
    }, 120000, `${label} to open`).catch(() => undefined);
    r.check('A7', `${label}: its own password moves ${opens.length === 1 ? 'it' : 'it and its Ethereum account'} under the master password`, !!opened);
  }
  return page;
}

/** S2/S4/S6: TON phrases a 3.0.x password change or reset left under an earlier master password (A8). */
async function recoverTonWithPreviousPassword(r, s, popup, { stale, previous, master }) {
  const status = await accessStatus(popup);
  const flagged = status.issues.filter(({ kind }) => kind === 'previous_master_password').map(({ address }) => address).sort();
  r.check('A8', 'Account access lists exactly the TON accounts still under an earlier master password', JSON.stringify(flagged) === JSON.stringify(stale.map(({ address }) => address).sort()), status.issues);
  for (const wallet of stale) {
    const exported = await popup.call('pri(keyring.export.mnemonic)', { address: wallet.address, password: master, walletEcosystem: 'ton' });
    r.check('A8', `${wallet.name}: export answers a recovery code, never an empty phrase`, !!exported.err && !exported.ok?.seed && exported.ok?.seed !== '', exported);
    const before = (await s.storage())[`fw:ton:${wallet.address}`]?.cipherSeed;
    const wrong = (await popup.call('pri(keyring.recoverAccountWithPassword)', { address: wallet.address, walletEcosystem: 'ton', password: PASSWORDS.wrong })).ok;
    r.check('A8', `${wallet.name}: a wrong earlier password is refused and nothing is written`, wrong?.ok === false && (await s.storage())[`fw:ton:${wallet.address}`]?.cipherSeed === before, wrong);
    const right = (await popup.call('pri(keyring.recoverAccountWithPassword)', { address: wallet.address, walletEcosystem: 'ton', password: previous })).ok;
    const after = (await s.storage())[`fw:ton:${wallet.address}`]?.cipherSeed;
    r.check('A8', `${wallet.name}: the earlier password re-encrypts the phrase under the current one`, right?.ok === true && after !== before, right);
  }
  const left = (await accessStatus(popup)).issues;
  r.check('A8', 'after recovery no account waits', left.length === 0, left);
}

/** A8: a password change in 4.2.0 keeps every TON phrase exportable. */
async function changePasswordInHead(r, popup, profile, newPassword) {
  const changed = (await popup.call('pri(keyring.changePassword)', { oldPassword: profile.master, newPassword })).ok;
  r.check('A8', 'the master password changes in 4.2.0', changed === true, changed);
  profile.master = newPassword;
  await checkTonExports(r, popup, profile);
}

function migratedTo(profile, master) {
  return { ...profile, master, wallets: profile.wallets.map((wallet) => ({ ...wallet, pending: false, ethereumPending: false })) };
}

async function runPerAccount(ctx, r, version, title) {
  const s = session(ctx);
  const legacy = legacyDriver(await s.startFresh(ctx.builds[version]), version);
  const written = await writePerAccount(ctx, legacy, { withRawAndStandalone: version !== '1.3.1' });
  const profile = { master: PASSWORDS.master, ...written };
  await sleep(2000);
  const before = await s.storage();
  writeSnapshot(ctx, { version, state: `${version === '2.6.3' ? 'S1' : 'S7'}-per-account-passwords`, scenario: title, storage: before, profile });

  await s.replaceWith(ctx.head);
  checkFirstStart(r, before, await s.storage());
  let popup = await s.popup();
  await checkLandingRoute(r, popup, 'migration-description');
  const [alpha, bravo, charlie, delta] = profile.wallets;
  const rows = [
    ['Alpha', PASSWORDS.pwA, [alpha.address, alpha.ethereumAddress]],
    ['Bravo', PASSWORDS.pwB, [bravo.address, bravo.ethereumAddress]],
    // Charlie's Ethereum file has its own password: the Substrate password opens Charlie only.
    ['Charlie', PASSWORDS.pwC1, [charlie.address]],
  ];
  let page = await migratePerAccountProfile(ctx, r, s, popup, profile, { rows, wrongFirst: { label: 'Bravo' } });
  const stillPending = await pendingAddresses(popup);
  r.check('A7', "Charlie's Ethereum account, under its own password, still waits", stillPending.includes(charlie.ethereumAddress), stillPending);

  // "More options" leads to Reset wallet (not executed).
  await page.click('[data-testid="moreOptions"]');
  await waitFor(() => page.exists('[data-testid="resetWalletLink"]'), 10000, 'the Reset wallet link');
  await page.click('[data-testid="resetWalletLink"]');
  r.check('A7', 'Reset wallet is reachable from the password rows', await page.waitHash('reset', 'the Reset wallet screen').then(() => true, () => false), await page.hash());
  await page.goto('#/migration-accounts');
  await page.waitHash('migration-accounts');

  // Skip for now: the wallet opens; what waits is untouched.
  const beforeSkip = await s.storage();
  await waitFor(() => page.exists('[data-testid="migrationSkip"]'), 15000, 'Skip for now');
  await page.click('[data-testid="migrationSkip"]');
  await waitFor(() => page.exists('[data-testid="acceptBtn"]'), 10000, 'the skip confirmation');
  await page.click('[data-testid="acceptBtn"]');
  r.check('A7', 'Skip for now opens the wallet', await page.waitHash(WALLET_ROUTE, 'the wallet').then(() => true, () => false), await page.hash());
  r.check('A7', 'the wallet shows the Account access reminder', await waitFor(() => page.exists('[data-testid="accountAccessBanner"]'), 15000, 'the banner').then(() => true, () => false));
  const afterSkip = await s.storage();
  r.check('A7', 'every waiting record is byte for byte what the released build wrote', stillPending.every((address) => {
    const find = (storage) => Object.entries(storage).find(([key, value]) => key.startsWith('fw:account:') && value?.address?.toLowerCase() === address.toLowerCase())?.[1];
    return JSON.stringify(find(afterSkip)) === JSON.stringify(find(before)) && JSON.stringify(find(beforeSkip)) === JSON.stringify(find(before));
  }));

  // A browser restart: Unlock leads to the wallet, not back to the prompt.
  await s.restart();
  popup = await s.popup();
  page = ui(popup);
  await unlockToWallet(r, popup, { master: profile.master, expectNotice: false });

  // The rest opens from its own row (message) or with its recovery phrase in Account access.
  const status = await accessStatus(popup);
  r.check('A7', 'Account access lists what still waits, as legacy passwords', status.issues.length === stillPending.length && status.issues.every(({ kind }) => kind === 'legacy_account_password'), status.issues);
  // Charlie's Ethereum account from its own password row, which stays reachable while keys wait.
  await page.goto('#/migration-accounts');
  await page.waitHash('migration-accounts', 'the password rows');
  await waitFor(() => popup.eval('document.querySelectorAll("li.wallets__item").length > 0'), 30000, 'the password rows');
  await migrateRowThroughUi(popup, 'Ethereum account of Charlie', PASSWORDS.pwC2);
  const ownRow = await waitFor(async () => !(await pendingAddresses(popup)).includes(charlie.ethereumAddress), 120000, "Charlie's Ethereum row").catch(() => false);
  r.check('A7', "Charlie's Ethereum account opens from its own row with its own password", ownRow);
  if (delta) {
    const opened = (await popup.call('pri(keyring.migrateMasterPassword)', { address: delta.address, password: PASSWORDS.pwD })).ok;
    r.check('A7', 'Delta (raw seed) and its Ethereum key open with their password', opened === true, opened);
    // Echo, whose password is forgotten, comes back in Settings → Account access with its recovery phrase.
    const [echo] = profile.standalone;
    await page.goto('#/fearless/settings/account-access');
    const row = `document.querySelector('[data-testid="accessRow"][data-address="${echo.ethereumAddress}"]')`;
    const shown = await waitFor(() => popup.eval(`!!${row}`), 30000, 'the Account access row of Echo').catch(() => false);
    if (shown) {
      await popup.eval(`${row}.querySelector('[data-testid="accessMode"]').click(), true`);
      await sleep(300);
      await typeInto(popup, `${row}.querySelector('[data-testid="accessSecret"] textarea, [data-testid="accessSecret"] input')`, echo.ethereumPhrase);
      await popup.eval(`(${row}.querySelector('[data-testid="accessUnlock"] button') ?? ${row}.querySelector('[data-testid="accessUnlock"]')).click(), true`);
    }
    const recovered = shown && (await waitFor(() => popup.eval(`!${row}`), 120000, 'the Echo row to go').catch(() => false));
    r.check('A7', 'Echo (an Ethereum file whose password is forgotten) opens in Account access with its recovery phrase', recovered);
  }
  const left = (await accessStatus(popup)).issues;
  r.check('A7', 'nothing waits any more', left.length === 0, left);

  const migrated = migratedTo(profile, profile.master);
  await checkSigningAndExports(ctx, r, s, popup, migrated);
  await checkStable(r, s, migrated.master);
  await checkColdStarts(r, s, ctx.coldStarts, { hasMasterPassword: true, keyringIsLocked: true });
}


const ROLLBACK_PAYLOAD = new TextEncoder().encode('Fearless 4.2.0 -> 3.0.6 rollback check');
const signsFor = (pair, address) => {
  try {
    return !!pair && signatureVerify(ROLLBACK_PAYLOAD, pair.sign(ROLLBACK_PAYLOAD), address).isValid;
  } catch {
    return false;
  }
};
const opened305 = (legacy, records, password, passwordHash) => {
  try {
    return { pairs: openAs305(legacy, records, password, passwordHash) };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
};

/**
 * R1 (critique T-8, WK-10): what 4.2.0 writes, a rollback to the clean 3.0.6 (hotfix/3.0.6, never a 3.0.5 build) still
 * opens; and rolling forward again loses nothing. 4.2.0 writes in every way it encrypts a key: legacy TON recovery,
 * new wallets, a JSON import, a master password change, and a deleted wallet set aside.
 */
async function runRollback(ctx, r) {
  const s = session(ctx);
  let legacy = legacyDriver(await s.startFresh(ctx.builds['3.0.5']), '3.0.5');
  const profile = await write305Fresh(ctx, legacy);
  profile.wallets.push({ ...(await legacy.addMnemonicWallet({ name: 'ECDSA signer', phrase: PHRASES.legalWinner12, type: 'ecdsa' })), phraseStored: true });
  await legacy.changeMasterPassword(PASSWORDS.master, PASSWORDS.changedIn305);
  const stale = [...profile.ton];
  profile.ton.push(await legacy.addTonWallet({ name: 'TON after the change', phrase: PHRASES.letterAdvice12 }));
  profile.master = PASSWORDS.changedIn305;
  await sleep(2000);
  const before = await s.storage();

  // 4.2.0: everything that writes a key.
  await s.replaceWith(ctx.head);
  checkFirstStart(r, before, await s.storage());
  let popup = await s.popup();
  await unlockToWallet(r, popup, { master: profile.master, expectNotice: true });
  await recoverTonWithPreviousPassword(r, s, popup, { stale, previous: PASSWORDS.master, master: profile.master });
  const head = legacyDriver(popup, '4.2.0');
  profile.wallets.push({ ...(await head.addMnemonicWallet({ name: 'Made in 4.2.0', phrase: PHRASES.letterAdvice12 })), phraseStored: true });
  profile.wallets.push(
    await head.restoreJsonWallet({
      substrate: legacyJsonFile(ctx.legacy, { phrase: PHRASES.schemeSpot12, path: '//json', name: 'JSON import in 4.2.0', password: PASSWORDS.pwC1 }),
      ethereum: undefined,
    })
  );
  profile.wallets.at(-1).path = '//json';
  const tonPhrase = await head.generateMnemonic('ton', 24);
  profile.ton.push(await head.addTonWallet({ name: 'TON created in 4.2.0', phrase: tonPhrase }));
  await changePasswordInHead(r, popup, profile, PASSWORDS.changedInHead);
  // A JSON file 4.2.0 exports is a file 3.0.x can import (N = 2^15).
  const exported = (await popup.call('pri(accounts.export.json)', { address: profile.wallets[0].address, password: PASSWORDS.changedInHead })).ok?.json;
  const fromFile = exported && opened305(ctx.legacy, [exported], PASSWORDS.changedInHead).pairs?.[0];
  r.check('A11', 'the 3.0.5 keyring opens a JSON file 4.2.0 exported, with its password, and it signs', !!exported && isAt305Cost(exported) && signsFor(fromFile, profile.wallets[0].address));
  // Delete a wallet after the change: its keys are set aside under fw:deletedWallet:, as stored.
  const deleted = profile.wallets.find(({ name }) => name === 'Raw seed');
  const forgot = (await popup.call('pri(accounts.forget)', { address: deleted.address, type: 'native' })).ok;
  r.check('A11', '4.2.0 deletes the Raw seed wallet and sets its keys aside', forgot === true, forgot);
  const kept = profile.wallets.filter((wallet) => wallet !== deleted);
  await sleep(4000);
  const written = await s.storage();
  await s.stop();

  // Outside the browser: the 3.0.5 keyring opens every key 4.2.0 stored, and every key it set aside.
  const records = Object.entries(written).filter(([key, value]) => key.startsWith('fw:account:') && value?.encoded).map(([, value]) => value);
  const legacyTypes = ['sr25519', 'ed25519', 'ecdsa', 'ethereum'];
  r.check('A11', 'every key 4.2.0 stored is encrypted at N = 2^15, p = 1, r = 8', records.every(isAt305Cost));
  const live = opened305(ctx.legacy, records.filter((json) => legacyTypes.includes(json.encoding.content[1])), PASSWORDS.changedInHead, written['fw:keyring']?.passwordHash);
  r.check('A11', 'the 3.0.5 keyring unlocks with the 4.2.0 password (fw:keyring) and every stored key signs for its account',
    !!live.pairs?.length && live.pairs.every((pair) => signsFor(pair, pair.address)), live.error);
  const archives = Object.entries(written).filter(([key]) => key.startsWith('fw:deletedWallet:'));
  const archived = archives.flatMap(([, value]) => Object.values(value.accounts ?? {}));
  const archiveOpened = opened305(ctx.legacy, archived, PASSWORDS.changedInHead);
  const deletedAddresses = [deleted.address, deleted.ethereumAddress].map((address) => address.toLowerCase());
  r.check('A11', 'the deleted wallet is set aside once, and the 3.0.5 keyring opens its keys with the password they were stored under, at N = 2^15',
    archives.length === 1 && archived.every(isAt305Cost) && archiveOpened.pairs?.length === 2 &&
      archiveOpened.pairs.every((pair) => signsFor(pair, pair.address) && deletedAddresses.includes(pair.address.toLowerCase())), archiveOpened.error ?? archives.map(([key]) => key));

  // The rollback: hotfix 3.0.6 replaces 4.2.0 under the same extension id.
  await s.replaceWith(ctx.builds['3.0.6']);
  popup = await s.popup();
  legacy = legacyDriver(popup, '3.0.6');
  r.check('A11', '3.0.6 unlocks with the master password set in 4.2.0', (await popup.call('pri(keyring.unlock)', { password: PASSWORDS.changedInHead })).ok === true);
  const listed = (await popup.call('pri(accounts.subscribe)')).ok ?? [];
  const isListed = (address) => listed.some((entry) => [entry.address, entry.ethereumAddress].some((known) => known?.toLowerCase() === address.toLowerCase()));
  for (const wallet of kept) {
    for (const address of [wallet.address, wallet.ethereumAddress].filter(Boolean)) {
      const json = (await popup.call('pri(accounts.export.json)', { address, password: PASSWORDS.changedInHead })).ok?.json;
      const pair = json && opened305(ctx.legacy, [json], PASSWORDS.changedInHead).pairs?.[0];
      r.check('A11', `3.0.6 lists ${wallet.name} ${address} and exports its key, which signs for it`, isListed(address) && signsFor(pair, address));
    }
    if (wallet.phraseStored) {
      const seed = (await popup.call('pri(keyring.export.mnemonic)', { address: wallet.address, password: PASSWORDS.changedInHead, walletEcosystem: 'substrate' })).ok?.seed;
      r.check('A11', `3.0.6 exports the recovery phrase of ${wallet.name}`, seed === wallet.phrase, seed ? 'different phrase' : 'none');
    }
  }
  for (const wallet of profile.ton) {
    const seed = (await popup.call('pri(keyring.export.mnemonic)', { address: wallet.address, password: PASSWORDS.changedInHead, walletEcosystem: 'ton' })).ok?.seed;
    r.check('A11', `3.0.6 lists ${wallet.name} and exports its TON phrase`, isListed(wallet.address) && seed === wallet.phrase);
  }
  r.check('A11', '3.0.6 does not list the deleted wallet', !isListed(deleted.address));
  // The set-aside records are ordinary key files to 3.0.6: imported with their password, the wallet signs again.
  const archive = archives[0][1];
  const archivedRecord = (address) => Object.values(archive.accounts).find((json) => json.address.toLowerCase() === address.toLowerCase());
  const restored = await legacy.restoreJsonWallet({
    substrate: { json: { ...archivedRecord(deleted.address), meta: { name: deleted.name } }, password: PASSWORDS.changedInHead },
    ethereum: { json: archivedRecord(deleted.ethereumAddress), password: PASSWORDS.changedInHead },
  });
  const restoredJson = (await popup.call('pri(accounts.export.json)', { address: deleted.address, password: PASSWORDS.changedInHead })).ok?.json;
  r.check('A11', "3.0.6 imports the deleted wallet's set-aside keys as JSON files and the wallet signs",
    restored.address === deleted.address && signsFor(restoredJson && opened305(ctx.legacy, [restoredJson], PASSWORDS.changedInHead).pairs?.[0], deleted.address));
  await s.stop();

  // Roll forward: 4.2.0 holds each wallet once and everything still opens.
  await s.replaceWith(ctx.head);
  popup = await s.popup();
  r.check('A11', '4.2.0 again: unlocks with the master password', (await popup.call('pri(keyring.unlock)', { password: PASSWORDS.changedInHead })).ok === true);
  const relisted = (await popup.call('pri(accounts.subscribe)')).ok ?? [];
  const all = [...kept, deleted];
  r.check('A11', '4.2.0 again: each wallet, the one 3.0.6 re-imported included, is listed once',
    all.every(({ address }) => relisted.filter((entry) => entry.address === address).length === 1), relisted.map(({ address, name }) => ({ address, name })));
  const deletedList = (await popup.call('pri(accounts.deleted.list)')).ok ?? [];
  const entry = deletedList.find(({ address }) => address === deleted.address);
  const restoreAgain = entry && (await popup.call('pri(accounts.deleted.restore)', { id: entry.id })).ok;
  r.check('A11', '4.2.0 again: Account access still holds the set-aside copy and does not add the wallet twice',
    !!entry && (restoreAgain?.ok === true || restoreAgain?.code === 'already_in_wallet'), { deletedList, restoreAgain });
  const forward = { ...profile, wallets: all };
  await checkSigningAndExports(ctx, r, s, popup, forward);
}

export const SCENARIOS = [
  {
    id: 'S1',
    title: '2.6.3 per-account passwords (created, 24 words, two JSON files, raw seed, standalone Ethereum JSON) → 4.2.0',
    builds: ['2.6.3'],
    run(ctx, r) {
      return runPerAccount(ctx, r, '2.6.3', this.title);
    },
  },
  {
    id: 'S2',
    title: '2.6.3 → 3.0.5 (master password, partial migration, TON) → 4.2.0',
    builds: ['2.6.3', '3.0.5'],
    async run(ctx, r) {
      const s = session(ctx);
      let legacy = legacyDriver(await s.startFresh(ctx.builds['2.6.3']), '2.6.3');
      const { wallets } = await writePerAccount(ctx, legacy, { withRawAndStandalone: false });
      await s.replaceWith(ctx.builds['3.0.5']);
      legacy = legacyDriver(await s.popup(), '3.0.5');
      await legacy.createMasterPassword(PASSWORDS.master);
      const [alpha, bravo, charlie] = wallets;
      r.check('S2', '3.0.5 migrates Alpha and Bravo with their own passwords', (await legacy.migrate(alpha.address, PASSWORDS.pwA)) === true && (await legacy.migrate(bravo.address, PASSWORDS.pwB)) === true);
      const partial = await legacy.migrate(charlie.address, PASSWORDS.pwC1);
      r.check('S2', "3.0.5 migrates Charlie and fails on its Ethereum account (3.0.5's partial migration)", partial === false);
      const ton = [
        await legacy.addTonWallet({ name: 'TON native import', phrase: PHRASES.nativeTon24 }),
        await legacy.addTonWallet({ name: 'TON from a BIP39 phrase', phrase: PHRASES.letterAdvice12 }),
      ];
      await sleep(2000);
      const before = await s.storage();
      const profile = { master: PASSWORDS.master, wallets: wallets.map((wallet) => ({ ...wallet, ethereumPending: wallet === charlie })), ton };
      writeSnapshot(ctx, { version: '3.0.5', state: 'S2-from-2.6.3-partial-migration', scenario: this.title, storage: before, profile });

      await s.replaceWith(ctx.head);
      checkFirstStart(r, before, await s.storage());
      const popup = await s.popup();
      // Only an Ethereum account waits: no prompt, the user unlocks as usual.
      await checkLandingRoute(r, popup, 'unlock');
      await unlockToWallet(r, popup, { master: profile.master, expectNotice: true });
      r.check('A7', 'the waiting Ethereum account does not force the password prompt', !/migration/.test(await popup.eval('location.hash')));
      const status = await accessStatus(popup);
      r.check('A7', "Account access lists Charlie's Ethereum account only", status.issues.length === 1 && status.issues[0].address.toLowerCase() === charlie.ethereumAddress.toLowerCase(), status.issues);
      const opened = (await popup.call('pri(keyring.migrateMasterPassword)', { address: charlie.ethereumAddress, password: PASSWORDS.pwC2 })).ok;
      r.check('A7', "Charlie's Ethereum account opens with its own password", opened === true, opened);
      const migrated = migratedTo(profile, profile.master);
      await checkSigningAndExports(ctx, r, s, popup, migrated);
      await checkStable(r, s, migrated.master);
      await checkColdStarts(r, s, Math.min(ctx.coldStarts, 5), { hasMasterPassword: true, keyringIsLocked: true });
    },
  },
  {
    id: 'S3',
    title: '3.0.5 fresh profile (master password, every wallet kind, three TON wallets) → 4.2.0',
    builds: ['3.0.5'],
    async run(ctx, r) {
      const s = session(ctx);
      const legacy = legacyDriver(await s.startFresh(ctx.builds['3.0.5']), '3.0.5');
      const profile = await write305Fresh(ctx, legacy);
      await sleep(2000);
      const before = await s.storage();
      writeSnapshot(ctx, { version: '3.0.5', state: 'S3-master-password', scenario: this.title, storage: before, profile });

      await s.replaceWith(ctx.head);
      checkFirstStart(r, before, await s.storage());
      const popup = await s.popup();
      await checkLandingRoute(r, popup, 'unlock');
      await unlockToWallet(r, popup, { master: profile.master, expectNotice: true });
      await checkCurrentAccount(r, s, profile, profile.current);
      await checkSigningAndExports(ctx, r, s, popup, profile);
      await checkStable(r, s, profile.master);
      await checkColdStarts(r, s, ctx.coldStarts, { hasMasterPassword: true, keyringIsLocked: true });
    },
  },
  {
    id: 'S4',
    title: 'S3 + master password changed in 3.0.5, then one more TON wallet (mixed TON state) → 4.2.0',
    builds: ['3.0.5'],
    async run(ctx, r) {
      const s = session(ctx);
      const legacy = legacyDriver(await s.startFresh(ctx.builds['3.0.5']), '3.0.5');
      const profile = await write305Fresh(ctx, legacy);
      await legacy.changeMasterPassword(PASSWORDS.master, PASSWORDS.changedIn305);
      const stale = [...profile.ton];
      profile.ton.push(await legacy.addTonWallet({ name: 'TON after the change', phrase: PHRASES.letterAdvice12 }));
      profile.master = PASSWORDS.changedIn305;
      await sleep(2000);
      const before = await s.storage();
      writeSnapshot(ctx, { version: '3.0.5', state: 'S4-password-changed-mixed-ton', scenario: this.title, storage: before, profile });

      await s.replaceWith(ctx.head);
      checkFirstStart(r, before, await s.storage());
      const popup = await s.popup();
      await checkLandingRoute(r, popup, 'unlock');
      await unlockToWallet(r, popup, { master: profile.master, expectNotice: true });
      await recoverTonWithPreviousPassword(r, s, popup, { stale, previous: PASSWORDS.master, master: profile.master });
      await checkSigningAndExports(ctx, r, s, popup, profile);
      await changePasswordInHead(r, popup, profile, PASSWORDS.changedInHead);
      await checkStable(r, s, profile.master);
      await checkColdStarts(r, s, Math.min(ctx.coldStarts, 5), { hasMasterPassword: true, keyringIsLocked: true });
    },
  },
  {
    id: 'S5',
    title: '2.7.1, the first master-password release → 4.2.0',
    builds: ['2.7.1'],
    async run(ctx, r) {
      const s = session(ctx);
      const legacy = legacyDriver(await s.startFresh(ctx.builds['2.7.1']), '2.7.1');
      await legacy.createMasterPassword(PASSWORDS.master);
      const wallets = [
        { ...(await legacy.addMnemonicWallet({ name: 'Created in 2.7.1', phrase: PHRASES.legalWinner12 })), phraseStored: true },
        { ...(await legacy.addMnemonicWallet({ name: 'Imported 24 words', phrase: PHRASES.legalWinner24 })), phraseStored: true },
        await legacy.addRawSeedWallet({ name: 'Raw seed', seed: RAW.sr25519Seed, evmPrivateKey: RAW.evmPrivateKey }),
      ];
      const profile = { master: PASSWORDS.master, wallets };
      await sleep(2000);
      const before = await s.storage();
      writeSnapshot(ctx, { version: '2.7.1', state: 'S5-master-password', scenario: this.title, storage: before, profile });

      await s.replaceWith(ctx.head);
      checkFirstStart(r, before, await s.storage());
      const popup = await s.popup();
      await checkLandingRoute(r, popup, 'unlock');
      // A master password is the trace every 3.0.x profile has, so 2.7.1 profiles see the notice too (WK-9).
      await unlockToWallet(r, popup, { master: profile.master, expectNotice: true });
      await checkSigningAndExports(ctx, r, s, popup, profile);
      await checkStable(r, s, profile.master);
      await checkColdStarts(r, s, Math.min(ctx.coldStarts, 5), { hasMasterPassword: true, keyringIsLocked: true });
    },
  },
  {
    id: 'S6',
    title: '3.0.5 with TON wallets, Reset wallet, a new password and a new wallet (orphan TON phrases) → 4.2.0',
    builds: ['3.0.5'],
    async run(ctx, r) {
      const s = session(ctx);
      const legacy = legacyDriver(await s.startFresh(ctx.builds['3.0.5']), '3.0.5');
      await legacy.createMasterPassword(PASSWORDS.master);
      await legacy.addMnemonicWallet({ name: 'Before the reset', phrase: PHRASES.legalWinner12 });
      const ton = [
        await legacy.addTonWallet({ name: 'TON native import', phrase: PHRASES.nativeTon24 }),
        await legacy.addTonWallet({ name: 'TON from a BIP39 phrase', phrase: PHRASES.letterAdvice12 }),
      ];
      await legacy.resetWallet();
      await legacy.createMasterPassword(PASSWORDS.afterReset);
      const wallets = [{ ...(await legacy.addMnemonicWallet({ name: 'After the reset', phrase: PHRASES.schemeSpot12 })), phraseStored: true }];
      const profile = { master: PASSWORDS.afterReset, wallets, ton };
      await sleep(2000);
      const before = await s.storage();
      r.check('S6', '3.0.5 Reset wallet left the TON phrases in storage (E15)', ton.every(({ address }) => !!before[`fw:ton:${address}`]));
      writeSnapshot(ctx, { version: '3.0.5', state: 'S6-reset-orphan-ton', scenario: this.title, storage: before, profile });

      await s.replaceWith(ctx.head);
      checkFirstStart(r, before, await s.storage());
      const popup = await s.popup();
      await checkLandingRoute(r, popup, 'unlock');
      await unlockToWallet(r, popup, { master: profile.master, expectNotice: true });
      await recoverTonWithPreviousPassword(r, s, popup, { stale: ton, previous: PASSWORDS.master, master: profile.master });
      await checkSigningAndExports(ctx, r, s, popup, profile);
      await changePasswordInHead(r, popup, profile, PASSWORDS.changedInHead);
      await checkStable(r, s, profile.master);
      await checkColdStarts(r, s, Math.min(ctx.coldStarts, 5), { hasMasterPassword: true, keyringIsLocked: true });
    },
  },
  {
    id: 'S7',
    title: '1.3.1 per-account passwords (service worker built from the 1.3.1 lockfile, UI kit stubbed) → 4.2.0',
    builds: ['1.3.1'],
    run(ctx, r) {
      return runPerAccount(ctx, r, '1.3.1', this.title);
    },
  },
  {
    id: 'S7b',
    title: '2.0.1 per-account passwords → 4.2.0',
    builds: ['2.0.1'],
    run(ctx, r) {
      return runPerAccount(ctx, r, '2.0.1', this.title);
    },
  },
  {
    id: 'S8',
    title: '3.0.5 with a standalone Ethereum account first in storage and no current account → 4.2.0',
    builds: ['3.0.5'],
    async run(ctx, r) {
      const s = session(ctx);
      const legacy = legacyDriver(await s.startFresh(ctx.builds['3.0.5']), '3.0.5');
      await legacy.createMasterPassword(PASSWORDS.master);
      const echo = legacyJsonFile(ctx.legacy, { phrase: PHRASES.letterAdvice12, type: 'ethereum', name: 'Echo', password: PASSWORDS.pwE });
      const standalone = [await legacy.restoreStandaloneEthereum({ json: echo.json, password: echo.password, phrase: echo.phrase, name: 'Echo' })];
      const wallets = [{ ...(await legacy.addMnemonicWallet({ name: 'Main', phrase: PHRASES.legalWinner12 })), phraseStored: true }];
      await sleep(1000);
      // No current account: a profile whose stored selection was lost (test edit of the 3.0.5 profile, nothing else).
      await s.inWorker("chrome.storage.local.remove('fwcurrent_account:CurrentAccountInfo').then(() => true)");
      await sleep(1000);
      const before = await s.storage();
      r.check('S8', 'the profile has no current account', !before['fwcurrent_account:CurrentAccountInfo']);
      const profile = { master: PASSWORDS.master, wallets, standalone };
      writeSnapshot(ctx, { version: '3.0.5', state: 'S8-standalone-ethereum-no-current', scenario: this.title, storage: before, profile });

      await s.replaceWith(ctx.head);
      checkFirstStart(r, before, await s.storage());
      const popup = await s.popup();
      await checkLandingRoute(r, popup, 'unlock');
      await unlockToWallet(r, popup, { master: profile.master, expectNotice: true });
      await checkCurrentAccount(r, s, profile, wallets[0].address);
      const status = await accessStatus(popup);
      // 3.0.5 kept the restored Ethereum file under the file's own password.
      for (const { address } of status.issues) {
        const opened = (await popup.call('pri(keyring.migrateMasterPassword)', { address, password: PASSWORDS.pwE })).ok;
        r.check('A7', `the Ethereum file ${address} that still waits opens with its own password`, opened === true, opened);
      }
      await checkSigningAndExports(ctx, r, s, popup, profile);
      await checkStable(r, s, profile.master);
      await checkColdStarts(r, s, ctx.coldStarts, { hasMasterPassword: true, keyringIsLocked: true });
    },
  },
  {
    id: 'R1',
    title: 'Rollback: 3.0.5 profile → 4.2.0 (TON recovery, new wallets, JSON import, password change, deletion) → hotfix 3.0.6 → 4.2.0',
    builds: ['3.0.5', '3.0.6'],
    run: runRollback,
  },
  ...['2.6.3', '3.0.6'].map((version) => ({
    id: `ECDSA-${version}`,
    title: `ECDSA Substrate accounts written by ${version} (two record keys, WK-8) → 4.2.0 and across restarts`,
    builds: [version],
    async run(ctx, r) {
      await upgradeEcdsa({
        version,
        oldBuild: ctx.builds[version],
        newBuild: ctx.head,
        workDir: ctx.workDir,
        port: ctx.port,
        check: (name, ok, details) => r.check('WK-8', name, ok, details),
      });
    },
  })),
];
