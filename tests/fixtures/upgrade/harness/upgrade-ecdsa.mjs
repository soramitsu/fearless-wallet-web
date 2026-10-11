// A real in-place upgrade of ECDSA Substrate accounts written by a released build, then a rename, a master password
// change, a legacy-password migration, a deletion and a reset, each checked across a browser restart (a new service
// worker). 2.x and 3.0.x stored these accounts under the blake2 hash of the public key, 4.2.0 under the public key.
//   3.0.6 (the 3.0.5 keyring code): rename Signer, change the master password, delete Spare, restart, reset, restart;
//   2.6.3: create the master password, open Vault with its own password, delete Spare, restart.
// Public test phrases only; every host name is unresolvable. Exits non-zero on the first failed check.
// Usage: node upgrade-ecdsa.mjs <2.6.3|3.0.6> <old build dir> <4.2.0 build dir> <work dir> [port]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Keyring } from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import { cryptoWaitReady, decodeAddress, signatureVerify } from '@polkadot/util-crypto';
import { ECDSA_WALLETS, MASTER_306, captureEcdsa } from './capture-ecdsa.mjs';
import { dumpStorage, installBuild, launch, openPopup, reloadExtension, serviceWorker, stop } from './cdp.mjs';
import { installKeyring305, isAt305Cost, loadKeyring305, openAs305, scryptParamsOf } from './keyring-305.mjs';

const [, , version, oldBuild, newBuild, workDir, port = '9491'] = process.argv;
const NEW_MASTER = 'Master password changed in 4.2.0';
const MASTER_263 = 'Master password created during the upgrade';
const extDir = join(workDir, 'extension');
const profileDir = join(workDir, 'profile');
const report = { version, checks: [] };
const payload = new TextEncoder().encode('Fearless ECDSA upgrade check');

