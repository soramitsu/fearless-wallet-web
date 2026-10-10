// Regenerates tests/fixtures/ton/ton-bip39-3.0.5-vectors.json from a Fearless 3.0.5 checkout
// (600a64d5, `corepack yarn@3.4.1 install --immutable` on Node 20). Keys and addresses come
// from that checkout's own tonweb-mnemonic, bip39 and @ton/ton, exactly as 3.0.1-3.0.5
// TonKeyring.createAccount stored them, so HEAD is tested against the released libraries.
//
//   node scripts/generate-ton-legacy-vectors.mjs <path to 3.0.5 checkout>
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LEGACY_SOURCE_COMMIT = '600a64d5';
const REAL_BUILD_VECTOR = {
  mnemonic: 'legal winner thank year wave sausage worth useful legal winner thank yellow',
  // Stored by the real 3.0.5 extension build in Chrome for this TON import.
  realBuildAddress: 'UQC-UdqQ66NWBZO-TGQ3YBfis8kz37HNFju2aKWBNESTSb44',
};
// BIP39 entropy sizes in bytes for 12, 15, 18, 21 and 24 words; 3.0.5 accepted every valid length.
const ENTROPY_BYTES = [16, 20, 24, 28, 32];
const GENERATED_VECTORS = 47;

const legacyRoot = process.argv[2];
if (!legacyRoot) throw new Error('usage: node scripts/generate-ton-legacy-vectors.mjs <path to 3.0.5 checkout>');

const legacyPackage = JSON.parse(readFileSync(path.join(legacyRoot, 'package.json'), 'utf8'));
if (legacyPackage.version !== '3.0.5') throw new Error(`expected a 3.0.5 checkout, found ${legacyPackage.version}`);

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
