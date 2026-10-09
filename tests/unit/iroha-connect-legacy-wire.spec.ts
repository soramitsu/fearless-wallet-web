import { createHash } from 'node:crypto';
import {
  LEGACY_IROHA_CONNECT_LIMITS,
  LEGACY_IROHA_CONNECT_PROFILES,
  buildLegacyIrohaConnectApprovalPreimage,
  buildLegacyIrohaConnectTokenProtocol,
  buildLegacyIrohaConnectWebSocket,
  decodeLegacyIrohaConnectFrame,
  encodeLegacyIrohaConnectApproveFrame,
  encodeLegacyIrohaConnectCiphertextFrame,
  encodeLegacyIrohaConnectCloseFrame,
  encodeLegacyIrohaConnectPingFrame,
  encodeLegacyIrohaConnectPongFrame,
  encodeLegacyIrohaConnectRejectFrame,
  parseLegacyIrohaConnectUri,
} from '@extension-base/services/iroha-connect-service/legacyWire';

const toBase64Url = (value: Uint8Array | string): string =>
  Buffer.from(value).toString('base64').replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');

const SID_BYTES = new Uint8Array(32).fill(0x11);
const APP_PUBLIC_KEY = new Uint8Array(32).fill(0x22);
const WALLET_PUBLIC_KEY = new Uint8Array(32).fill(0x33);
const WALLET_SIGNATURE = new Uint8Array(64).fill(0x44);
const TOKEN_BYTES = new Uint8Array(32).fill(0x55);
const SID = toBase64Url(SID_BYTES);
const TOKEN = toBase64Url(TOKEN_BYTES);

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const u32 = (value: number): Uint8Array => {
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value, true);
  return output;
};

const u64 = (value: number): Uint8Array => {
  const output = new Uint8Array(8);
  new DataView(output.buffer).setBigUint64(0, BigInt(value), true);
  return output;
};

const field = (payload: Uint8Array): Uint8Array => concatBytes(u64(payload.length), payload);
const struct = (fields: Uint8Array[]): Uint8Array => concatBytes(...fields.map(field));
const string = (value: string): Uint8Array => field(new TextEncoder().encode(value));
const tagged = (tag: number, payload: Uint8Array): Uint8Array => concatBytes(u32(tag), u64(payload.length), payload);

const fixed32 = (bytes: Uint8Array, legacy: boolean): Uint8Array =>
  legacy ? concatBytes(...Array.from(bytes, (byte) => field(Uint8Array.of(byte)))) : bytes;

const byteVector = (bytes: Uint8Array, legacy: boolean): Uint8Array =>
  legacy
    ? concatBytes(u64(bytes.length), ...Array.from(bytes, (byte) => field(Uint8Array.of(byte))))
    : concatBytes(u64(bytes.length), bytes);

const optionString = (value?: string): Uint8Array =>
  value === undefined ? Uint8Array.of(0) : concatBytes(Uint8Array.of(1), field(string(value)));

const appMeta = (): Uint8Array =>
  concatBytes(
    Uint8Array.of(1),
    field(struct([string('Uranai'), optionString('https://uranai.sora.org/markets/one'), optionString(undefined)]))
  );

const openFrame = ({
  chainId = LEGACY_IROHA_CONNECT_PROFILES.taira.chainId,
  legacyFixedArrays = false,
  permissions = Uint8Array.of(0),
  sequence = 1,
  sid = SID_BYTES,
}: {
  chainId?: string;
  legacyFixedArrays?: boolean;
  permissions?: Uint8Array;
  sequence?: number;
  sid?: Uint8Array;
} = {}): Uint8Array => {
  const body = struct([fixed32(APP_PUBLIC_KEY, legacyFixedArrays), appMeta(), struct([string(chainId)]), permissions]);
  return struct([fixed32(sid, legacyFixedArrays), u32(0), u64(sequence), tagged(0, tagged(0, body))]);
};

