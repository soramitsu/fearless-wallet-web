// Regenerates tests/fixtures/ton/ton-bip39-3.0.5-vectors.json and ton-native-3.0.5-vectors.json
// from a Fearless 3.0.5 checkout (600a64d5, `corepack yarn@3.4.1 install --immutable` on Node 20).
// Keys and addresses come from that checkout's own tonweb-mnemonic, bip39 and @ton/ton, exactly as
// 3.0.1-3.0.5 TonKeyring.createAccount stored them, so HEAD is tested against the released libraries.
//
//   node scripts/generate-ton-legacy-vectors.mjs <path to 3.0.5 checkout>
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LEGACY_SOURCE_COMMIT = '600a64d5';
// The published 3.0.5 (master) pins the same libraries: yarn.lock, TonKeyring.ts and AddWallet.vue
// are byte-identical at both commits.
const PUBLISHED_SOURCE_COMMIT = '129807f0';
const LEGACY_YARN_LOCK_SHA256 = '439d64f2cd5a5631c9af8ab49cad6695415d9fed05fc095a70ad2fc16a60e1bb';
const REAL_BUILD_VECTOR = {
  mnemonic: 'legal winner thank year wave sausage worth useful legal winner thank yellow',
  // Stored by the real 3.0.5 extension build in Chrome for this TON import.
  realBuildAddress: 'UQC-UdqQ66NWBZO-TGQ3YBfis8kz37HNFju2aKWBNESTSb44',
};
// BIP39 entropy sizes in bytes for 12, 15, 18, 21 and 24 words; 3.0.5 accepted every valid length.
const ENTROPY_BYTES = [16, 20, 24, 28, 32];
const GENERATED_VECTORS = 47;
// Native TON phrases: 3.0.x created 24-word ones and imported any length TON's own check accepts.
const NATIVE_WORD_COUNTS = [24, 24, 24, 24, 12, 18];
const NATIVE_VECTORS = 24;
// The rare phrases that pass both checks: 3.0.x still derived them with tonweb's KDF.
const NATIVE_AND_BIP39_WORD_COUNTS = [24, 24, 12, 12];

const legacyRoot = process.argv[2];
if (!legacyRoot) throw new Error('usage: node scripts/generate-ton-legacy-vectors.mjs <path to 3.0.5 checkout>');

const legacyPackage = JSON.parse(readFileSync(path.join(legacyRoot, 'package.json'), 'utf8'));
if (legacyPackage.version !== '3.0.5') throw new Error(`expected a 3.0.5 checkout, found ${legacyPackage.version}`);

const legacyYarnLockSha256 = createHash('sha256').update(readFileSync(path.join(legacyRoot, 'yarn.lock'))).digest('hex');
if (legacyYarnLockSha256 !== LEGACY_YARN_LOCK_SHA256) throw new Error(`not the 3.0.5 lockfile: ${legacyYarnLockSha256}`);

const legacyRequire = createRequire(path.join(path.resolve(legacyRoot), 'package.json'));
const tonWebMnemonic = legacyRequire('tonweb-mnemonic');
const bip39 = legacyRequire('bip39');
const { WalletContractV4 } = legacyRequire('@ton/ton');
const versionOf = (name) => legacyRequire(`${name}/package.json`).version;

async function legacyVector(mnemonic) {
  const words = mnemonic.split(' ');
  if (!bip39.validateMnemonic(mnemonic)) throw new Error(`not a BIP39 phrase: ${mnemonic}`);
  const { publicKey } = await tonWebMnemonic.mnemonicToKeyPair(words);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: Buffer.from(publicKey) });

  return {
    mnemonic,
    tonwebValid: await tonWebMnemonic.validateMnemonic(words),
    publicKeyHex: Buffer.from(publicKey).toString('hex'),
    address: wallet.address.toString({ bounceable: false, urlSafe: true }),
  };
}

const vectors = [await legacyVector(REAL_BUILD_VECTOR.mnemonic)];
if (vectors[0].address !== REAL_BUILD_VECTOR.realBuildAddress) {
  throw new Error(`3.0.5 libraries disagree with the real build: ${vectors[0].address}`);
}