// KEEP_GOING=1 records a failed check and goes on, to see everything an older build gets wrong.
function check(name, ok, details) {
  report.checks.push({ name, ok: !!ok, ...(details === undefined ? {} : { details }) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
  if (!ok && process.env.KEEP_GOING !== '1') throw new Error(`check failed: ${name}`);
}

await cryptoWaitReady();
const checker = new Keyring({ type: 'ecdsa' });
// The keyring 3.0.x opens keys with, from the Yarn cache (keyring-305.mjs).
mkdirSync(workDir, { recursive: true });
const legacyDir = installKeyring305(join(workDir, 'keyring-3.0.5'));
const legacy = await loadKeyring305(legacyDir);
const legacyKey = (address) => `fw:account:${u8aToHex(decodeAddress(address))}`;
const archiveKey = (address) => `fw:archivedAccount:${u8aToHex(decodeAddress(address))}`;
const records = (storage) => Object.entries(storage).filter(([key]) => key.startsWith('fw:account:'));
// Every stored copy of an account's key, live or set aside, found by the public key in the record.
const copiesOf = (storage, publicKey) =>
  Object.entries(storage).filter(([, value]) => JSON.stringify(value).includes(publicKey.slice(2)));
const accountsOf = async (popup) => ((await popup.call('pri(accounts.subscribe)')).ok ?? []).map(({ address, name }) => ({ address, name }));
function opensWith(json, password) {
  try {
    const pair = checker.createFromJson(json);
    pair.decodePkcs8(password);
    return pair;
  } catch {
    return undefined;
  }
}
// The stored record opens with the password, is the key the phrase derives, and signs for the address.
function signsAs(json, password, mnemonic, address) {
  const pair = opensWith(json, password);
  const derived = checker.addFromUri(mnemonic, {}, 'ecdsa');
  return !!pair && pair.address === address && u8aToHex(pair.publicKey) === u8aToHex(derived.publicKey) &&
    derived.verify(payload, pair.sign(payload), derived.publicKey);
}

async function start(extId) {
  const chrome = launch({ profileDir, extDir, port });
  await serviceWorker(port);
  const popup = await openPopup(port, extId);
  return { chrome, popup };
}

let chrome;
try {
  // 1. The released build writes the profile.
  const before = await captureEcdsa({ version, oldBuild, extDir, profileDir, port });
  // With the phrase (and 2.6.3 password) each wallet was created from.
  const ecdsa = before.wallets
    .filter(({ type }) => type === 'ecdsa')
    .map((wallet) => ({ ...ECDSA_WALLETS[version].find(({ name }) => name === wallet.name), ...wallet }));
  const [kept, deleted] = ecdsa;
  const shipped = Object.fromEntries(ecdsa.map(({ address }) => [address, before.storage[legacyKey(address)]]));
  const publicKey = Object.fromEntries(ecdsa.map(({ address }) => [address, shipped[address].address.toLowerCase()]));
  report.from = { version: before.manifestVersion, extId: before.extId, wallets: before.wallets };
  check(`${version} stored each ECDSA account under its account id`, ecdsa.every(({ address }) => checker.createFromJson(shipped[address]).address === address));

  // 2. The update: same extension id, new code.
  report.to = { version: installBuild(newBuild, extDir, JSON.parse(readFileSync(join(oldBuild, 'manifest.json'), 'utf8')).key) };
  chrome = launch({ profileDir, extDir, port });
  const sw = await serviceWorker(port);
  const extId = new URL(sw.url).host;
  check('the update keeps the extension id (and with it chrome.storage.local)', extId === before.extId, extId);
  report.reload = await reloadExtension(port, extId);
  check('Chrome runs the 4.2.0 build', report.reload.reload === 'ok' && report.reload.version === report.to.version, report.reload);
  let popup = await openPopup(port, extId);

  // 3. At the first start, each ECDSA account is stored once, under its public key, and the record the old build
  // wrote is set aside unchanged.
  let storage = await dumpStorage(port);
  for (const { address, name } of ecdsa) {
    const live = records(storage).filter(([, json]) => json.address?.toLowerCase() === publicKey[address]);
    check(`${name}: one live record, under the public key, as ${version} wrote it`,
      live.length === 1 && live[0][0] === `fw:account:${publicKey[address]}` && JSON.stringify(live[0]?.[1]) === JSON.stringify(shipped[address]),
      live.map(([key]) => key));
    check(`${name}: the ${version} record is kept in the archive byte for byte`,
      !storage[legacyKey(address)] && JSON.stringify(storage[archiveKey(address)]?.records?.[0]?.record) === JSON.stringify(shipped[address]));
  }
  let listed = await accountsOf(popup);
  check('the wallet lists each ECDSA account once', ecdsa.every(({ address }) => listed.filter((account) => account.address === address).length === 1), listed);

  let master;
  if (version === '3.0.6') {
    // 4. Rename, master password change, delete.
    check('Unlock with the 3.0.6 master password', (await popup.call('pri(keyring.unlock)', { password: MASTER_306 })).ok === true);
    check('Rename Signer', !(await popup.call('pri(accounts.update.meta)', { address: kept.address, meta: { name: 'Signer, renamed in 4.2.0' } })).err);
    check('Change the master password', (await popup.call('pri(keyring.changePassword)', { oldPassword: MASTER_306, newPassword: NEW_MASTER })).ok === true);
    master = NEW_MASTER;
  } else {
    // 4. Master password, the old per-account password, delete.
    check('Create the master password', (await popup.call('pri(keyring.changePassword)', { newPassword: MASTER_263 })).ok === true);
    check('Vault opens with its 2.6.3 password', (await popup.call('pri(keyring.migrateMasterPassword)', { address: kept.address, password: kept.password })).ok === true);
    master = MASTER_263;
  }
  check(`Delete ${deleted.name}`, (await popup.call('pri(accounts.forget)', { address: deleted.address, type: 'native' })).ok === true);
  popup.close();

  // 5. A browser restart (and with it a new service worker).
  await stop(chrome);
  ({ chrome, popup } = await start(extId));
  listed = await accountsOf(popup);
  check(`after the restart, ${deleted.name} stays deleted`, !listed.some(({ address }) => address === deleted.address), listed);
  check(`after the restart, ${kept.name} is listed once`, listed.filter(({ address }) => address === kept.address).length === 1, listed);
  if (version === '3.0.6') {
    check('the rename survived the restart', listed.find(({ address }) => address === kept.address)?.name === 'Signer, renamed in 4.2.0', listed);
    check('the old master password no longer unlocks', (await popup.call('pri(keyring.unlock)', { password: MASTER_306 })).ok === false);
  } else {
    check('Vault is not asked for its 2.6.3 password again', ((await popup.call('pri(keyring.getMigrationAccounts)')).ok ?? []).every(({ address }) => address !== kept.address));
  }
  check('the master password unlocks', (await popup.call('pri(keyring.unlock)', { password: master })).ok === true);

  storage = await dumpStorage(port);
  // Deleting keeps the wallet's keys only where Account access restores them from (DeletedWallets.ts), never where a
  // keyring loads them.
  const deletedCopies = copiesOf(storage, publicKey[deleted.address]).map(([key]) => key);
  check(`nothing of ${deleted.name} is left where a keyring loads it, and its keys are kept for Account access`,
    deletedCopies.length === 1 && deletedCopies[0].startsWith('fw:deletedWallet:'), deletedCopies);
  const live = records(storage).filter(([, json]) => json.address?.toLowerCase() === publicKey[kept.address]);
  check(`${kept.name}: one live record, under the public key`, live.length === 1 && live[0][0] === `fw:account:${publicKey[kept.address]}`, live.map(([key]) => key));
  check(`${kept.name}: the live record opens with the master password and signs with the key the ${version} phrase derives`,
    signsAs(live[0]?.[1], master, kept.substrateSuri, kept.address));
  if (version === '3.0.6') check('…and not with the old master password', !opensWith(live[0]?.[1], MASTER_306));
  // WK-10: the key 4.2.0 re-encrypted (master password change, legacy password migration) stays readable by 3.0.x.
  check(`${kept.name}: the live record is encrypted at N = 2^15, p = 1, r = 8`, !!live[0] && isAt305Cost(live[0][1]), live[0] && scryptParamsOf(live[0][1]));
  const in305 = (() => {
    try {
      return openAs305(legacy, [live[0][1]], master, storage['fw:keyring']?.passwordHash)[0];
    } catch (error) {
      return { error: String(error?.message ?? error) };
    }
  })();
  check(`${kept.name}: the 3.0.5 keyring unlocks with the master password and the key signs for the account`,
    typeof in305.sign === 'function' && in305.address === kept.address && signatureVerify(payload, in305.sign(payload), kept.address).isValid,
    in305.error);
  check(`${kept.name}: the ${version} record is still in the archive, as written`,
    JSON.stringify(storage[archiveKey(kept.address)]?.records?.[0]?.record) === JSON.stringify(shipped[kept.address]));
  report.liveRecord = live[0]?.[1];

  if (version === '3.0.6') {
    // 6. Reset wallet removes every account record, the set-aside ones included, and nothing comes back.
    check('Reset wallet', (await popup.call('pri(keyring.reset)')).ok === true);
    popup.close();
    await stop(chrome);
    ({ chrome, popup } = await start(extId));
    storage = await dumpStorage(port);
    check('after Reset wallet and a restart no account record or archive is left',
      !Object.keys(storage).some((key) => key.startsWith('fw:account:') || key.startsWith('fw:archivedAccount:')),
      Object.keys(storage).filter((key) => key.startsWith('fw:account') || key.startsWith('fw:archived')));
    check('after Reset wallet and a restart the wallet has no accounts', (await popup.call('pri(keyring.hasAccounts)')).ok === false);
  }
  report.ok = report.checks.every(({ ok }) => ok);
  if (!report.ok) process.exitCode = 1;
  popup.close();
} catch (error) {
  report.ok = false;
  report.error = String(error?.stack ?? error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await stop(chrome);
  rmSync(legacyDir, { recursive: true, force: true });
  writeFileSync(join(workDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
