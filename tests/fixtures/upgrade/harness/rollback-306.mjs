// A rollback rehearsal with the real builds (WK-10, test-matrix U12): the 3.0.6 build (the 3.0.5 keyring code) writes
// a profile, 4.2.0 replaces it and re-encrypts every key (a new wallet, a TON wallet, a JSON import, a JSON export, a
// master password change), then 3.0.6 replaces 4.2.0 again under the same extension id and must unlock, list and
// export every key and TON phrase 4.2.0 wrote. Finally 4.2.0 comes back and still holds each account once. Between the builds, every
// stored key is also opened outside the browser with the 3.0.5 keyring from the Yarn cache (keyring-305.mjs).
// Public test phrases only; every host name is unresolvable. Exits non-zero on the first failed check.
// Usage: node rollback-306.mjs <3.0.6 build dir> <4.2.0 build dir> <work dir> [port]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, signatureVerify } from '@polkadot/util-crypto';
import { ECDSA_WALLETS, MASTER_306, captureEcdsa } from './capture-ecdsa.mjs';
import { dumpStorage, installBuild, launch, openPopup, reloadExtension, serviceWorker, sleep, stop } from './cdp.mjs';
import { M2 } from './capture-263.mjs';
import { installKeyring305, isAt305Cost, loadKeyring305, openAs305, scryptParamsOf } from './keyring-305.mjs';

const [, , oldBuild, newBuild, workDir, port = '9501'] = process.argv;
const NEW_MASTER = 'Master password changed in 4.2.0';
// BIP39 test vector; a wallet only 4.2.0 creates.
const M3 = 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above';
const EVM_PATH = "/m/44'/60'/0'/0/0";
// The keys 3.0.x's keyring knows. 4.2.0 also adds Bitcoin, Solana and other keys, which 3.0.x skips when it loads.
const LEGACY_TYPES = ['sr25519', 'ed25519', 'ecdsa', 'ethereum'];
const extDir = join(workDir, 'extension');
const profileDir = join(workDir, 'profile');
const report = { checks: [] };
const payload = new TextEncoder().encode('Fearless 4.2.0 -> 3.0.6 rollback check');
const staking = JSON.parse(readFileSync(fileURLToPath(new URL('../s1-2.6.3-per-account-passwords.json', import.meta.url)), 'utf8'));