const ciphertextFrame = ({
  direction = 0,
  innerDirection = direction,
  legacyFixedArrays = false,
  legacyVector = false,
  payload = new TextEncoder().encode('{"kind":"contract_call_signature_request"}'),
  sequence = 2,
}: {
  direction?: number;
  innerDirection?: number;
  legacyFixedArrays?: boolean;
  legacyVector?: boolean;
  payload?: Uint8Array;
  sequence?: number;
} = {}): Uint8Array => {
  const body = struct([u32(innerDirection), byteVector(payload, legacyVector)]);
  return struct([fixed32(SID_BYTES, legacyFixedArrays), u32(direction), u64(sequence), tagged(1, body)]);
};

const walletUri = (
  network: keyof typeof LEGACY_IROHA_CONNECT_PROFILES,
  scheme: 'iroha' | 'irohaconnect' = 'iroha'
): string => {
  const profile = LEGACY_IROHA_CONNECT_PROFILES[network];
  return `${scheme}://connect?${new URLSearchParams({
    sid: SID,
    chain_id: profile.chainId,
    node: profile.toriiBaseUrl,
    v: '1',
    role: 'wallet',
    token: TOKEN,
  }).toString()}`;
};

class TestCursor {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readBytes(length: number): Uint8Array {
    const output = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return output;
  }

  readU32(): number {
    const bytes = this.readBytes(4);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  }

  readU64(): number {
    const bytes = this.readBytes(8);
    return Number(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(0, true));
  }

  readField(): Uint8Array {
    return this.readBytes(this.readU64());
  }
}

const readFields = (bytes: Uint8Array): Uint8Array[] => {
  const cursor = new TestCursor(bytes);
  const fields: Uint8Array[] = [];
  let consumed = 0;
  while (consumed < bytes.length) {
    const value = cursor.readField();
    fields.push(value);
    consumed += 8 + value.length;
  }
  expect(consumed).toBe(bytes.length);
  return fields;
};

const readTagged = (bytes: Uint8Array): { tag: number; body: Uint8Array } => {
  const cursor = new TestCursor(bytes);
  const tag = cursor.readU32();
  const body = cursor.readBytes(cursor.readU64());
  expect(12 + body.length).toBe(bytes.length);
  return { tag, body };
};

