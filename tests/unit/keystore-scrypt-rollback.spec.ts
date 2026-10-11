import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { hexToU8a, stringToU8a, u8aConcat, u8aToBn, u8aToHex, u8aToString } from '@polkadot/util';
import {
  base64Decode,
  blake2AsU8a,
  cryptoWaitReady,
  encodeAddress,
  ethereumEncode,
  naclEncrypt,
  scryptEncode,
  scryptToU8a,
  secp256k1PairFromSeed,
  signatureVerify,
} from '@polkadot/util-crypto';
import { encodePair as polkadotEncodePair } from '@polkadot/keyring/pair/encode';
import { jsonEncrypt } from '@polkadot/util-crypto/json/encrypt';
import { decodePair } from '@subwallet/keyring/pair/decode';
import { PKCS8_DIVIDER, PKCS8_HEADER } from '@subwallet/keyring/pair/defaults';
import { encodePair } from '@subwallet/keyring/pair/encode';
import { pairToJson } from '@subwallet/keyring/pair/toJson';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { KEYSTORE_SCRYPT_PARAMS, keystoreScryptParamsPlugin } from '../../scripts/keystore-scrypt-params.mjs';
import { findKeyring305Archives, installKeyring305, loadKeyring305, openAs305 } from '../fixtures/upgrade/harness/keyring-305.mjs';
// chrome.storage.local as the real Fearless Wallet 3.0.6 (3.0.5 keyring code) and 2.6.3 builds wrote it
// (tests/fixtures/upgrade/README.md).
import profile306 from '../fixtures/upgrade/s2-3.0.6-ecdsa.json';
import profile263 from '../fixtures/upgrade/s1-2.6.3-per-account-passwords.json';
import type { KeypairType, KeyringPair$Json } from '@subwallet/keyring/types';

// 4.2.0 must write every key so that a 3.0.x-era build can open it again (WK-10): @polkadot/util-crypto 12.6.2, which
// 3.0.x opens keys with, accepts exactly N = 2^15, p = 1, r = 8; 14.x encrypts at N = 2^17 unless told otherwise.
// The key encoders the build bundles are rewritten to pass those parameters (scripts/keystore-scrypt-params.mjs);
// vitest loads them with the same rewrite (vitest.config.ts).

const NEW_MASTER = 'Master password changed in 4.2.0';
const payload = new TextEncoder().encode('Fearless 4.2.0 -> 3.0.x rollback check');
const nodeModules = path.resolve(__dirname, '../../node_modules');
// Every module installed here that encrypts at util-crypto's default cost: the keyring pair encoders (ES module and
// CommonJS, including the SORA SDK's own @polkadot/keyring) and jsonEncrypt.
const INSTALLED_ENCODERS = [
  '@subwallet/keyring/pair/encode.js',
  '@subwallet/keyring/cjs/pair/encode.js',
  '@polkadot/keyring/pair/encode.js',
  '@polkadot/keyring/cjs/pair/encode.js',
  '@polkadot/ui-keyring/node_modules/@polkadot/keyring/pair/encode.js',
  '@polkadot/ui-keyring/node_modules/@polkadot/keyring/cjs/pair/encode.js',
  '@polkadot/util-crypto/json/encrypt.js',
  '@polkadot/util-crypto/cjs/json/encrypt.js',
];

type Profile = typeof profile306 | typeof profile263;
type Wallet = { name: string; address: string; ethereumAddress: string; mnemonic: string; password?: string };

// The account a record belongs to. Ethereum and ECDSA records hold the compressed public key: the account is its
// keccak address or the SS58 address of its blake2 hash.
function accountOf(json: KeyringPair$Json): string {
  const type = json.encoding.content[1];
  if (type === 'ethereum') return ethereumEncode(json.address);
  if (type === 'ecdsa') return encodeAddress(blake2AsU8a(hexToU8a(json.address)));
  return json.address;
}

