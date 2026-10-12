// The keyring Fearless 3.0.x opens stored keys with (@subwallet/keyring 0.1.7 over @polkadot/util-crypto 12.6.2),
// installed from the Yarn cache archives the 3.0.5 yarn.lock pins (keyring-3.0.5-packages.json). Tests and harnesses
// use it to prove that 3.0.x can still open what 4.2.0 writes. Nothing is fetched: an archive that is missing from
// the cache, or whose sha512 differs from the lockfile's checksum, is reported and nothing is loaded.
//
// The archives are in the cache of any machine that ran `corepack yarn@3.4.1 install --immutable` in a 3.0.5 or 3.0.6
// checkout (tests/fixtures/upgrade/README.md).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PINNED = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../tests/fixtures/upgrade/keyring-3.0.5-packages.json'
);
// Yarn 3.4.1's cache key; the 3.0.5 checksums are those of these archives.
const CACHE_KEY = 8;

export function yarnCacheFolder(env = process.env) {
  return env.YARN_CACHE_FOLDER || path.join(env.YARN_GLOBAL_FOLDER || path.join(homedir(), '.yarn', 'berry'), 'cache');
}

/** The cache archive of each pinned package, or the packages it lacks. */
export function findKeyring305Archives(cacheFolder = yarnCacheFolder()) {
  const { packages } = JSON.parse(readFileSync(PINNED, 'utf8'));
  const files = existsSync(cacheFolder) ? readdirSync(cacheFolder) : [];
  const found = [];
  const missing = [];
  for (const pkg of packages) {
    // Yarn names an archive <scope-name>-npm-<version>-<locator hash>-<cache key>.zip.
    const prefix = `${pkg.name.replace('/', '-')}-npm-${pkg.version}-`;
    const zip = files
      .filter((file) => file.startsWith(prefix) && file.endsWith(`-${CACHE_KEY}.zip`))
      .map((file) => path.join(cacheFolder, file))
      .find((file) => createHash('sha512').update(readFileSync(file)).digest('hex') === pkg.checksum);
    if (zip) found.push({ ...pkg, zip });
    else missing.push(`${pkg.name}@${pkg.version}`);
  }
  return { cacheFolder, found, missing };
}

/** Unpacks the verified archives into a node_modules tree laid out as the 3.0.5 install was. */
export function installKeyring305(dir = mkdtempSync(path.join(tmpdir(), 'fearless-keyring-305-')), cacheFolder) {
  const { found, missing } = findKeyring305Archives(cacheFolder);
  if (missing.length) {
    throw new Error(
      `The Yarn cache (${cacheFolder ?? yarnCacheFolder()}) lacks the 3.0.5 keyring packages ${missing.join(', ')}. ` +
        'Install a 3.0.5 checkout with `corepack yarn@3.4.1 install --immutable` once to add them.'
    );
  }
  for (const pkg of found) {
    // An archive holds node_modules/<name>/...; it is unpacked next to the package that depends on it.
    const suffix = `node_modules/${pkg.name}`;
    if (!pkg.path.endsWith(suffix)) throw new Error(`unexpected install path ${pkg.path}`);
    const target = path.join(dir, pkg.path.slice(0, -suffix.length));
    mkdirSync(target, { recursive: true });
    execFileSync('unzip', ['-q', '-o', pkg.zip, '-d', target]);
  }
  return dir;
}

/** Loads the 3.0.x keyring from a tree installKeyring305 made. */
export async function loadKeyring305(dir = installKeyring305()) {
  const legacyRequire = createRequire(path.join(dir, 'index.cjs'));
  const utilCrypto = legacyRequire('@polkadot/util-crypto');
  const util = legacyRequire('@polkadot/util');
  const { Keyring } = legacyRequire('@subwallet/keyring/keyring');
  const bcrypt = legacyRequire('bcryptjs');
  await utilCrypto.cryptoWaitReady();
  const versionOf = (name) =>
    JSON.parse(readFileSync(path.join(dir, 'node_modules', name, 'package.json'), 'utf8')).version;

  return {
    dir,
    Keyring,
    bcrypt,
    require: legacyRequire,
    util,
    utilCrypto,
    versions: Object.fromEntries(
      ['@subwallet/keyring', '@polkadot/util-crypto', 'bcryptjs'].map((name) => [name, versionOf(name)])
    ),
  };
}

/** The scrypt cost a stored key is encrypted at: after the 32-byte salt, N, p and r as little-endian u32. */
export function scryptParamsOf(json) {
  const header = Buffer.from(json.encoded, 'base64').subarray(32, 44);
  return { N: header.readUInt32LE(0), p: header.readUInt32LE(4), r: header.readUInt32LE(8) };
}

/** The only cost @polkadot/util-crypto 12.x, and so 3.0.x, opens a key at. */
export const isAt305Cost = (json) => JSON.stringify(scryptParamsOf(json)) === JSON.stringify({ N: 32768, p: 1, r: 8 });

/**
 * Opens account records the way 3.0.x does: ui-keyring 0.1.7 loads each stored account with keyring.addFromJson,
 * unlockKeyring checks the master password against the stored bcrypt hash (fw:keyring), unlockPair decodes the key
 * with it. Without a hash, each record is opened with its own password, as 3.0.x does for a 2.x account or a JSON
 * file. Throws as 3.0.x would on a record it cannot open.
 */
export function openAs305(legacy, records, password, passwordHash) {
  const keyring = new legacy.Keyring({ type: 'sr25519' });
  if (passwordHash) {
    keyring.setupMasterPassword(passwordHash);
    keyring.unlockKeyring(password);
  }
  return records.map((json) => {
    const pair = keyring.addFromJson(json, true);
    if (passwordHash) keyring.unlockPair(pair.address);
    else pair.decodePkcs8(password);
    return pair;
  });
}