describe('legacy IrohaConnect wallet URI parsing', () => {
  it('accepts the exact Uranai Taira wallet route and builds its authenticated WebSocket request', () => {
    const parsed = parseLegacyIrohaConnectUri(walletUri('taira'));

    expect(parsed).toMatchObject({
      scheme: 'iroha',
      network: 'taira',
      chainId: 'fc56984b-2be7-431d-840e-21514d1883f0',
      node: 'https://taira.sora.org',
      role: 'wallet',
      version: '1',
      sid: SID,
      token: TOKEN,
    });
    expect(parsed.sidBytes).toEqual(SID_BYTES);

    const request = buildLegacyIrohaConnectWebSocket(parsed);
    const expectedProtocol = `iroha-connect.token.v1.${toBase64Url(TOKEN)}`;
    expect(request).toEqual({
      url: `wss://taira.sora.org/v1/connect/ws?sid=${SID}&role=wallet`,
      protocol: expectedProtocol,
      protocols: [expectedProtocol],
    });
    expect(buildLegacyIrohaConnectTokenProtocol(TOKEN)).toBe(expectedProtocol);
  });

  it('accepts the launch scheme and the canonical SORA Nexus route', () => {
    const parsed = parseLegacyIrohaConnectUri(walletUri('nexus', 'irohaconnect'));

    expect(parsed).toMatchObject({
      scheme: 'irohaconnect',
      network: 'nexus',
      chainId: 'sora:nexus:global',
      node: 'https://minamoto.sora.org',
    });
    expect(buildLegacyIrohaConnectWebSocket(parsed).url).toBe(
      `wss://minamoto.sora.org/v1/connect/ws?sid=${SID}&role=wallet`
    );
  });

  it.each([
    ['surrounding whitespace', ` ${walletUri('taira')}`],
    ['wrong scheme', walletUri('taira').replace('iroha:', 'https:')],
    ['non-canonical scheme case', walletUri('taira').replace('iroha:', 'Iroha:')],
    ['app role', walletUri('taira').replace('role=wallet', 'role=app')],
    ['wrong version', walletUri('taira').replace('v=1', 'v=2')],
    ['unknown relay field', `${walletUri('taira')}&relay=${TOKEN}`],
    ['duplicate token', `${walletUri('taira')}&token=${TOKEN}`],
    ['missing token', walletUri('taira').replace(`&token=${TOKEN}`, '')],
    ['short sid', walletUri('taira').replace(SID, 'short')],
    ['padded sid', walletUri('taira').replace(SID, `${SID}%3D`)],
    ['hex sid', walletUri('taira').replace(SID, '11'.repeat(32))],
    ['zero sid', walletUri('taira').replace(SID, toBase64Url(new Uint8Array(32)))],
    ['short token', walletUri('taira').replace(TOKEN, 'short')],
    ['zero token', walletUri('taira').replace(TOKEN, toBase64Url(new Uint8Array(32)))],
    ['node path', walletUri('taira').replace('taira.sora.org', 'taira.sora.org%2Fv1')],
    ['node trailing slash', walletUri('taira').replace('taira.sora.org', 'taira.sora.org%2F')],
    ['insecure node', walletUri('taira').replace('https%3A', 'http%3A')],
    [
      'chain/node mismatch',
      walletUri('taira').replace(
        LEGACY_IROHA_CONNECT_PROFILES.taira.chainId,
        encodeURIComponent(LEGACY_IROHA_CONNECT_PROFILES.nexus.chainId)
      ),
    ],
    ['URI fragment', `${walletUri('taira')}#wallet`],
  ])('rejects %s', (_label, uri) => {
    expect(() => parseLegacyIrohaConnectUri(uri)).toThrow('Invalid legacy IrohaConnect data');
  });

  it('does not trust a parsed session object after callers mutate it', () => {
    const parsed = parseLegacyIrohaConnectUri(walletUri('taira'));

    expect(() => buildLegacyIrohaConnectWebSocket({ ...parsed, node: 'https://minamoto.sora.org' })).toThrow(
      'session network, chain_id, and node do not match'
    );
    expect(() => buildLegacyIrohaConnectTokenProtocol(`${TOKEN}=`)).toThrow('canonical unpadded base64url');
  });
});

