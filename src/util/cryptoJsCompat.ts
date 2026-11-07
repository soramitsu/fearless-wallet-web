// The two CryptoJS formats Fearless still reads, implemented with the audited @noble libraries so the discontinued
// crypto-js package no longer runs in the worker that holds the keys. tests/unit/crypto-js-compat.spec.ts checks
// both against crypto-js 4.2.0 itself, wrong passwords included.
import { cbc } from '@noble/ciphers/aes';
import { md5 } from '@noble/hashes/legacy';

const SALTED = new TextEncoder().encode('Salted__');
const encoder = new TextEncoder();

// CryptoJS's Utf8.stringify is decodeURIComponent(escape(...)): invalid UTF-8 throws, and a leading BOM is kept.
const strictUtf8 = () => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

// Standard base64; like CryptoJS's parser it also takes the text without its trailing `=`.
function base64Bytes(text: string): Uint8Array {
  const unpadded = text.replace(/={1,2}$/u, '');

  if (!/^[A-Za-z0-9+/]*$/u.test(unpadded) || unpadded.length % 4 === 1) throw new Error('Malformed CryptoJS text');
  const binary = atob(unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  return bytes;
}

function bytesBase64(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}

// OpenSSL EVP_BytesToKey with MD5 and one round, as CryptoJS's passphrase mode derives the AES-256 key and IV.
function evpBytesToKey(passphrase: Uint8Array, salt: Uint8Array): { key: Uint8Array; iv: Uint8Array } {
  const derived = new Uint8Array(48);
  let block: Uint8Array = new Uint8Array(0);

  for (let offset = 0; offset < derived.length; offset += 16) {
    const input = new Uint8Array(block.length + passphrase.length + salt.length);

    input.set(block, 0);
    input.set(passphrase, block.length);
    input.set(salt, block.length + passphrase.length);
    block = md5(input);
    derived.set(block, offset);
  }

  return { key: derived.subarray(0, 32), iv: derived.subarray(32, 48) };
}

/**
 * `CryptoJS.AES.decrypt(text, passphrase).toString(CryptoJS.enc.Utf8)` for the salted OpenSSL text that
 * `CryptoJS.AES.encrypt(plaintext, passphrase).toString()` wrote in 3.0.1-3.0.5. The format has no integrity check,
 * and like CryptoJS this removes as many trailing bytes as the last one says without checking them: a wrong
 * passphrase gives other text, an empty string or an error, never a sign of which. Callers confirm the result.
 */
export function decryptCryptoJsPassphraseText(text: string, passphrase: string): string {
  const bytes = base64Bytes(text);

  if (bytes.length < 32 || bytes.length % 16 || !SALTED.every((byte, index) => bytes[index] === byte)) {
    throw new Error('Malformed CryptoJS text');
  }

  const { key, iv } = evpBytesToKey(encoder.encode(passphrase), bytes.subarray(8, 16));
  const plain = cbc(key, iv, { disablePadding: true }).decrypt(bytes.subarray(16));

  try {
    const length = plain.length - plain[plain.length - 1];

    return length > 0 ? strictUtf8().decode(plain.subarray(0, length)) : '';
  } finally {
    plain.fill(0);
    key.fill(0);
  }
}

/** AES-256-CBC with PKCS#7, as `CryptoJS.AES.encrypt(plaintext, keyWordArray, { iv, mode: CBC })` did: the
 * ciphertext alone, in base64. */
export function encryptAesCbcText(plaintext: string, key: Uint8Array, iv: Uint8Array): string {
  if (key.length !== 32 || iv.length !== 16) throw new Error('Invalid AES-CBC key or IV');

  return bytesBase64(cbc(key, iv).encrypt(encoder.encode(plaintext)));
}

/** The bytes `encryptAesCbcText` encrypted, padding still attached: the caller checks it, as the cosigner format
 * requires. */
export function decryptAesCbcBlocks(ciphertext: string, key: Uint8Array, iv: Uint8Array): Uint8Array {
  if (key.length !== 32 || iv.length !== 16) throw new Error('Invalid AES-CBC key or IV');
  const bytes = base64Bytes(ciphertext);

  if (!bytes.length || bytes.length % 16) throw new Error('Invalid AES-CBC ciphertext');

  return cbc(key, iv, { disablePadding: true }).decrypt(bytes);
}
