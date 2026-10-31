import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { keyExtractSuri, naclDecrypt, naclEncrypt } from '@polkadot/util-crypto';

/** Universal Wallet slots whose accounts a wallet password protects. Nexus follows the Taira key. */
export const UNIVERSAL_WALLET_PASSWORD_NETWORKS = ['bitcoin', 'bitcoinTestnet', 'solana', 'ton', 'iroha'] as const;

export type UniversalWalletPasswordNetwork = (typeof UNIVERSAL_WALLET_PASSWORD_NETWORKS)[number];

/** A wallet password sealed under a key only its own account secret opens (see sealKey). */
export type SealedUniversalWalletPassphrase = {
  version: 1;
  nonce: string;
  sealed: string;
};

export type UniversalWalletFunds = 'funded' | 'empty' | 'unknown';

const SEAL_INFO = utf8ToBytes('fearless:universal-wallet-passphrase:v1');

export const isUniversalWalletPasswordNetwork = (value: unknown): value is UniversalWalletPasswordNetwork =>
  (UNIVERSAL_WALLET_PASSWORD_NETWORKS as readonly unknown[]).includes(value);

/** The password after '///' in a SURI; '' when it has none or does not parse. */
export function suriPassword(suri?: string): string {
  if (!suri) return '';

  try {
    return keyExtractSuri(suri.trim()).password ?? '';
  } catch {
    return '';
  }
}

/**
 * The BIP39 passphrase of a wallet's Universal Wallet accounts: the Substrate SURI's password, else the
 * Ethereum SURI's (both SURIs carry the same words). BIP39 derivation NFKD-normalises it.
 */
export function resolveUniversalWalletPassphrase(substrateSuri?: string, ethereumSuri?: string): string {
  return suriPassword(substrateSuri) || suriPassword(ethereumSuri);
}

// The key comes from the account secret that the password itself derived, so the recovery words
// alone cannot open the record; the master password (via the encrypted account) or the password can.
function sealKey(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return hkdf(sha256, secretKey, publicKey, SEAL_INFO, 32);
}

export function sealUniversalWalletPassphrase(
  passphrase: string,
  secretKey: Uint8Array,
  publicKey: Uint8Array
): SealedUniversalWalletPassphrase {
  const key = sealKey(secretKey, publicKey);

  try {
    const { encrypted, nonce } = naclEncrypt(utf8ToBytes(passphrase), key);

    return { version: 1, nonce: bytesToHex(nonce), sealed: bytesToHex(encrypted) };
  } finally {
    key.fill(0);
  }
}

export function isSealedUniversalWalletPassphrase(value: unknown): value is SealedUniversalWalletPassphrase {
  const record = value as SealedUniversalWalletPassphrase | undefined;

  return !!record && typeof record === 'object' && record.version === 1 &&
    typeof record.nonce === 'string' && /^[0-9a-f]{48}$/.test(record.nonce) &&
    typeof record.sealed === 'string' && /^(?:[0-9a-f]{2})+$/.test(record.sealed);
}

/** The sealed password, or null when the record is malformed or belongs to another key. */
export function openUniversalWalletPassphrase(
  record: unknown,
  secretKey: Uint8Array,
  publicKey: Uint8Array
): string | null {
  if (!isSealedUniversalWalletPassphrase(record)) return null;

  const key = sealKey(secretKey, publicKey);

  try {
    const opened = naclDecrypt(hexToBytes(record.sealed), hexToBytes(record.nonce), key);

    return opened ? new TextDecoder('utf-8', { fatal: true }).decode(opened) : null;
  } catch {
    return null;
  } finally {
    key.fill(0);
  }
}

/** Networks a password wallet still shows at the address its recovery words alone open. */
export function universalWalletLegacyNetworks(value: unknown): UniversalWalletPasswordNetwork[] {
  return Array.isArray(value) ? UNIVERSAL_WALLET_PASSWORD_NETWORKS.filter((network) => value.includes(network)) : [];
}
