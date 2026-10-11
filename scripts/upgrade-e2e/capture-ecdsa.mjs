// Writes ECDSA Substrate accounts with a REAL released Fearless Wallet build and dumps chrome.storage.local.
//   2.6.3: @polkadot/ui-keyring 3.5.1, every account with its own password (source 1d515acf);
//   3.0.6: the keyring code of 3.0.5 (@subwallet/ui-keyring 0.1.7) minus the phrase upload, master password.
// Both store an ECDSA account under the blake2 hash of its public key; 4.2.0 (ui-keyring 0.1.14) uses the public key.
// Public test phrases only; no network.
// Usage: node capture-ecdsa.mjs <2.6.3|3.0.6> <build dir> <ext dir> <profile dir> <out json> [port]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dumpStorage, installBuild, launch, openPopup, serviceWorker, stop } from './chrome.mjs';
import { M1, M2 } from './capture-263.mjs';

const EVM_PATH = "/m/44'/60'/0'/0/0";
export const MASTER_306 = 'Master password set in 3.0.6';
// What AddWallet.vue saveKeypairFromSeed sends with ECDSA chosen under Advanced: the Ethereum account first,
// then the Substrate account that names it. "Daily" is an sr25519 wallet next to them.
export const ECDSA_WALLETS = {
  '2.6.3': [
    { name: 'Vault', password: 'legacy-ecdsa-A', type: 'ecdsa', substrateSuri: M1, ethereumSuri: `${M1}${EVM_PATH}` },
    { name: 'Spare', password: 'legacy-ecdsa-B', type: 'ecdsa', substrateSuri: M2, ethereumSuri: `${M2}${EVM_PATH}` },
  ],
  '3.0.6': [
    { name: 'Signer', type: 'ecdsa', substrateSuri: M1, ethereumSuri: `${M1}${EVM_PATH}` },
    { name: 'Spare', type: 'ecdsa', substrateSuri: M2, ethereumSuri: `${M2}${EVM_PATH}` },
    { name: 'Daily', type: 'sr25519', substrateSuri: `${M2}//daily`, ethereumSuri: '' },
  ],
};

/** Creates the wallets with the given build into a new profile and returns what it stored. */
export async function captureEcdsa({ version, oldBuild, extDir, profileDir, port }) {
  const wallets = ECDSA_WALLETS[version];
  if (!wallets) throw new Error(`no wallets for ${version}`);
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  // The build carries the throwaway manifest key, so a newer build replaces it under the same id (README.md).
  installBuild(oldBuild, extDir, JSON.parse(readFileSync(join(oldBuild, 'manifest.json'), 'utf8')).key);

  const result = { wallets: [] };
  let chrome;
  try {
    chrome = launch({ profileDir, extDir, port });
    const sw = await serviceWorker(port);
    const extId = new URL(sw.url).host;
    const popup = await openPopup(port, extId);
    result.extId = extId;
    result.manifestVersion = await popup.eval('chrome.runtime.getManifest().version');
    if (result.manifestVersion !== version) throw new Error(`expected ${version}, the build is ${result.manifestVersion}`);
    if (version === '3.0.6') {
      const created = await popup.call('pri(keyring.changePassword)', { newPassword: MASTER_306 });
      if (created.ok !== true) throw new Error(`master password: ${JSON.stringify(created)}`);
    }
    for (const { name, password, type, substrateSuri, ethereumSuri } of wallets) {
      // 2.6.3 takes the account's own password with the request; 3.0.x encrypts with the master password.
      const request = (suri, keypairType, meta) =>
        version === '2.6.3'
          ? { password, suri, type: keypairType, meta }
          : { suri, type: keypairType, meta, walletEcosystem: 'substrate' };
      const meta = version === '2.6.3' ? { name, ethereumAddress: '' } : { name, ethereumAddress: '', walletEcosystem: 'substrate' };
      if (ethereumSuri) {
        const evm = await popup.call('pri(accounts.create)', request(ethereumSuri, 'ethereum', meta));
        if (!evm.ok) throw new Error(`create EVM ${name}: ${JSON.stringify(evm)}`);
        meta.ethereumAddress = evm.ok;
      }
      const sub = await popup.call('pri(accounts.create)', request(substrateSuri, type, meta));
      if (!sub.ok) throw new Error(`create ${type} ${name}: ${JSON.stringify(sub)}`);
      result.wallets.push({ name, type, address: sub.ok, ethereumAddress: meta.ethereumAddress });
    }
    result.hasMasterPassword = await popup.call('pri(keyring.hasMasterPassword)');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    result.storage = await dumpStorage(port);
    popup.close();
  } finally {
    await stop(chrome);
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , version, oldBuild, extDir, profileDir, outFile, port = '9481'] = process.argv;
  const result = await captureEcdsa({ version, oldBuild, extDir, profileDir, port });
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, storage: Object.keys(result.storage ?? {}) }, null, 1));
}
