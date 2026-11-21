// The Verify service: where a proposal or request really came from, against the URL the dApp claims. The relay passes
// along a signed attestation (ES256, Verify's key) when the dApp registered one; otherwise the service is asked by the
// message's hash. Any failure leaves the context UNKNOWN, which the signing checks treat as unverified.

import { base64urlnopad } from '@scure/base';
import { decodeJwtPayload, hashMessage } from './crypto';
import type { WcMetadata, WcVerifyContext } from './types';

export const VERIFY_SERVER = 'https://verify.walletconnect.org';
const TRUSTED_VERIFY_SERVERS = ['https://verify.walletconnect.com', VERIFY_SERVER];
const TIMEOUT_MS = 5_000;

type VerifyKey = { publicKey: JsonWebKey; expiresAt: number };
type Attested = { origin: string; isScam?: boolean };

export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

const encoder = new TextEncoder();

function trustedServer(url: string | undefined): string {
  return url && TRUSTED_VERIFY_SERVERS.includes(url) ? url : VERIFY_SERVER;
}

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export class VerifyClient {
  private key?: VerifyKey;

  constructor(private readonly fetcher: FetchLike = (input, init) => fetch(input, init)) {}

  private async getJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await this.fetcher(url, { signal: controller.signal });

      return response.status === 200 ? await response.json() : undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  private async publicKey(refresh: boolean): Promise<VerifyKey | undefined> {
    if (!refresh && this.key && this.key.expiresAt * 1000 > Date.now()) return this.key;
    const value = (await this.getJson(`${VERIFY_SERVER}/v3/public-key`)) as VerifyKey | undefined;

    if (!value || typeof value.publicKey !== 'object' || value.publicKey === null) return undefined;
    this.key = value;

    return value;
  }

  private async checkSignature(token: string, key: JsonWebKey): Promise<boolean> {
    const [header, payload, signature] = token.split('.');
    const algorithm = JSON.parse(new TextDecoder().decode(base64urlnopad.decode(header.replace(/=+$/, '')))) as { alg?: string };

    if (algorithm.alg !== 'ES256') return false;
    const raw = new Uint8Array(base64urlnopad.decode(signature.replace(/=+$/, '')));

    if (raw.length !== 64) return false;
    const imported = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: key.x, y: key.y, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, imported, raw, encoder.encode(`${header}.${payload}`));
  }

  /** The origin a signed attestation names for this exact message, or nothing when it does not hold. */
  private async fromAttestation(token: string, messageHash: string): Promise<Attested | undefined> {
    const claims = decodeJwtPayload(token);

    if (claims.id !== messageHash) return undefined;
    for (const refresh of [false, true]) {
      const key = await this.publicKey(refresh);

      if (!key) return undefined;
      const valid = await this.checkSignature(token, key.publicKey).catch(() => false);

      if (!valid) continue;
      if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return undefined;
      if (claims.isVerified !== true || typeof claims.origin !== 'string') return undefined;

      return { origin: claims.origin, isScam: claims.isScam === true };
    }

    return undefined;
  }

  private async fromService(server: string, messageHash: string): Promise<Attested | undefined> {
    const value = (await this.getJson(`${server}/attestation/${messageHash}?v2Supported=true`)) as
      | { origin?: unknown; isScam?: unknown }
      | undefined;

    if (!value || typeof value.origin !== 'string') return undefined;

    return { origin: value.origin, isScam: value.isScam === true };
  }

  /** The verification of a message as the relay delivered it, against the metadata of the dApp that sent it. */
  async context(params: { metadata: WcMetadata; message: string; attestation?: string }): Promise<WcVerifyContext> {
    const verifyUrl = trustedServer(params.metadata.verifyUrl);
    const context: WcVerifyContext = {
      verified: { verifyUrl, validation: 'UNKNOWN', origin: params.metadata.url || '' },
    };

    try {
      const messageHash = hashMessage(params.message);
      const attested = params.attestation
        ? await this.fromAttestation(params.attestation, messageHash)
        : await this.fromService(verifyUrl, messageHash);

      if (attested) {
        context.verified.origin = attested.origin;
        context.verified.isScam = attested.isScam;
        context.verified.validation = attested.origin === originOf(params.metadata.url) ? 'VALID' : 'INVALID';
      }
    } catch (error) {
      console.warn('WalletConnect verification is unavailable', error);
    }

    return context;
  }
}
