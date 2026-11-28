// Writes JSON backups of path and password wallets with a REAL released Fearless Wallet build, the file its Export
// (JSON) and its Google Drive backup save: `pri(accounts.export.json)` with the master password. With --restore, the
// build restores the backups of an earlier capture into a new profile instead, and the dump shows what it stored.
// Public test phrases and passwords only (docs/universal-wallet-v2*-vectors.json); no network.
// Usage: node capture-json-backups.mjs <version> <build dir> <ext dir> <profile dir> <out json> [--restore <capture>] [port]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dumpStorage, installBuild, launch, openPopup, serviceWorker, stop } from './chrome.mjs';
import { root } from './config.mjs';

const readJson = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
const [import12, default24] = readJson('docs/universal-wallet-v2-vectors.json').vectors;
const [trezor, unicode] = readJson('docs/universal-wallet-v2-passphrase-vectors.json').vectors;
const EVM_PATH = "/m/44'/60'/0'/0/0";

export const MASTER_PASSWORD = 'Master password for JSON backups';
// What AddWallet.vue saveKeypairFromSeed sends for an imported phrase with a path under Advanced: the Ethereum
// account first (the standard path), then the Substrate account that names it.
export const BACKUP_WALLETS = [
  { name: 'Password wallet', vector: import12, substratePath: `//polkadot///${trezor.passphrase}`, ethereumPath: EVM_PATH },
  { name: 'Staking', vector: default24, substratePath: '//staking', ethereumPath: '' },
  { name: 'Unicode password', vector: default24, substratePath: `//unicode///${unicode.passphrase}`, ethereumPath: '' },
  { name: 'Plain', vector: default24, substratePath: '', ethereumPath: EVM_PATH },
];

// 4.x AddWallet adds the Universal Wallet accounts its words alone open; 3.0.x has none.
function addWalletMeta(version, name, vector) {
  const meta = { name, ethereumAddress: '', walletEcosystem: 'substrate' };
  if (version.startsWith('3.')) return meta;
  const { bitcoin, solana, ton, iroha } = vector.expected;
  return {
    ...meta,
    bitcoinAddress: bitcoin.mainnet.firstReceiveAddress,
    bitcoinTestnetAddress: bitcoin.testnet.firstReceiveAddress,
    solanaAddress: solana.address,
    tonAddress: ton.addressNonBounceable,
    tonPublicKeyHex: ton.publicKeyHex,
    irohaAddress: iroha.taira.i105,
    irohaPublicKeyHex: iroha.taira.publicKeyHex,
  };
}

const ok = (result, what) => {
  if (result.ok === undefined || result.ok === false) throw new Error(`${what}: ${JSON.stringify(result)}`);
  return result.ok;
};

async function createAndExport(popup, version) {
  const wallets = [];
  for (const { name, vector, substratePath, ethereumPath } of BACKUP_WALLETS) {
    const meta = addWalletMeta(version, name, vector);
    const request = (suri, type) => ({ suri, type, meta: { ...meta }, walletEcosystem: 'substrate' });
    if (ethereumPath) {
      meta.ethereumAddress = ok(await popup.call('pri(accounts.create)', request(`${vector.mnemonic}${ethereumPath}`, 'ethereum')), `create EVM ${name}`);
    }
    const address = ok(await popup.call('pri(accounts.create)', request(`${vector.mnemonic}${substratePath}`, 'sr25519')), `create ${name}`);
    const exported = (account) =>
      popup.call('pri(accounts.export.json)', { address: account, password: MASTER_PASSWORD }).then((result) => ok(result, `export ${name}`).json);
    wallets.push({
      name, vectorId: vector.id, substratePath, ethereumPath, address, ethereumAddress: meta.ethereumAddress,
      backup: await exported(address),
      ...(meta.ethereumAddress ? { ethereumBackup: await exported(meta.ethereumAddress) } : {}),
    });
  }
  return wallets;
}

// Each wallet as BackupWalletsList.vue (Google Drive) and AddWallet.vue (JSON) restore it: the Ethereum file first,
// then the Substrate file linked to it.
async function restore(popup, capture) {
  const wallets = [];
  for (const { name, backup, ethereumBackup } of capture.wallets) {
    const linkedEthereumAddress = ethereumBackup
      ? ok(await popup.call('pri(accounts.json.restore)', { file: ethereumBackup, password: capture.masterPassword }), `restore EVM ${name}`)
      : undefined;
    const address = ok(await popup.call('pri(accounts.json.restore)', {
      file: backup, password: capture.masterPassword, ...(linkedEthereumAddress ? { linkedEthereumAddress } : {}),
    }), `restore ${name}`);
    wallets.push({ name, address, ethereumAddress: linkedEthereumAddress ?? '' });
  }
  return wallets;
}

export async function captureJsonBackups({ version, build, extDir, profileDir, port, restoreFrom }) {
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  installBuild(build, extDir, JSON.parse(readFileSync(join(build, 'manifest.json'), 'utf8')).key);

  const result = {};
  let chrome;
  try {
    chrome = launch({ profileDir, extDir, port });
    const sw = await serviceWorker(port);
    const extId = new URL(sw.url).host;
    const popup = await openPopup(port, extId);
    result.extensionId = extId;
    result.manifestVersion = await popup.eval('chrome.runtime.getManifest().version');
    if (result.manifestVersion !== version) throw new Error(`expected ${version}, the build is ${result.manifestVersion}`);
    result.chrome = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser;
    if ((await popup.call('pri(keyring.changePassword)', { newPassword: MASTER_PASSWORD })).ok !== true) {
      throw new Error('master password was not set');
    }
    result.masterPassword = MASTER_PASSWORD;
    if (restoreFrom) {
      result.restoredFrom = { version: restoreFrom.manifestVersion, extensionId: restoreFrom.extensionId };
      result.wallets = await restore(popup, restoreFrom);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      result.storage = await dumpStorage(port);
    } else {
      result.wallets = await createAndExport(popup, version);
    }
    popup.close();
  } finally {
    await stop(chrome);
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const restoreAt = args.indexOf('--restore');
  const restoreFile = restoreAt >= 0 ? args.splice(restoreAt, 2)[1] : undefined;
  const [version, build, extDir, profileDir, outFile, port = '9483'] = args;
  const restoreFrom = restoreFile ? JSON.parse(readFileSync(restoreFile, 'utf8')) : undefined;
  const result = await captureJsonBackups({ version, build, extDir, profileDir, port, restoreFrom });
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, wallets: result.wallets.map(({ name, address, ethereumAddress }) => ({ name, address, ethereumAddress })), storage: Object.keys(result.storage ?? {}) }, null, 1));
}