for (let index = 0; index < GENERATED_VECTORS; index += 1) {
  const bytes = ENTROPY_BYTES[index % ENTROPY_BYTES.length];
  const entropy = createHash('sha256').update(`fearless-ton-legacy-vector-${index}`).digest().subarray(0, bytes);
  vectors.push(await legacyVector(bip39.entropyToMnemonic(entropy)));
}

const output = {
  schemaVersion: 1,
  description:
    'TON accounts that Fearless 3.0.1-3.0.5 created by importing BIP39 phrases: tonweb-mnemonic KDF over the stored words, WalletContractV4R2 non-bounceable address. Public test phrases from fixed seeds: never fund them.',
  source: {
    commit: LEGACY_SOURCE_COMMIT,
    generator: 'scripts/generate-ton-legacy-vectors.mjs',
    libraries: Object.fromEntries(['tonweb-mnemonic', 'tweetnacl', 'bip39', '@ton/ton', '@ton/core'].map((name) => [name, versionOf(name)])),
    realBuildAddress: REAL_BUILD_VECTOR.realBuildAddress,
  },
  vectors,
};

const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/ton/ton-bip39-3.0.5-vectors.json');
writeFileSync(fixturePath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`wrote ${vectors.length} vectors to ${path.relative(process.cwd(), fixturePath)}`);

// tonweb-mnemonic generateMnemonic draws random words until TON's own seed check accepts them.
// The same loop over a fixed stream keeps this fixture reproducible.
async function nativePhrase(label, wordCount, bip39Valid) {
  for (let attempt = 0; ; attempt += 1) {
    const stream = createHash('sha512').update(`${label}-${attempt}`).digest();
    const words = Array.from({ length: wordCount }, (_, index) => tonWebMnemonic.wordlists.EN[stream.readUInt16BE(index * 2) & 2047]);

    if (bip39.validateMnemonic(words.join(' ')) !== bip39Valid) continue;
    if (await tonWebMnemonic.validateMnemonic(words)) return words.join(' ');
  }
}

async function nativeVector(mnemonic) {
  const words = mnemonic.split(' ');
  const { publicKey } = await tonWebMnemonic.mnemonicToKeyPair(words);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: Buffer.from(publicKey) });

  return {
    mnemonic,
    bip39Valid: bip39.validateMnemonic(mnemonic),
    tonwebValid: await tonWebMnemonic.validateMnemonic(words),
    publicKeyHex: Buffer.from(publicKey).toString('hex'),
    address: wallet.address.toString({ bounceable: false, urlSafe: true }),
  };
}

const nativeVectors = [];

for (let index = 0; index < NATIVE_VECTORS; index += 1) {
  const wordCount = NATIVE_WORD_COUNTS[index % NATIVE_WORD_COUNTS.length];
  nativeVectors.push(await nativeVector(await nativePhrase(`fearless-ton-native-vector-${index}`, wordCount, false)));
}

for (const [index, wordCount] of NATIVE_AND_BIP39_WORD_COUNTS.entries()) {
  nativeVectors.push(await nativeVector(await nativePhrase(`fearless-ton-native-bip39-vector-${index}`, wordCount, true)));
}

const nativeOutput = {
  schemaVersion: 1,
  description:
    'TON accounts that Fearless 3.0.1-3.0.5 created from native TON phrases (its own TON create flow, or an import that tonweb-mnemonic validates): tonweb-mnemonic KDF over the stored words, WalletContractV4R2 non-bounceable address. bip39Valid marks the rare phrases that also pass BIP39. Public test phrases from fixed seeds: never fund them.',
  source: {
    commit: LEGACY_SOURCE_COMMIT,
    publishedCommit: PUBLISHED_SOURCE_COMMIT,
    yarnLockSha256: LEGACY_YARN_LOCK_SHA256,
    generator: 'scripts/generate-ton-legacy-vectors.mjs',
    libraries: output.source.libraries,
  },
  vectors: nativeVectors,
};

const nativeFixturePath = path.resolve(path.dirname(fixturePath), 'ton-native-3.0.5-vectors.json');
writeFileSync(nativeFixturePath, `${JSON.stringify(nativeOutput, null, 2)}\n`);
console.log(`wrote ${nativeVectors.length} vectors to ${path.relative(process.cwd(), nativeFixturePath)}`);