// Each stored key of a shipped profile, with the password it opens with and the wallet it belongs to.
function shippedKeys(profile: Profile, passwordOf: (wallet: Wallet) => string) {
  return Object.entries(profile.storage)
    .filter(([key]) => key.startsWith('fw:account:'))
    .map(([, value]) => {
      const json = value as unknown as KeyringPair$Json;
      const address = accountOf(json);
      const wallet = (profile.wallets as Wallet[]).find((candidate) =>
        [candidate.address, candidate.ethereumAddress].some((known) => known.toLowerCase() === address.toLowerCase())
      )!;
      return { json, type: json.encoding.content[1] as KeypairType, wallet, password: passwordOf(wallet), address };
    });
}

// What @subwallet/keyring 0.1.14's pair.decodePkcs8 holds after opening a record: a 32-byte EVM/ECDSA secret is
// expanded to its key pair (TYPE_FROM_SEED), a 64-byte Substrate secret is used as stored.
function openAs420(json: KeyringPair$Json, password: string) {
  const decoded = decodePair(password, base64Decode(json.encoded), json.encoding.type);
  if (decoded.secretKey.length === 64) return decoded;
  return { ...secp256k1PairFromSeed(decoded.secretKey), entropy: decoded.entropy };
}

// pair.toJson(password) of @subwallet/keyring 0.1.14: pairToJson over encodePair. This is the record every 4.2.0 path
// stores or hands out for a key it already holds: a master password change (changePkcs8), a legacy password upgrade
// and recovery (createJsonPairWithMasterPassword), the JSON export (backupAccount).
function writeAs420(json: KeyringPair$Json, key: ReturnType<typeof openAs420>, password: string): KeyringPair$Json {
  const encoded = encodePair({ entropy: key.entropy, publicKey: key.publicKey, secretKey: key.secretKey }, password);
  return pairToJson(json.encoding.content[1] as KeypairType, { address: json.address, meta: { ...json.meta } }, encoded, true);
}

// What 3.0.x's Export phrase shows for a key it opened.
function exportedPhrase(pair: { exportMnemonic: (password: string) => string }, password: string): string {
  try {
    return pair.exportMnemonic(password);
  } catch (error) {
    return `throws: ${(error as Error).message}`;
  }
}

function scryptParamsOf(json: KeyringPair$Json) {
  const header = base64Decode(json.encoded).subarray(32, 44);
  const read = (offset: number) => u8aToBn(header.subarray(offset, offset + 4), { isLe: true }).toNumber();
  return { N: read(0), p: read(4), r: read(8) };
}

beforeAll(async () => {
  await cryptoWaitReady();
});

describe('the build gives every key encoder the scrypt cost 3.0.x reads', () => {
  const plugin = keystoreScryptParamsPlugin();
  const explicitCost = '(passphrase, undefined, {"N":32768,"p":1,"r":8})';

  it.each(INSTALLED_ENCODERS)('rewrites %s', (encoder) => {
    const file = path.join(nodeModules, encoder);
    const code = plugin.transform(readFileSync(file, 'utf8'), file)?.code;

    expect(code).toContain(explicitCost);
    expect(code).not.toMatch(/scryptEncode\)?\(passphrase\)/);
  });

  it('leaves code that does not encrypt at the default cost alone', () => {
    for (const module of ['@polkadot/util-crypto/json/decryptData.js', '@polkadot/util-crypto/scrypt/encode.js', '@subwallet/keyring/pair/decode.js']) {
      const file = path.join(nodeModules, module);
      expect(plugin.transform(readFileSync(file, 'utf8'), file)).toBeNull();
    }
  });

  it('fails the build for any other code that would encrypt at the default cost', () => {
    const bundle = path.join(nodeModules, '@subwallet/keyring/bundle-subwallet-keyring.js');
    // Assembled here so that this file itself holds no such call (the rewrite also sees test files).
    const source = `import { scryptEncode } from '@polkadot/util-crypto';\nexport const key = (passphrase) => ${'scryptEncode'}(passphrase);`;

    expect(() => plugin.transform(readFileSync(bundle, 'utf8'), bundle)).toThrow(/default scrypt cost/);
    expect(() => plugin.transform(source, '/repo/src/util/backup.ts')).toThrow(/default scrypt cost/);
    expect(() => plugin.transform(`${source}\n${source}`, path.join(nodeModules, INSTALLED_ENCODERS[0]))).toThrow(/default scrypt cost/);
  });

  it.each([
    ['@subwallet/keyring pair', (password: string) => encodePair({ publicKey: new Uint8Array(32).fill(1), secretKey: new Uint8Array(64).fill(2) }, password)],
    ['@polkadot/keyring pair', (password: string) => polkadotEncodePair({ publicKey: new Uint8Array(32).fill(1), secretKey: new Uint8Array(64).fill(2) }, password)],
    ['jsonEncrypt', (password: string) => base64Decode(jsonEncrypt(stringToU8a('[]'), ['batch-pkcs8'], password).encoded)],
  ])('the %s encoder this build bundles encrypts at N = 2^15, p = 1, r = 8', (_name, encode) => {
    const json = { encoded: Buffer.from(encode('password')).toString('base64') } as KeyringPair$Json;

    expect(scryptParamsOf(json)).toEqual({ N: 32768, p: 1, r: 8 });
    expect(KEYSTORE_SCRYPT_PARAMS).toEqual({ N: 1 << 15, p: 1, r: 8 });
  });
});

