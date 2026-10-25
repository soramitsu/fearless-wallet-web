import CryptoJS from 'crypto-js';
import { sr25519Agreement } from '@polkadot/util-crypto';
import { hexToU8a, u8aToHex } from '@polkadot/util';

export type FinalEncryptedStructure = {
  encryptedData: string;
  dataIv: string;
  encryptedKeys: Record<string, { encryptedKey: string; iv: string }>;
};

// Compatibility with existing multisig envelopes only. Encryption uses the
// installed cryptographic primitives; this module has no transport or storage.
// The legacy CBC wire format has no authentication tag. Decrypted calls remain
// untrusted input and must pass the wallet's normal review/approval checks.
function keyMaterial(secret: Uint8Array, publicKey: Uint8Array): Uint8Array {
  if (secret.length !== 64 || publicKey.length !== 32) throw new Error('Invalid cosigner key size');
  return sr25519Agreement(secret, publicKey);
}
function wordArray(bytes: Uint8Array) { return CryptoJS.enc.Hex.parse(u8aToHex(bytes).slice(2)); }
function encrypt(plaintext: string, key: Uint8Array): { encrypted: string; iv: string } {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encoded = CryptoJS.AES.encrypt(plaintext, wordArray(key), { iv: wordArray(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
  return { encrypted: encoded.ciphertext.toString(CryptoJS.enc.Base64), iv: u8aToHex(iv).slice(2) };
}
function decrypt(ciphertext: string, iv: string, key: Uint8Array): string {
  if (!/^[a-f\d]{32}$/i.test(iv) || !/^[A-Za-z\d+/]+={0,2}$/.test(ciphertext) || ciphertext.length > 1_500_000) throw new Error('Invalid encrypted cosigner data');
  const bytes = CryptoJS.enc.Base64.parse(ciphertext);
  if (!bytes.sigBytes || bytes.sigBytes % 16) throw new Error('Invalid encrypted cosigner data');
  // Validate PKCS#7 ourselves: CryptoJS's unpad silently accepts malformed data.
  const plain = CryptoJS.AES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext: bytes }), wordArray(key), {
    iv: CryptoJS.enc.Hex.parse(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding,
  });
  const buffer = hexToU8a(plain.toString(CryptoJS.enc.Hex));
  try {
    const padding = buffer[buffer.length - 1];
    if (!padding || padding > 16 || !buffer.subarray(-padding).every((byte) => byte === padding)) throw new Error('Invalid encrypted cosigner data');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, -padding));
  } finally { buffer.fill(0); plain.words.fill(0); }
}
export function encryptForCosigners(data: string, recipients: Record<string, Uint8Array>, secret: Uint8Array): FinalEncryptedStructure {
  const entries = Object.entries(recipients);
  if (!entries.length || entries.length > 100 || data.length > 1_000_000) throw new Error('Invalid cosigner payload');
  const key = crypto.getRandomValues(new Uint8Array(32));
  try {
    const payload = encrypt(data, key);
    const encryptedKeys: FinalEncryptedStructure['encryptedKeys'] = Object.create(null);
    for (const [address, publicKey] of entries) {
      const shared = keyMaterial(secret, publicKey);
      try {
        const wrapped = encrypt(u8aToHex(key).slice(2), shared);
        encryptedKeys[address] = { encryptedKey: wrapped.encrypted, iv: wrapped.iv };
      } finally { shared.fill(0); }
    }
    return { encryptedData: payload.encrypted, dataIv: payload.iv, encryptedKeys };
  } finally { key.fill(0); }
}
export function decryptForCosigner(address: string, senderPublicKey: Uint8Array, envelope: FinalEncryptedStructure, secret: Uint8Array): string {
  if (!envelope?.encryptedKeys || !Object.hasOwn(envelope.encryptedKeys, address)) throw new Error('No envelope for this cosigner');
  const wrapped = envelope.encryptedKeys[address];
  const shared = keyMaterial(secret, senderPublicKey);
  let key: Uint8Array | undefined;
  try {
    const keyHex = decrypt(wrapped.encryptedKey, wrapped.iv, shared);
    if (!/^[a-f\d]{64}$/i.test(keyHex)) throw new Error('Invalid cosigner key');
    key = hexToU8a(keyHex);
    return JSON.parse(decrypt(envelope.encryptedData, envelope.dataIv, key));
  } finally { shared.fill(0); key?.fill(0); }
}
