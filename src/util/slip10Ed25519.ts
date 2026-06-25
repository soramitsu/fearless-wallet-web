import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha2';

const HARDENED_OFFSET = 0x80000000;
const ED25519_CURVE = new TextEncoder().encode('ed25519 seed');

type Slip10Ed25519DerivationErrorCode =
  | 'invalid_derivation_path'
  | 'non_hardened_derivation_path'
  | 'invalid_derivation_path_index';

type Slip10Ed25519ErrorFactory = (code: Slip10Ed25519DerivationErrorCode) => Error;

function deriveSlip10Ed25519Seed(
  seed: Uint8Array,
  path: string,
  createError: Slip10Ed25519ErrorFactory = (code) => new Error(code)
): Uint8Array {
  let state = hmac(sha512, ED25519_CURVE, seed);
  let key = state.slice(0, 32);
  let chainCode = state.slice(32);

  for (const index of parseHardenedPath(path, createError)) {
    state = hmac(sha512, chainCode, concatBytes(new Uint8Array([0]), key, uint32Be(index + HARDENED_OFFSET)));
    key = state.slice(0, 32);
    chainCode = state.slice(32);
  }

  return key;
}

function parseHardenedPath(path: string, createError: Slip10Ed25519ErrorFactory): number[] {
  const parts = path.split('/');

  if (parts[0] !== 'm' || parts.length < 2) throw createError('invalid_derivation_path');

  return parts.slice(1).map((part) => {
    if (!/^\d+'$/.test(part)) throw createError('non_hardened_derivation_path');

    const index = Number(part.slice(0, -1));

    if (!Number.isSafeInteger(index) || index < 0 || index >= HARDENED_OFFSET) {
      throw createError('invalid_derivation_path_index');
    }

    return index;
  });
}

function uint32Be(value: number): Uint8Array {
  const result = new Uint8Array(4);

  result[0] = (value >>> 24) & 0xff;
  result[1] = (value >>> 16) & 0xff;
  result[2] = (value >>> 8) & 0xff;
  result[3] = value & 0xff;

  return result;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

export { bytesToHex, deriveSlip10Ed25519Seed, hexToBytes };
export type { Slip10Ed25519DerivationErrorCode, Slip10Ed25519ErrorFactory };
