// Regenerates tests/fixtures/upgrade/keyring-3.0.5-packages.json: every package 3.0.x loads to open a stored key
// (@subwallet/keyring 0.1.7's Keyring and pair, @polkadot/util-crypto 12.6.2 and their dependencies), with the place
// it is installed and the checksum the 3.0.5 yarn.lock (129807f0) pins for it. keyring-305.mjs installs exactly these
// from the Yarn cache.
//
//   node scripts/upgrade-e2e/pin-keyring-305.mjs <3.0.5 or 3.0.6 checkout after `yarn install --immutable`>
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// sha256 of yarn.lock at 129807f0 (3.0.5); the 3.0.6 hotfix (096485cc) keeps it unchanged.
const YARN_LOCK_305 = '439d64f2cd5a5631c9af8ab49cad6695415d9fed05fc095a70ad2fc16a60e1bb';
// What 3.0.x runs to open a key: ui-keyring 0.1.7 loads accounts into this Keyring, which decodes them with its pair.
const ENTRIES = ['@subwallet/keyring/keyring', '@subwallet/keyring/pair', '@polkadot/util-crypto', '@polkadot/util'];

const checkout = process.argv[2] && path.resolve(process.argv[2]);
if (!checkout) throw new Error('usage: node pin-keyring-305.mjs <3.0.5 or 3.0.6 checkout>');

const lockfile = readFileSync(path.join(checkout, 'yarn.lock'), 'utf8');
const lockSha256 = createHash('sha256').update(lockfile).digest('hex');
if (lockSha256 !== YARN_LOCK_305) throw new Error(`not the 3.0.5 yarn.lock: ${lockSha256}`);

// "name@npm:version" -> checksum, from the Yarn 3 lockfile.
const checksums = new Map();
for (const block of lockfile.split(/\n\n/u)) {
  const resolution = block.match(/^ {2}resolution: "(.+)"$/mu)?.[1];
  const checksum = block.match(/^ {2}checksum: ([0-9a-f]+)$/mu)?.[1];
  if (resolution && checksum) checksums.set(resolution, checksum);
}

function packageDirOf(file) {
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name) return dir;
  }
  throw new Error(`no package for ${file}`);
}

const legacyRequire = createRequire(path.join(checkout, 'package.json'));
const before = new Set(Object.keys(legacyRequire.cache));
ENTRIES.forEach((entry) => legacyRequire(entry));

const packages = new Map();
for (const file of Object.keys(legacyRequire.cache)) {
  if (before.has(file) || !file.startsWith(`${checkout}${path.sep}`)) continue;
  const dir = packageDirOf(file);
  const { name, version } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const installedAt = path.relative(checkout, dir).split(path.sep).join('/');
  const checksum = checksums.get(`${name}@npm:${version}`);
  if (!checksum) throw new Error(`${name}@${version} is not in the 3.0.5 yarn.lock`);
  packages.set(installedAt, { name, version, path: installedAt, checksum });
}

const output = {
  schemaVersion: 1,
  description:
    'The packages Fearless 3.0.x loads to open a stored key, as installed from the 3.0.5 yarn.lock. Each checksum is the sha512 of the Yarn 3 cache archive (cacheKey 8) that yarn.lock pins.',
  source: {
    commit: '129807f0',
    yarnLockSha256: YARN_LOCK_305,
    packageManager: 'yarn@3.4.1',
    entries: ENTRIES,
    generator: 'scripts/upgrade-e2e/pin-keyring-305.mjs',
  },
  packages: [...packages.values()].sort((a, b) => a.path.localeCompare(b.path)),
};

const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../tests/fixtures/upgrade/keyring-3.0.5-packages.json'
);
writeFileSync(out, `${JSON.stringify(output, null, 2)}\n`);
console.log(`pinned ${output.packages.length} packages in ${path.relative(process.cwd(), out)}`);
