import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { scrypt } from '@noble/hashes/scrypt';
import { randomBytes } from '@noble/hashes/utils';
import { base64 } from '@scure/base';

export const VAULT_KEY = 'walletconnect:v2';
const context = new TextEncoder().encode(`fearless:${VAULT_KEY}`);
export type Envelope = { version: 2; salt: string; nonce: string; ciphertext: string };

export class ProtocolKey {
  private readonly key: Uint8Array;

  constructor(password: string, readonly salt = base64.encode(randomBytes(32))) {
    const bytes = base64.decode(salt);
    if (!password || bytes.length !== 32) throw new Error('WalletConnect vault is locked or invalid');
    this.key = scrypt(password, bytes, { N: 1 << 15, r: 8, p: 1, dkLen: 32 });
  }

  seal(text: string): Envelope {
    const nonce = randomBytes(24);
    const bytes = new TextEncoder().encode(text);
    try {
      return { version: 2, salt: this.salt, nonce: base64.encode(nonce),
        ciphertext: base64.encode(xchacha20poly1305(this.key, nonce, context).encrypt(bytes)) };
    } finally { bytes.fill(0); }
  }

  open(record: Envelope): string {
    if (record?.version !== 2 || record.salt !== this.salt) throw new Error('Invalid WalletConnect vault');
    const bytes = xchacha20poly1305(this.key, base64.decode(record.nonce), context).decrypt(base64.decode(record.ciphertext));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } finally { bytes.fill(0); }
  }

  clear() { this.key.fill(0); }
}

export function rotateProtocolVault(record: Envelope, previous: string, next: string): Envelope {
  const oldKey = new ProtocolKey(previous, record.salt);
  try {
    const text = oldKey.open(record);
    const newKey = new ProtocolKey(next);
    try {
      const sealed = newKey.seal(text);
      if (newKey.open(sealed) !== text) throw new Error('WalletConnect vault rotation failed');
      return sealed;
    } finally { newKey.clear(); }
  } finally { oldKey.clear(); }
}
