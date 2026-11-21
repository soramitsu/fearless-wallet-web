// WalletConnect v2 cryptography: X25519 key agreement, ChaCha20-Poly1305 envelopes, topics, and the relay's Ed25519
// sign-in token. Everything here is built on the audited @noble and @scure libraries.

import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { ed25519, x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { concatBytes, randomBytes } from '@noble/hashes/utils';
import { base58, base64, base64nopad, base64urlnopad, hex } from '@scure/base';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Envelope type 0 carries a message under a known symmetric key; type 1 also names the sender's public key. */
export const ENVELOPE_TYPE_0 = 0;
export const ENVELOPE_TYPE_1 = 1;
/** Type 2 is an unencrypted envelope, used only outside the relay. It is never accepted here. */
export const ENVELOPE_TYPE_2 = 2;

const HEX_KEY = /^[0-9a-f]{64}$/;

export const isHexKey = (value: unknown): value is string => typeof value === 'string' && HEX_KEY.test(value);

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function fromHexKey(value: string): Uint8Array {
  if (!isHexKey(value)) throw new Error('WalletConnect key is not 32 bytes of lowercase hex');
  return hex.decode(value);
}

export const toHex = (bytes: Uint8Array): string => hex.encode(bytes);

export type KeyPair = { privateKey: string; publicKey: string };

export function generateKeyPair(): KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();

  return { privateKey: toHex(privateKey), publicKey: toHex(x25519.getPublicKey(privateKey)) };
}

/** 32 random bytes as hex: a pairing's symmetric key, or the relay sign-in token's subject. */
export const randomKey = (): string => toHex(randomBytes(KEY_BYTES));

/** The key two peers share: X25519, then HKDF-SHA256 with no salt and no info, 32 bytes. */
export function deriveSymKey(privateKey: string, peerPublicKey: string): string {
  // noble refuses a peer key that yields the all-zero secret (a low-order point).
  const shared = x25519.getSharedSecret(fromHexKey(privateKey), fromHexKey(peerPublicKey));

  return toHex(hkdf(sha256, shared, undefined, undefined, KEY_BYTES));
}

/** A symmetric key's topic: its SHA-256. */
export const topicOf = (symKey: string): string => toHex(sha256(fromHexKey(symKey)));

/** The SHA-256 of a relay message as sent, which identifies it for deduplication and for the Verify service. */
export const hashMessage = (message: string): string => toHex(sha256(encoder.encode(message)));

/** Standard base64 with padding, as peers send it; the padding may be missing. */
function decodeBase64(value: string): Uint8Array {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid envelope encoding');

  return value.endsWith('=') || value.length % 4 === 0 ? base64.decode(value) : base64nopad.decode(value);
}

export function encrypt(params: { symKey: string; message: string; type?: 0 | 1; senderPublicKey?: string }): string {
  const iv = randomBytes(IV_BYTES);
  const sealed = chacha20poly1305(fromHexKey(params.symKey), iv).encrypt(encoder.encode(params.message));

  if (params.type === ENVELOPE_TYPE_1) {
    if (!params.senderPublicKey) throw new Error('A type 1 envelope needs the sender public key');

    return base64.encode(concatBytes(Uint8Array.of(ENVELOPE_TYPE_1), fromHexKey(params.senderPublicKey), iv, sealed));
  }

  return base64.encode(concatBytes(Uint8Array.of(ENVELOPE_TYPE_0), iv, sealed));
}

export type Envelope = { type: 0 | 1; iv: Uint8Array; sealed: Uint8Array; senderPublicKey?: string };

export function decodeEnvelope(encoded: string): Envelope {
  const bytes = decodeBase64(encoded);
  const type = bytes[0];

  if (type === ENVELOPE_TYPE_0) {
    if (bytes.length < 1 + IV_BYTES + TAG_BYTES) throw new Error('Envelope is too short');

    return { type, iv: bytes.slice(1, 1 + IV_BYTES), sealed: bytes.slice(1 + IV_BYTES) };
  }
  if (type === ENVELOPE_TYPE_1) {
    if (bytes.length < 1 + KEY_BYTES + IV_BYTES + TAG_BYTES) throw new Error('Envelope is too short');

    return {
      type,
      senderPublicKey: toHex(bytes.slice(1, 1 + KEY_BYTES)),
      iv: bytes.slice(1 + KEY_BYTES, 1 + KEY_BYTES + IV_BYTES),
      sealed: bytes.slice(1 + KEY_BYTES + IV_BYTES),
    };
  }

  throw new Error('Unsupported envelope type');
}

/** Opens a type 0 envelope with the topic's symmetric key. A wrong key or a changed byte fails authentication. */
export function decrypt(symKey: string, encoded: string): string {
  const envelope = decodeEnvelope(encoded);

  if (envelope.type !== ENVELOPE_TYPE_0) throw new Error('Unexpected envelope type');

  return decoder.decode(chacha20poly1305(fromHexKey(symKey), envelope.iv).decrypt(envelope.sealed));
}

// ---- Relay sign-in ----------------------------------------------------------------------------------------------

/** The multicodec prefix of an Ed25519 public key (0xed 0x01). */
const ED25519_MULTICODEC = Uint8Array.of(0xed, 0x01);

/** A relay client's identity: its Ed25519 public key as a did:key. */
export function relayClientId(seed: Uint8Array): string {
  return `did:key:z${base58.encode(concatBytes(ED25519_MULTICODEC, ed25519.getPublicKey(seed)))}`;
}

const jwtPart = (value: unknown): string => base64urlnopad.encode(encoder.encode(JSON.stringify(value)));

/** The token the relay accepts in the `auth` query parameter: an EdDSA JWT for the relay URL, valid for a day. */
export function relayAuthToken(params: {
  seed: Uint8Array;
  audience: string;
  subject: string;
  issuedAt?: number;
  lifetimeSeconds?: number;
}): string {
  if (params.seed.length !== KEY_BYTES) throw new Error('Relay identity seed must be 32 bytes');
  const iat = params.issuedAt ?? Math.floor(Date.now() / 1000);
  const header = jwtPart({ alg: 'EdDSA', typ: 'JWT' });
  const payload = jwtPart({
    iss: relayClientId(params.seed),
    sub: params.subject,
    aud: params.audience,
    iat,
    exp: iat + (params.lifetimeSeconds ?? 86_400),
  });
  const signature = ed25519.sign(encoder.encode(`${header}.${payload}`), params.seed);

  return `${header}.${payload}.${base64urlnopad.encode(signature)}`;
}

/** A JWT's payload, unverified. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = typeof token === 'string' ? token.split('.') : [];

  if (parts.length !== 3) throw new Error('Not a JWT');
  const payload: unknown = JSON.parse(decoder.decode(base64urlnopad.decode(parts[1].replace(/=+$/, ''))));

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new Error('Invalid JWT payload');

  return payload as Record<string, unknown>;
}