describe('legacy IrohaConnect frame decoding', () => {
  it('decodes the canonical Uranai Open frame and exposes session metadata', () => {
    const decoded = decodeLegacyIrohaConnectFrame(openFrame(), {
      expectedSid: SID,
      expectedNetwork: 'taira',
      expectedDirection: 'app-to-wallet',
    });

    expect(decoded).toMatchObject({
      kind: 'open',
      sidBase64Url: SID,
      direction: 'app-to-wallet',
      sequence: 1,
      appPublicKey: APP_PUBLIC_KEY,
      appMeta: {
        name: 'Uranai',
        url: 'https://uranai.sora.org/markets/one',
        iconHash: undefined,
      },
      network: 'taira',
      chainId: LEGACY_IROHA_CONNECT_PROFILES.taira.chainId,
    });
  });

  it('accepts the public relay legacy fixed-array Open encoding', () => {
    const decoded = decodeLegacyIrohaConnectFrame(openFrame({ legacyFixedArrays: true }), {
      expectedSid: SID_BYTES,
    });

    expect(decoded.kind).toBe('open');
    expect(decoded.sid).toEqual(SID_BYTES);
    expect(decoded.kind === 'open' && decoded.appPublicKey).toEqual(APP_PUBLIC_KEY);
  });

  it('decodes canonical and relay legacy ciphertext vectors without interpreting their plaintext', () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({
        schema: 'uranai.irohaconnect.contract-call-signature.v1',
        kind: 'contract_call_signature_request',
      })
    );

    for (const frame of [
      ciphertextFrame({ payload }),
      ciphertextFrame({ payload, legacyFixedArrays: true, legacyVector: true }),
    ]) {
      const decoded = decodeLegacyIrohaConnectFrame(frame, {
        expectedSid: SID,
        expectedDirection: 'app-to-wallet',
      });
      expect(decoded).toMatchObject({
        kind: 'ciphertext',
        direction: 'app-to-wallet',
        sequence: 2,
        aead: payload,
      });
    }
  });

  it('roundtrips wallet-to-app ciphertext while preserving sequence and binary payload', () => {
    const payload = new TextEncoder().encode('{"kind":"contract_call_signature_response"}');
    const encoded = encodeLegacyIrohaConnectCiphertextFrame({
      sid: SID,
      sequence: 7,
      aead: payload,
      legacyByteVectorEncoding: true,
    });
    const decoded = decodeLegacyIrohaConnectFrame(encoded, {
      expectedSid: SID,
      expectedDirection: 'wallet-to-app',
    });

    expect(decoded).toMatchObject({
      kind: 'ciphertext',
      direction: 'wallet-to-app',
      sequence: 7,
      aead: payload,
    });
  });

  it.each([
    ['oversized frame', new Uint8Array(LEGACY_IROHA_CONNECT_LIMITS.frameBytes + 1)],
    ['truncated frame', openFrame().slice(0, -1)],
    ['zero sid', openFrame({ sid: new Uint8Array(32) })],
    ['zero sequence', openFrame({ sequence: 0 })],
    ['unexpected session', openFrame()],
    ['direction mismatch', ciphertextFrame({ direction: 0, innerDirection: 1 })],
    ['unsupported chain', openFrame({ chainId: 'attacker:network' })],
    ['permissions in legacy Open', openFrame({ permissions: Uint8Array.of(1) })],
  ])('rejects malicious or mismatched %s', (label, frame) => {
    const options = label === 'unexpected session' ? { expectedSid: toBase64Url(new Uint8Array(32).fill(0x99)) } : {};
    expect(() => decodeLegacyIrohaConnectFrame(frame, options)).toThrow('Invalid legacy IrohaConnect data');
  });

  it('rejects a declared ciphertext vector beyond the payload cap before allocating it', () => {
    const oversizedVector = concatBytes(u64(LEGACY_IROHA_CONNECT_LIMITS.ciphertextBytes + 1));
    const body = struct([u32(0), oversizedVector]);
    const frame = struct([SID_BYTES, u32(0), u64(2), tagged(1, body)]);

    expect(() => decodeLegacyIrohaConnectFrame(frame)).toThrow('ciphertext aead exceeds');
  });
});