// The proof itself needs the 3.0.x keyring, installed from the archives the 3.0.5 yarn.lock pins. A developer machine
// without them fails here with the command that adds them; CI without them skips.
const legacyArchives = findKeyring305Archives();
const runWithLegacyKeyring = legacyArchives.missing.length === 0 || !process.env.CI;

describe.runIf(runWithLegacyKeyring)('a key 4.2.0 re-encrypts opens in the 3.0.5 keyring (from the Yarn cache)', () => {
  let legacyDir: string;
  let legacy: Awaited<ReturnType<typeof loadKeyring305>>;

  beforeAll(async () => {
    legacyDir = installKeyring305(mkdtempSync(path.join(tmpdir(), 'fearless-keyring-305-')));
    // util 12.6.2 reports itself next to this build's 14.x; both are meant to be loaded here.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      legacy = await loadKeyring305(legacyDir);
    } finally {
      warn.mockRestore();
    }
  }, 60_000);
  afterAll(() => {
    if (legacyDir) rmSync(legacyDir, { recursive: true, force: true });
  });

  it('is the keyring 3.0.x shipped with, and it opens only N = 2^15, p = 1, r = 8', () => {
    expect(legacy.versions).toEqual({ '@subwallet/keyring': '0.1.7', '@polkadot/util-crypto': '12.6.2', bcryptjs: '2.4.3' });
    expect(legacy.require('@polkadot/util-crypto/scrypt/defaults').DEFAULT_PARAMS).toEqual(KEYSTORE_SCRYPT_PARAMS);
  });

  // 3.0.6 -> 4.2.0 -> 3.0.6: the master password is changed in 4.2.0 (every key re-encrypted), then 3.0.x runs again.
  it('3.0.6 wallets after a master password change in 4.2.0: unlock, sign and export the phrase in 3.0.x', () => {
    const master = profile306.provenance.masterPassword;
    const keys = shippedKeys(profile306, () => master);
    const rewritten = keys.map(({ json, password }) => writeAs420(json, openAs420(json, password), NEW_MASTER));
    // ui-keyring 0.1.14 stores the new master password as a bcrypt hash (bcryptjs 3, 6 rounds) in fw:keyring.
    const passwordHash = bcrypt.hashSync(NEW_MASTER, bcrypt.genSaltSync(6));

    rewritten.forEach((json) => expect(scryptParamsOf(json)).toEqual({ N: 32768, p: 1, r: 8 }));
    const before = openAs305(legacy, keys.map(({ json }) => json), master, profile306.storage['fw:keyring'].passwordHash);
    const after = openAs305(legacy, rewritten, NEW_MASTER, passwordHash);

    keys.forEach(({ address, type }, index) => {
      expect(after[index].type).toBe(type);
      expect(after[index].address.toLowerCase()).toBe(address.toLowerCase());
      expect(signatureVerify(payload, after[index].sign(payload), address).isValid).toBe(true);
      // Export phrase shows what it showed before the upgrade.
      expect(exportedPhrase(after[index], NEW_MASTER)).toBe(exportedPhrase(before[index], master));
    });
    // 3.0.6 kept the phrase with the Spare and Daily keys. Signer's phrase ("abandon ... about") has all-zero entropy,
    // which 3.0.x treats as none, before and after.
    expect(keys.map(({ wallet }, index) => [wallet.name, exportedPhrase(after[index], NEW_MASTER) === wallet.mnemonic])).toEqual(
      keys.map(({ wallet }) => [wallet.name, wallet.name !== 'Signer'])
    );
    expect(() => openAs305(legacy, rewritten, master, passwordHash)).toThrow();
  }, 120_000);

  // 2.6.3 -> 4.2.0 -> 3.0.6: each legacy password is upgraded to the master password in 4.2.0 (or the key is recovered),
  // and each key is exported as JSON with its own password.
  it('2.6.3 accounts after the legacy password upgrade and as JSON exports: open and sign in 3.0.x', () => {
    const keys = shippedKeys(profile263, (wallet) => wallet.password!);
    const passwordHash = bcrypt.hashSync(NEW_MASTER, bcrypt.genSaltSync(6));
    const opened = keys.map(({ json, password }) => openAs420(json, password));
    const upgraded = keys.map(({ json }, index) => writeAs420(json, opened[index], NEW_MASTER));
    const exported = keys.map(({ json, password }, index) => writeAs420(json, opened[index], password));

    [...upgraded, ...exported].forEach((json) => expect(scryptParamsOf(json)).toEqual({ N: 32768, p: 1, r: 8 }));
    const underMaster = openAs305(legacy, upgraded, NEW_MASTER, passwordHash);
    const fromFiles = keys.map(({ password }, index) => openAs305(legacy, [exported[index]], password)[0]);

    keys.forEach(({ address }, index) => {
      for (const pair of [underMaster[index], fromFiles[index]]) {
        expect(pair.address.toLowerCase()).toBe(address.toLowerCase());
        expect(signatureVerify(payload, pair.sign(payload), address).isValid).toBe(true);
      }
    });
    // 2.x stored no phrase with a key; there is none to export in any version.
    expect(opened.every(({ entropy }) => !entropy?.length)).toBe(true);
  }, 120_000);

  // ui-keyring's batch export (jsonEncrypt) is not offered by the extension; if it were, 3.0.x would still open it.
  it('a batch export 4.2.0 encrypts opens with 3.0.x jsonDecrypt', () => {
    const accounts = JSON.stringify(Object.values(profile306.storage).filter((value) => (value as { encoded?: string }).encoded));
    const exported = jsonEncrypt(stringToU8a(accounts), ['batch-pkcs8'], NEW_MASTER);

    expect(scryptParamsOf(exported as unknown as KeyringPair$Json)).toEqual({ N: 32768, p: 1, r: 8 });
    expect(u8aToString(legacy.utilCrypto.jsonDecrypt(exported, NEW_MASTER))).toBe(accounts);
  }, 60_000);

  it('without the rewrite, 3.0.x refuses the key 4.2.0 writes and 4.2.0 still opens it', () => {
    const [{ json, password }] = shippedKeys(profile306, () => profile306.provenance.masterPassword).filter(({ type }) => type === 'sr25519');
    const key = openAs420(json, password);
    // encodePair as @subwallet/keyring ships it: util-crypto 14's default cost.
    const { params, password: derived, salt } = scryptEncode(NEW_MASTER);
    const pkcs8 = u8aConcat(PKCS8_HEADER, key.secretKey, PKCS8_DIVIDER, key.publicKey, PKCS8_DIVIDER, key.entropy!);
    const { encrypted, nonce } = naclEncrypt(pkcs8, derived.subarray(0, 32));
    const unrewritten = pairToJson('sr25519', { address: json.address, meta: json.meta }, u8aConcat(scryptToU8a(salt, params), nonce, encrypted), true);

    expect(scryptParamsOf(unrewritten)).toEqual({ N: 131072, p: 1, r: 8 });
    const pair = new legacy.Keyring({ type: 'sr25519' }).addFromJson(unrewritten, true);
    expect(() => pair.decodePkcs8(NEW_MASTER)).toThrow('Invalid injected scrypt params found');
    // Keys an earlier 4.2.0 candidate wrote this way stay readable by this build.
    expect(u8aToHex(openAs420(unrewritten, NEW_MASTER).secretKey)).toBe(u8aToHex(key.secretKey));
  }, 60_000);
});
