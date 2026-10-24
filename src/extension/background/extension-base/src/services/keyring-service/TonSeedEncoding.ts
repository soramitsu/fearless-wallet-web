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