describe('legacy IrohaConnect wallet frame encoding', () => {
  it('builds the exact approval preimage signed by the selected Ed25519 account', () => {
    const preimage = buildLegacyIrohaConnectApprovalPreimage({
      sid: SID,
      appPublicKey: APP_PUBLIC_KEY,
      walletPublicKey: WALLET_PUBLIC_KEY,
      accountId: 'testu1connected',
    });

    expect(createHash('sha256').update(preimage).digest('hex')).toBe(
      '3491bf42576040c2703064d7334829648bea10ffa8b62fb666dac02618ef1a55'
    );
    expect(new TextDecoder().decode(preimage)).toContain('iroha-connect|approve|v1');
  });

  it('encodes a signed Taira approval with the deployed legacy signature shape', () => {
    const frame = encodeLegacyIrohaConnectApproveFrame({
      sid: SID,
      network: 'taira',
      walletPublicKey: WALLET_PUBLIC_KEY,
      walletSignature: WALLET_SIGNATURE,
      accountId: 'testu1connected',
    });
    const topFields = readFields(frame);
    const kind = readTagged(topFields[3]);
    const control = readTagged(kind.body);
    const approvalFields = readFields(control.body);
    const signatureFields = readFields(approvalFields[4]);

    expect(topFields[0]).toEqual(SID_BYTES);
    expect(new TestCursor(topFields[1]).readU32()).toBe(1);
    expect(new TestCursor(topFields[2]).readU64()).toBe(1);
    expect(kind.tag).toBe(0);
    expect(control.tag).toBe(1);
    expect(approvalFields[0]).toEqual(WALLET_PUBLIC_KEY);
    expect(signatureFields[0]).toHaveLength(4);
    expect(signatureFields[1]).toHaveLength(8 + WALLET_SIGNATURE.length * 9);
    expect(createHash('sha256').update(frame).digest('hex')).toBe(
      '4d43e19883fa997cbbb6c003ec0c8ae9202d2205343642e5fabc70b7a996b6ae'
    );
  });

  it('uses the canonical signature shape for SORA Nexus and permits explicit relay fixed arrays', () => {
    const canonical = encodeLegacyIrohaConnectApproveFrame({
      sid: SID,
      network: 'nexus',
      walletPublicKey: WALLET_PUBLIC_KEY,
      walletSignature: WALLET_SIGNATURE,
      accountId: 'testu1connected',
    });
    const canonicalApproval = readFields(readTagged(readTagged(readFields(canonical)[3]).body).body);
    const canonicalSignature = readFields(canonicalApproval[4]);
    expect(canonicalSignature[0]).toHaveLength(1);
    expect(canonicalSignature[1]).toHaveLength(8 + WALLET_SIGNATURE.length);

    const legacyFixed = encodeLegacyIrohaConnectApproveFrame({
      sid: SID,
      network: 'taira',
      walletPublicKey: WALLET_PUBLIC_KEY,
      walletSignature: WALLET_SIGNATURE,
      accountId: 'testu1connected',
      legacyFixedArrayEncoding: true,
    });
    const fields = readFields(legacyFixed);
    const approval = readFields(readTagged(readTagged(fields[3]).body).body);
    expect(fields[0]).toHaveLength(32 * 9);
    expect(approval[0]).toHaveLength(32 * 9);
  });

  it('encodes explicit wallet reject and close controls', () => {
    const reject = encodeLegacyIrohaConnectRejectFrame({
      sid: SID,
      sequence: 2,
      code: 4001,
      codeId: 'user_rejected',
      reason: 'The user rejected this connection.',
    });
    const close = encodeLegacyIrohaConnectCloseFrame({
      sid: SID,
      sequence: 3,
      code: 1000,
      reason: 'Session complete.',
      retryable: false,
    });

    expect(readTagged(readTagged(readFields(reject)[3]).body).tag).toBe(2);
    expect(readTagged(readTagged(readFields(close)[3]).body).tag).toBe(3);
  });

  it('encodes protocol Ping and Pong controls for peer interoperability', () => {
    const ping = encodeLegacyIrohaConnectPingFrame({ sid: SID, sequence: 4, nonce: 9 });
    const fields = readFields(ping);
    const control = readTagged(readTagged(fields[3]).body);
    const [nonce] = readFields(control.body);

    expect(new TestCursor(fields[1]).readU32()).toBe(1);
    expect(new TestCursor(fields[2]).readU64()).toBe(4);
    expect(control.tag).toBe(4);
    expect(new TestCursor(nonce).readU64()).toBe(9);
    expect(decodeLegacyIrohaConnectFrame(ping)).toMatchObject({
      kind: 'ping',
      direction: 'wallet-to-app',
      sequence: 4,
      nonce: 9,
    });

    const pong = encodeLegacyIrohaConnectPongFrame({ sid: SID, sequence: 5, nonce: 9 });
    expect(decodeLegacyIrohaConnectFrame(pong)).toMatchObject({ kind: 'pong', sequence: 5, nonce: 9 });
  });

  it('rejects unsigned approval material and oversized wallet payloads', () => {
    expect(() =>
      encodeLegacyIrohaConnectApproveFrame({
        sid: SID,
        network: 'taira',
        walletPublicKey: WALLET_PUBLIC_KEY,
        walletSignature: new Uint8Array(64),
        accountId: 'testu1connected',
      })
    ).toThrow('walletSignature must not be all zeroes');
    expect(() =>
      encodeLegacyIrohaConnectCiphertextFrame({
        sid: SID,
        sequence: 2,
        aead: new Uint8Array(LEGACY_IROHA_CONNECT_LIMITS.ciphertextBytes + 1),
      })
    ).toThrow('aead exceeds');
  });
});