// KEEP_GOING=1 records a failed check and goes on, to see everything a build gets wrong.
function check(name, ok, details) {
  report.checks.push({ name, ok: !!ok, ...(details === undefined ? {} : { details }) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
  if (!ok && process.env.KEEP_GOING !== '1') throw new Error(`check failed: ${name}`);
}

// The value fn returns, or what it threw: a key that does not open is a failed check, not the end of the run.
function attempt(fn) {
  try {
    return { value: fn() };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}
const signsFor = (pair, account) => !!pair && signatureVerify(payload, pair.sign(payload), account).isValid;

const keyRecords = (storage) => Object.entries(storage).filter(([key, value]) => key.startsWith('fw:account:') && value?.encoded);
const accountsOf = async (popup) =>
  ((await popup.call('pri(accounts.subscribe)')).ok ?? []).map(({ address, ethereumAddress, name }) => ({ address, ethereumAddress, name }));

async function startBuild(build, extId, manifestKey) {
  const version = installBuild(build, extDir, manifestKey);
  const chrome = launch({ profileDir, extDir, port });
  const sw = await serviceWorker(port);
  const id = new URL(sw.url).host;
  check(`${version}: same extension id (and with it chrome.storage.local)`, !extId || id === extId, id);
  const reload = await reloadExtension(port, id);
  check(`Chrome runs the ${version} build`, reload.reload === 'ok' && reload.version === version, reload);
  return { chrome, popup: await openPopup(port, id), extId: id, version };
}

mkdirSync(workDir, { recursive: true });
let chrome;
let tonPopup;
try {
  await cryptoWaitReady();
  const legacyDir = installKeyring305(join(workDir, 'keyring-3.0.5'));
  const legacy = await loadKeyring305(legacyDir);
  report.legacyKeyring = legacy.versions;
  const checker = new Keyring({ type: 'sr25519' });

  // 1. 3.0.6 writes the profile: Signer and Spare (ECDSA + Ethereum) and Daily (sr25519), under its master password.
  const before = await captureEcdsa({ version: '3.0.6', oldBuild, extDir, profileDir, port });
  const manifestKey = JSON.parse(readFileSync(join(oldBuild, 'manifest.json'), 'utf8')).key;
  const wallets = before.wallets.map((wallet) => ({ ...ECDSA_WALLETS['3.0.6'].find(({ name }) => name === wallet.name), ...wallet }));
  report.from = { version: before.manifestVersion, wallets };
  check('3.0.6 wrote every key at N = 2^15', keyRecords(before.storage).every(([, json]) => isAt305Cost(json)));

  // TON phrases are not keyring keys: 3.0.x keeps them AES-encrypted with the master password in fw:ton:<address>.
  // 3.0.6 imports one, so that 4.2.0's master password change re-encrypts a phrase 3.0.6 wrote.
  ({ chrome, popup: tonPopup } = await (async () => {
    const browser = launch({ profileDir, extDir, port });
    const sw = await serviceWorker(port);
    return { chrome: browser, popup: await openPopup(port, new URL(sw.url).host) };
  })());
  check('3.0.6 unlocks to add a TON wallet', (await tonPopup.call('pri(keyring.unlock)', { password: MASTER_306 })).ok === true);
  const ton306 = await tonPopup.call('pri(accounts.create)', { suri: M2, meta: { name: 'Toncoin' }, walletEcosystem: 'ton' });
  check('3.0.6 imports a TON wallet', !!ton306.ok, ton306);
  tonPopup.close();
  await stop(chrome);
  const tonWallets = [{ name: 'Toncoin', address: ton306.ok, phrase: M2 }];

  // 2. The update to 4.2.0, and every way 4.2.0 encrypts a key.
  let popup;
  let extId;
  ({ chrome, popup, extId } = await startBuild(newBuild, before.extId, manifestKey));
  check('4.2.0 unlocks with the 3.0.6 master password', (await popup.call('pri(keyring.unlock)', { password: MASTER_306 })).ok === true);

  const meta = { name: 'Made in 4.2.0', ethereumAddress: '', walletEcosystem: 'substrate' };
  const evm = await popup.call('pri(accounts.create)', { suri: `${M3}${EVM_PATH}`, type: 'ethereum', meta, walletEcosystem: 'substrate' });
  const made = await popup.call('pri(accounts.create)', { suri: M3, type: 'sr25519', meta: { ...meta, ethereumAddress: evm.ok }, walletEcosystem: 'substrate' });
  check('4.2.0 creates a wallet', !!evm.ok && !!made.ok, { evm, made });
  const created = { name: meta.name, type: 'sr25519', address: made.ok, ethereumAddress: evm.ok, substrateSuri: M3 };
  const ton420 = await popup.call('pri(accounts.create)', { suri: M3, meta: { name: 'TON made in 4.2.0' }, walletEcosystem: 'ton' });
  check('4.2.0 creates a TON wallet', !!ton420.ok, ton420);
  tonWallets.push({ name: 'TON made in 4.2.0', address: ton420.ok, phrase: M3 });

  // A polkadot-js JSON file written by 2.6.3 (Staking, //staking from the first test phrase), imported with its password.
  const stakingWallet = staking.wallets.find(({ name }) => name === 'Staking');
  const stakingFile = Object.values(staking.storage).find((value) => value?.address === stakingWallet.address);
  const restored = await popup.call('pri(accounts.json.restore)', { file: structuredClone(stakingFile), password: stakingWallet.password });
  check('4.2.0 imports a JSON file 2.6.3 wrote', restored.ok === stakingWallet.address, restored);

  const daily = wallets.find(({ name }) => name === 'Daily');
  const exported = (await popup.call('pri(accounts.export.json)', { address: daily.address, password: MASTER_306 })).ok?.json;
  check('4.2.0 exports Daily as JSON at N = 2^15', !!exported && isAt305Cost(exported), exported && scryptParamsOf(exported));
  const fromFile = attempt(() => openAs305(legacy, [exported], MASTER_306)[0]);
  check('3.0.5 keyring opens the 4.2.0 JSON export with its password and signs as Daily',
    fromFile.value?.address === daily.address && signsFor(fromFile.value, daily.address), fromFile.error);

  check('4.2.0 changes the master password', (await popup.call('pri(keyring.changePassword)', { oldPassword: MASTER_306, newPassword: NEW_MASTER })).ok === true);
  // Network enrollment for upgraded wallets runs after unlock and after a password change.
  await sleep(5000);
  popup.close();
  const storage = await dumpStorage(port);
  await stop(chrome);

  // 3. Outside the browser: every key 4.2.0 stored, at 3.0.x's cost and open in the 3.0.5 keyring.
  const records = keyRecords(storage);
  report.records = records.map(([key, json]) => ({ key, type: json.encoding?.content?.[1], scrypt: scryptParamsOf(json) }));
  check('every key 4.2.0 stored is encrypted at N = 2^15, p = 1, r = 8', records.every(([, json]) => isAt305Cost(json)), report.records);
  const legacyRecords = records.filter(([, json]) => LEGACY_TYPES.includes(json.encoding.content[1])).map(([, json]) => json);
  const opened = legacyRecords.map((json) => ({
    json,
    ...attempt(() => openAs305(legacy, [json], NEW_MASTER, storage['fw:keyring']?.passwordHash)[0]),
  }));
  check('the 3.0.5 keyring unlocks with the new master password (fw:keyring) and opens each of those keys',
    opened.every(({ value }) => signsFor(value, value?.address)),
    opened.map(({ json, value, error }) => ({ account: value?.address ?? json.address, type: json.encoding.content[1], ...(error && { error }) })));
  const expectedAccounts = [...wallets, created, { name: 'Staking', address: stakingWallet.address, ethereumAddress: '' }];
  check('…among them every wallet the profile and 4.2.0 hold',
    expectedAccounts.every(({ address, ethereumAddress }) => [address, ethereumAddress].filter(Boolean).every((account) =>
      opened.some(({ value }) => value?.address.toLowerCase() === account.toLowerCase())
    )));

  // 4. The rollback: the 3.0.6 build replaces 4.2.0 under the same extension id.
  ({ chrome, popup } = await startBuild(oldBuild, extId, manifestKey));
  check('3.0.6 unlocks with the master password set in 4.2.0', (await popup.call('pri(keyring.unlock)', { password: NEW_MASTER })).ok === true);
  const listed = await accountsOf(popup);
  report.listedAfterRollback = listed;
  for (const { name, address, ethereumAddress, substrateSuri } of expectedAccounts) {
    for (const account of [address, ethereumAddress].filter(Boolean)) {
      const json = (await popup.call('pri(accounts.export.json)', { address: account, password: NEW_MASTER })).ok?.json;
      const pair = json && attempt(() => {
        const restoredPair = checker.createFromJson(json);
        restoredPair.decodePkcs8(NEW_MASTER);
        return restoredPair;
      }).value;
      // 3.0.x lists an Ethereum account with the Substrate account that names it.
      const isListed = listed.some((entry) => [entry.address, entry.ethereumAddress].some((known) => known?.toLowerCase() === account.toLowerCase()));
      check(`3.0.6 lists ${name} ${account} and exports its key, which signs for it`, isListed && signsFor(pair, account));
    }
    // Shown only where the phrase was stored with the key; "abandon ... about" has all-zero entropy (no phrase in 3.0.x).
    if (substrateSuri && !substrateSuri.startsWith('abandon')) {
      const phrase = substrateSuri.split('//')[0];
      const seed = (await popup.call('pri(keyring.export.mnemonic)', { address, password: NEW_MASTER, walletEcosystem: 'substrate' })).ok?.seed;
      check(`3.0.6 exports the recovery phrase of ${name}`, seed === phrase);
    }
  }
  for (const { name, address, phrase } of tonWallets) {
    const seed = (await popup.call('pri(keyring.export.mnemonic)', { address, password: NEW_MASTER, walletEcosystem: 'ton' })).ok?.seed;
    check(`3.0.6 lists ${name} and exports its TON phrase`, listed.some((entry) => entry.address === address) && seed === phrase);
  }
  popup.close();
  await stop(chrome);

  // 5. Roll forward again: 4.2.0 holds each account once and opens it with the master password.
  ({ chrome, popup } = await startBuild(newBuild, extId, manifestKey));
  check('4.2.0 again: unlocks with the master password', (await popup.call('pri(keyring.unlock)', { password: NEW_MASTER })).ok === true);
  const relisted = await accountsOf(popup);
  report.listedAfterRollForward = relisted;
  check('4.2.0 again: each wallet is listed once', expectedAccounts.every(({ address }) => relisted.filter((entry) => entry.address === address).length === 1), relisted);
  const seed = (await popup.call('pri(keyring.export.mnemonic)', { address: created.address, password: NEW_MASTER, walletEcosystem: 'substrate' })).ok?.seed;
  check('4.2.0 again: exports the phrase of the wallet it created', seed === M3);
  for (const { name, address, phrase } of tonWallets) {
    const tonSeed = (await popup.call('pri(keyring.export.mnemonic)', { address, password: NEW_MASTER, walletEcosystem: 'ton' })).ok?.seed;
    check(`4.2.0 again: exports the TON phrase of ${name}`, tonSeed === phrase);
  }
  popup.close();

  report.ok = report.checks.every(({ ok }) => ok);
  if (!report.ok) process.exitCode = 1;
  rmSync(legacyDir, { recursive: true, force: true });
} catch (error) {
  report.ok = false;
  report.error = String(error?.stack ?? error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await stop(chrome);
  writeFileSync(join(workDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
