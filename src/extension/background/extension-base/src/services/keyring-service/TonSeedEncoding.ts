import { jsonDecrypt, jsonEncrypt } from '@polkadot/util-crypto';
import { stringToU8a, u8aToString } from '@polkadot/util';
import CryptoJS from 'crypto-js';
import type { EncryptedJson } from '@polkadot/util-crypto/types';

// How a TON phrase is stored in `cipherSeed`:
// - version 1 (3.0.1-3.0.5): CryptoJS AES with its passphrase key derivation, one MD5 round per block and no
//   authentication, so a copied record allows cheap password guessing. Still read, never written.
// - version 2: scrypt (deployed N = 2^15, current N = 2^17; r = 8, p = 1) + xsalsa20-poly1305 JSON protecting every account
//   under the same master password, stored as {"version":2,"encoded":...,"encoding":...}.
export const TON_SEED_VERSION = 2;
export const TON_RECOVERY_VERSION = 3;

type StoredSeed = EncryptedJson & { version: typeof TON_SEED_VERSION | typeof TON_RECOVERY_VERSION };

export function parseStoredSeed(cipherSeed: string): StoredSeed | null {
  if (typeof cipherSeed !== 'string' || cipherSeed.length > 8192) throw new Error('Invalid TON seed format');

  if (!cipherSeed.startsWith('{')) {
    // Only the historical salted OpenSSL format is eligible for legacy reading.
    const bytes = Buffer.from(cipherSeed, 'base64');

    if (
      bytes.toString('base64') !== cipherSeed ||
      bytes.length < 32 ||
      bytes.length % 16 !== 0 ||
      bytes.subarray(0, 8).toString() !== 'Salted__'
    )
      throw new Error('Unsupported TON seed format');

    return null;
  }

  const value = JSON.parse(cipherSeed) as StoredSeed;

  if (
    !value ||
    ![TON_SEED_VERSION, TON_RECOVERY_VERSION].includes(value.version) ||
    value.encoding?.version !== '3' ||
    JSON.stringify(value.encoding.type) !== JSON.stringify(['scrypt', 'xsalsa20-poly1305']) ||
    JSON.stringify(value.encoding.content) !==
      JSON.stringify([value.version === TON_SEED_VERSION ? 'ton-mnemonic' : 'ton-legacy-recovery']) ||
    typeof value.encoded !== 'string'
  ) {
    throw new Error('Unsupported TON seed format');
  }

  const bytes = Buffer.from(value.encoded, 'base64');

  if (bytes.toString('base64') !== value.encoded || bytes.length < 85) throw new Error('Invalid TON seed encoding');

  // Read the deployed 3.0.6 preset and the current library's stronger preset only.
  // Reject any other injected cost before expensive work.
  if (![32768, 131072].includes(bytes.readUInt32LE(32)) || bytes.readUInt32LE(36) !== 1 || bytes.readUInt32LE(40) !== 8) {
    throw new Error('Unsupported TON seed KDF');
  }

  return value;
}

export function isLegacyTonSeed(cipherSeed: string) {
  return parseStoredSeed(cipherSeed) === null;
}


export function encryptTonSeedValue(seed: string, password: string): string {
  if (!password) throw new Error('A password is required to store a TON phrase');
  const { encoded, encoding } = jsonEncrypt(stringToU8a(seed), ['ton-mnemonic'], password);
  return JSON.stringify({ version: TON_SEED_VERSION, encoded, encoding });
}

export function decryptTonSeedValue(cipherSeed: string, password: string): string {
  if (!password) throw new Error('Unlock the wallet first');
  const stored = parseStoredSeed(cipherSeed);
  if (stored?.version === TON_RECOVERY_VERSION) throw new Error('This TON account requires its earlier password');
  return stored ? u8aToString(jsonDecrypt(stored, password)) : CryptoJS.AES.decrypt(cipherSeed, password).toString(CryptoJS.enc.Utf8);
}

export function protectTonRecoverySeed(cipherSeed: string, password: string, address: string, publicKeyHex: string): string {
  if (!password || !isLegacyTonSeed(cipherSeed)) throw new Error('Invalid TON recovery record');
  const archive = JSON.stringify({ address, publicKeyHex, cipherSeed });
  const encrypted = jsonEncrypt(stringToU8a(archive), ['ton-legacy-recovery'], password);
  if (u8aToString(jsonDecrypt(encrypted, password)) !== archive) throw new Error('TON recovery verification failed');
  return JSON.stringify({ version: TON_RECOVERY_VERSION, ...encrypted });
}

/** Rotate the protective wrapper while preserving an account that still needs its older password. */
export function rotateTonRecoverySeed(cipherSeed: string, oldPassword: string, newPassword: string,
  address: string, publicKeyHex: string): string | undefined {
  const stored = parseStoredSeed(cipherSeed);
  if (stored?.version !== TON_RECOVERY_VERSION) return undefined;
  const archive = u8aToString(jsonDecrypt(stored, oldPassword));
  const record = JSON.parse(archive) as { address?: string; publicKeyHex?: string; cipherSeed: string };
  if (record.address !== address || record.publicKeyHex !== publicKeyHex || !isLegacyTonSeed(record.cipherSeed))
    throw new Error('Invalid TON recovery record');
  if (!newPassword) throw new Error('A password is required to store a TON phrase');
  const encrypted = jsonEncrypt(stringToU8a(archive), ['ton-legacy-recovery'], newPassword);
  if (u8aToString(jsonDecrypt(encrypted, newPassword)) !== archive) throw new Error('TON recovery verification failed');
  return JSON.stringify({ version: TON_RECOVERY_VERSION, ...encrypted });
}
