// Writes a per-account-password profile with the REAL Fearless Wallet 2.6.3 build (source 1d515acf, built from
// its own lockfile) and dumps chrome.storage.local. Public test phrases only; no network.
// Usage: node capture-263.mjs <2.6.3 build dir> <ext dir> <profile dir> <out json> [port]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dumpStorage, installBuild, launch, openPopup, serviceWorker, stop } from './cdp.mjs';

export const M1 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
export const M2 = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const EVM_PATH = "/m/44'/60'/0'/0/0";
// What AddWallet.vue saveKeypairFromSeed sends in 2.6.3: the Ethereum account first, then the Substrate
// account that names it, both with the wallet's own password.
export const WALLETS = [
  { name: 'Savings', password: 'legacy-pw-A', substrateSuri: M1, ethereumSuri: `${M1}${EVM_PATH}` },
  { name: 'Forgotten', password: 'legacy-pw-B', substrateSuri: M2, ethereumSuri: `${M2}${EVM_PATH}` },
  { name: 'Staking', password: 'legacy-pw-C', substrateSuri: `${M1}//staking`, ethereumSuri: '' },
];

/** Creates the three wallets with the 2.6.3 build into a new profile and returns what it stored. */
export async function capture263({ oldBuild, extDir, profileDir, port }) {
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  // The 2.6.3 build carries the throwaway manifest key the fixture was captured with (see README.md).
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
    for (const { name, password, substrateSuri, ethereumSuri } of WALLETS) {
      const meta = { name, ethereumAddress: '' };
      if (ethereumSuri) {
        const evm = await popup.call('pri(accounts.create)', { password, suri: ethereumSuri, type: 'ethereum', meta });
        if (!evm.ok) throw new Error(`create EVM ${name}: ${JSON.stringify(evm)}`);
        meta.ethereumAddress = evm.ok;
      }
      const sub = await popup.call('pri(accounts.create)', { password, suri: substrateSuri, type: 'sr25519', meta });
      if (!sub.ok) throw new Error(`create Substrate ${name}: ${JSON.stringify(sub)}`);
      result.wallets.push({ name, address: sub.ok, ethereumAddress: meta.ethereumAddress });
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
  const [, , oldBuild, extDir, profileDir, outFile, port = '9461'] = process.argv;
  const result = await capture263({ oldBuild, extDir, profileDir, port });
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, storage: Object.keys(result.storage ?? {}) }, null, 1));
}
