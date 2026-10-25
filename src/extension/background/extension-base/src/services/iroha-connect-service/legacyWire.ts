import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';

export type LegacyIrohaConnectNetwork = 'taira' | 'nexus';
export type LegacyIrohaConnectDirection = 'app-to-wallet' | 'wallet-to-app';
export type LegacyIrohaConnectBinaryInput = Uint8Array | ArrayBuffer | ArrayBufferView;

export interface LegacyIrohaConnectProfile {
  network: LegacyIrohaConnectNetwork;
  chainId: string;
  toriiBaseUrl: string;
}

export interface ParsedLegacyIrohaConnectUri {
  scheme: 'iroha' | 'irohaconnect';
  network: LegacyIrohaConnectNetwork;
  chainId: string;
  node: string;
  role: 'wallet';
  version: '1';
  sid: string;
  sidBytes: Uint8Array;
  token: string;
}

export interface LegacyIrohaConnectWebSocketRequest {
  url: string;
  protocol: string;
  protocols: [string];
}

export interface LegacyIrohaConnectAppMeta {
  name: string;
  url?: string;
  iconHash?: string;
}

export interface DecodedLegacyIrohaConnectOpenFrame {
  kind: 'open';
  sid: Uint8Array;
  sidBase64Url: string;
  direction: 'app-to-wallet';
  sequence: number;
  appPublicKey: Uint8Array;
  appMeta: LegacyIrohaConnectAppMeta | null;
  network: LegacyIrohaConnectNetwork;
  chainId: string;
}

export interface DecodedLegacyIrohaConnectCiphertextFrame {
  kind: 'ciphertext';
  sid: Uint8Array;
  sidBase64Url: string;
  direction: LegacyIrohaConnectDirection;
  sequence: number;
  aead: Uint8Array;
}

export interface DecodedLegacyIrohaConnectHeartbeatFrame {
  kind: 'ping' | 'pong';
  sid: Uint8Array;
  sidBase64Url: string;
  direction: LegacyIrohaConnectDirection;
  sequence: number;
  nonce: number;
}

export type DecodedLegacyIrohaConnectFrame =
  | DecodedLegacyIrohaConnectOpenFrame
  | DecodedLegacyIrohaConnectCiphertextFrame
  | DecodedLegacyIrohaConnectHeartbeatFrame;

export interface DecodeLegacyIrohaConnectFrameOptions {
  expectedSid?: string | LegacyIrohaConnectBinaryInput;
  expectedNetwork?: LegacyIrohaConnectNetwork;
  expectedDirection?: LegacyIrohaConnectDirection;
}

export interface LegacyIrohaConnectEncodingOptions {
  /** Compatibility for relays which encode `[u8; 32]` as 32 length-prefixed fields. */
  legacyFixedArrayEncoding?: boolean;
  /** Compatibility for relays which encode byte vectors as length-prefixed byte fields. */
  legacyByteVectorEncoding?: boolean;
}

export interface EncodeLegacyIrohaConnectApproveFrameInput extends LegacyIrohaConnectEncodingOptions {
  sid: string | LegacyIrohaConnectBinaryInput;
  network: LegacyIrohaConnectNetwork;
  sequence?: number;
  walletPublicKey: LegacyIrohaConnectBinaryInput;
  accountId: string;
  walletSignature: LegacyIrohaConnectBinaryInput;
  /** Taira defaults to its deployed legacy u32/byte-vector signature shape. */
  legacySignatureEncoding?: boolean;
}

export interface EncodeLegacyIrohaConnectCiphertextFrameInput extends LegacyIrohaConnectEncodingOptions {
  sid: string | LegacyIrohaConnectBinaryInput;
  sequence: number;
  aead: LegacyIrohaConnectBinaryInput;
}

export interface EncodeLegacyIrohaConnectRejectFrameInput extends LegacyIrohaConnectEncodingOptions {
  sid: string | LegacyIrohaConnectBinaryInput;
  sequence: number;
  code: number;
  codeId: string;
  reason: string;
}

export interface EncodeLegacyIrohaConnectCloseFrameInput extends LegacyIrohaConnectEncodingOptions {
  sid: string | LegacyIrohaConnectBinaryInput;
  sequence: number;
  code: number;
  reason: string;
  retryable?: boolean;
}

export interface EncodeLegacyIrohaConnectPingFrameInput extends LegacyIrohaConnectEncodingOptions {
  sid: string | LegacyIrohaConnectBinaryInput;
  sequence: number;
  nonce: number;
}

export interface BuildLegacyIrohaConnectApprovalPreimageInput {
  sid: string | LegacyIrohaConnectBinaryInput;
  appPublicKey: LegacyIrohaConnectBinaryInput;
  walletPublicKey: LegacyIrohaConnectBinaryInput;
  accountId: string;
}

export const LEGACY_IROHA_CONNECT_PROFILES = {
  taira: {
    network: 'taira',
    chainId: UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId,
    toriiBaseUrl: UNIVERSAL_WALLET_IROHA_NETWORKS.taira.toriiBaseUrl,
  },
  nexus: {
    network: 'nexus',
    chainId: UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId,
    toriiBaseUrl: UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.toriiBaseUrl,
  },
} as const satisfies Record<LegacyIrohaConnectNetwork, LegacyIrohaConnectProfile>;

export const LEGACY_IROHA_CONNECT_LIMITS = {
  uriBytes: 4096,
  frameBytes: 64_000,
  ciphertextBytes: 48_000,
  accountIdBytes: 1024,
  appNameBytes: 128,
  appUrlBytes: 2048,
  iconHashBytes: 256,
  reasonBytes: 1024,
  codeIdBytes: 128,
} as const;

const URI_FIELDS = ['sid', 'chain_id', 'node', 'v', 'role', 'token'] as const;
const URI_FIELD_SET = new Set<string>(URI_FIELDS);
const CONNECT_SCHEME_PATTERN = /^(iroha|irohaconnect):\/\/connect\?/u;
const CANONICAL_BASE64URL_32_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const CODE_ID_PATTERN = /^[a-z][a-z0-9_]*$/u;
const APPROVAL_DOMAIN = new TextEncoder().encode('iroha-connect|approve|v1');
const FRAME_KIND_CONTROL = 0;
const FRAME_KIND_CIPHERTEXT = 1;
const CONTROL_OPEN = 0;
const CONTROL_APPROVE = 1;
const CONTROL_REJECT = 2;
const CONTROL_CLOSE = 3;
const CONTROL_PING = 4;
const CONTROL_PONG = 5;
const DIRECTION_APP_TO_WALLET = 0;
const DIRECTION_WALLET_TO_APP = 1;
const ROLE_WALLET = 1;
const SIGNATURE_ALGORITHM_ED25519 = 0;
const FIXED_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;
const textEncoder = new TextEncoder();
const strictTextDecoder = new TextDecoder('utf-8', { fatal: true });

const fail = (message: string): never => {
  throw new Error(`Invalid legacy IrohaConnect data: ${message}`);
};

const containsControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

const concatBytes = (...chunks: Uint8Array[]): Uint8Array => {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!Number.isSafeInteger(length) || length > LEGACY_IROHA_CONNECT_LIMITS.frameBytes) {
    return fail('encoded data exceeds the frame limit');
  }

  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
};

const ensureUnsignedInteger = (value: number, label: string, maximum = Number.MAX_SAFE_INTEGER): number => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    return fail(`${label} must be an unsigned integer no greater than ${maximum}`);
  }
  return value;
};

const ensureSequence = (sequence: number | undefined): number => {
  const normalized = sequence ?? 1;
  ensureUnsignedInteger(normalized, 'sequence');
  if (normalized === 0) {
    return fail('sequence must be greater than zero');
  }
  return normalized;
};

const normalizeBytes = (
  input: LegacyIrohaConnectBinaryInput,
  label: string,
  options: { exact?: number; maximum?: number; nonZero?: boolean } = {}
): Uint8Array => {
  let bytes: Uint8Array;
  if (input instanceof Uint8Array) {
    bytes = new Uint8Array(input);
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input.slice(0));
  } else if (ArrayBuffer.isView(input)) {
    bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice();
  } else {
    return fail(`${label} must be binary data`);
  }

  if (options.exact !== undefined && bytes.length !== options.exact) {
    return fail(`${label} must be exactly ${options.exact} bytes`);
  }
  if (options.maximum !== undefined && bytes.length > options.maximum) {
    return fail(`${label} exceeds ${options.maximum} bytes`);
  }
  if (options.nonZero && bytes.every((byte) => byte === 0)) {
    return fail(`${label} must not be all zeroes`);
  }
  return bytes;
};

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const decodeCanonicalBase64Url32 = (value: string, label: string, nonZero = true): Uint8Array => {
  if (!CANONICAL_BASE64URL_32_PATTERN.test(value)) {
    return fail(`${label} must be canonical unpadded base64url for 32 bytes`);
  }

  let decoded: Uint8Array;
  try {
    const padded = `${value.replace(/-/gu, '+').replace(/_/gu, '/')}=`;
    decoded = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return fail(`${label} is not valid base64url`);
  }

  if (decoded.length !== FIXED_KEY_BYTES || encodeBase64Url(decoded) !== value) {
    return fail(`${label} must be canonical unpadded base64url for 32 bytes`);
  }
  if (nonZero && decoded.every((byte) => byte === 0)) {
    return fail(`${label} must not be all zeroes`);
  }
  return decoded;
};

const normalizeFixed32 = (input: string | LegacyIrohaConnectBinaryInput, label: string, nonZero = true): Uint8Array =>
  typeof input === 'string'
    ? decodeCanonicalBase64Url32(input, label, nonZero)
    : normalizeBytes(input, label, { exact: FIXED_KEY_BYTES, nonZero });

const profileForChainId = (chainId: string): LegacyIrohaConnectProfile => {
  for (const profile of Object.values(LEGACY_IROHA_CONNECT_PROFILES)) {
    if (profile.chainId === chainId) {
      return profile;
    }
  }
  return fail('chain_id is not a canonical Taira or SORA Nexus chain id');
};

const profileForNetwork = (network: LegacyIrohaConnectNetwork): LegacyIrohaConnectProfile => {
  const profile = LEGACY_IROHA_CONNECT_PROFILES[network];
  if (!profile) {
    return fail('network is not Taira or SORA Nexus');
  }
  return profile;
};

const assertSessionStillCanonical = (session: ParsedLegacyIrohaConnectUri): LegacyIrohaConnectProfile => {
  const profile = profileForNetwork(session.network);
  if (session.chainId !== profile.chainId || session.node !== profile.toriiBaseUrl) {
    return fail('session network, chain_id, and node do not match');
  }
  decodeCanonicalBase64Url32(session.sid, 'sid');
  decodeCanonicalBase64Url32(session.token, 'token');
  if (session.role !== 'wallet' || session.version !== '1') {
    return fail('session is not a version 1 wallet session');
  }
  return profile;
};

export const parseLegacyIrohaConnectUri = (input: string): ParsedLegacyIrohaConnectUri => {
  if (typeof input !== 'string' || input.length === 0 || input !== input.trim()) {
    return fail('URI must be a non-empty string without surrounding whitespace');
  }
  if (textEncoder.encode(input).length > LEGACY_IROHA_CONNECT_LIMITS.uriBytes) {
    return fail('URI exceeds the size limit');
  }

  const schemeMatch = CONNECT_SCHEME_PATTERN.exec(input);
  if (!schemeMatch) {
    return fail('URI must use iroha://connect or irohaconnect://connect');
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail('URI is malformed');
  }

  if (
    (url.protocol !== 'iroha:' && url.protocol !== 'irohaconnect:') ||
    url.host !== 'connect' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '' ||
    url.hash !== ''
  ) {
    return fail('URI authority, path, or fragment is not canonical');
  }

  const queryIndex = input.indexOf('?');
  const query = queryIndex === -1 ? '' : input.slice(queryIndex + 1);
  const segments = query.split('&');
  if (segments.length !== URI_FIELDS.length || segments.some((segment) => segment.length === 0)) {
    return fail(`URI must contain exactly ${URI_FIELDS.join(', ')}`);
  }

  const seen = new Set<string>();
  for (const segment of segments) {
    const separator = segment.indexOf('=');
    if (separator <= 0 || separator === segment.length - 1) {
      return fail('every URI field must have a non-empty value');
    }
    const rawName = segment.slice(0, separator);
    if (!URI_FIELD_SET.has(rawName)) {
      return fail(`unexpected URI field ${rawName}`);
    }
    if (seen.has(rawName)) {
      return fail(`duplicate URI field ${rawName}`);
    }
    seen.add(rawName);
  }

  for (const field of URI_FIELDS) {
    if (!seen.has(field)) {
      return fail(`URI is missing ${field}`);
    }
  }

  const sid = url.searchParams.get('sid') ?? '';
  const chainId = url.searchParams.get('chain_id') ?? '';
  const node = url.searchParams.get('node') ?? '';
  const version = url.searchParams.get('v') ?? '';
  const role = url.searchParams.get('role') ?? '';
  const token = url.searchParams.get('token') ?? '';
  const profile = profileForChainId(chainId);

  if (node !== profile.toriiBaseUrl) {
    return fail(`node must be exactly ${profile.toriiBaseUrl} for ${profile.network}`);
  }
  if (version !== '1') {
    return fail('v must be exactly 1');
  }
  if (role !== 'wallet') {
    return fail('role must be exactly wallet');
  }

  const sidBytes = decodeCanonicalBase64Url32(sid, 'sid');
  decodeCanonicalBase64Url32(token, 'token');

  return {
    scheme: schemeMatch[1] as 'iroha' | 'irohaconnect',
    network: profile.network,
    chainId: profile.chainId,
    node: profile.toriiBaseUrl,
    role: 'wallet',
    version: '1',
    sid,
    sidBytes,
    token,
  };
};

export const buildLegacyIrohaConnectTokenProtocol = (token: string): string => {
  decodeCanonicalBase64Url32(token, 'token');
  return `iroha-connect.token.v1.${encodeBase64Url(textEncoder.encode(token))}`;
};

export const buildLegacyIrohaConnectWebSocket = (
  session: ParsedLegacyIrohaConnectUri
): LegacyIrohaConnectWebSocketRequest => {
  const profile = assertSessionStillCanonical(session);
  const url = new URL('/v1/connect/ws', `${profile.toriiBaseUrl}/`);
  url.protocol = 'wss:';
  url.searchParams.set('sid', session.sid);
  url.searchParams.set('role', 'wallet');
  const protocol = buildLegacyIrohaConnectTokenProtocol(session.token);

  return { url: url.toString(), protocol, protocols: [protocol] };
};

const encodeU16 = (value: number): Uint8Array => {
  const output = new Uint8Array(2);
  new DataView(output.buffer).setUint16(0, ensureUnsignedInteger(value, 'u16', 0xffff), true);
  return output;
};

const encodeU32 = (value: number): Uint8Array => {
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, ensureUnsignedInteger(value, 'u32', 0xffff_ffff), true);
  return output;
};

const encodeU64 = (value: number): Uint8Array => {
  const output = new Uint8Array(8);
  new DataView(output.buffer).setBigUint64(0, BigInt(ensureUnsignedInteger(value, 'u64')), true);
  return output;
};

const encodeLengthPrefixed = (payload: Uint8Array): Uint8Array => concatBytes(encodeU64(payload.length), payload);

const encodeStruct = (fields: Uint8Array[]): Uint8Array =>
  concatBytes(...fields.map((field) => encodeLengthPrefixed(field)));

const encodeString = (value: string, label: string, maximum: number): Uint8Array => {
  if (value !== value.trim() || value.length === 0 || containsControlCharacter(value)) {
    return fail(`${label} must be non-empty, trimmed text without control characters`);
  }
  const bytes = textEncoder.encode(value);
  if (bytes.length > maximum) {
    return fail(`${label} exceeds ${maximum} UTF-8 bytes`);
  }
  return encodeLengthPrefixed(bytes);
};

const encodeFixedArray32 = (bytes: Uint8Array, legacy: boolean): Uint8Array => {
  if (!legacy) {
    return bytes;
  }
  return concatBytes(...Array.from(bytes, (byte) => encodeLengthPrefixed(Uint8Array.of(byte))));
};

const encodeByteVector = (bytes: Uint8Array, legacy: boolean): Uint8Array => {
  if (!legacy) {
    return concatBytes(encodeU64(bytes.length), bytes);
  }
  return concatBytes(
    encodeU64(bytes.length),
    ...Array.from(bytes, (byte) => encodeLengthPrefixed(Uint8Array.of(byte)))
  );
};

const wrapTaggedPayload = (tag: number, payload: Uint8Array): Uint8Array =>
  concatBytes(encodeU32(tag), encodeU64(payload.length), payload);

const encodeFrame = (
  sid: Uint8Array,
  direction: LegacyIrohaConnectDirection,
  sequence: number,
  kind: number,
  payload: Uint8Array,
  legacyFixedArrayEncoding: boolean
): Uint8Array => {
  const directionTag = direction === 'app-to-wallet' ? DIRECTION_APP_TO_WALLET : DIRECTION_WALLET_TO_APP;
  const output = encodeStruct([
    encodeFixedArray32(sid, legacyFixedArrayEncoding),
    encodeU32(directionTag),
    encodeU64(ensureSequence(sequence)),
    wrapTaggedPayload(kind, payload),
  ]);
  if (output.length > LEGACY_IROHA_CONNECT_LIMITS.frameBytes) {
    return fail('encoded frame exceeds the frame limit');
  }
  return output;
};

const taggedApprovalField = (tag: string, value: Uint8Array): Uint8Array => {
  const tagBytes = textEncoder.encode(tag);
  return concatBytes(encodeU16(tagBytes.length), tagBytes, encodeU64(value.length), value);
};

const normalizeAccountId = (accountId: string): string => {
  encodeString(accountId, 'accountId', LEGACY_IROHA_CONNECT_LIMITS.accountIdBytes);
  return accountId;
};

export const buildLegacyIrohaConnectApprovalPreimage = (
  input: BuildLegacyIrohaConnectApprovalPreimageInput
): Uint8Array => {
  const sid = normalizeFixed32(input.sid, 'sid');
  const appPublicKey = normalizeBytes(input.appPublicKey, 'appPublicKey', {
    exact: FIXED_KEY_BYTES,
    nonZero: true,
  });
  const walletPublicKey = normalizeBytes(input.walletPublicKey, 'walletPublicKey', {
    exact: FIXED_KEY_BYTES,
    nonZero: true,
  });
  const accountId = normalizeAccountId(input.accountId);

  return concatBytes(
    taggedApprovalField('domain', APPROVAL_DOMAIN),
    taggedApprovalField('sid', sid),
    taggedApprovalField('app_pk', appPublicKey),
    taggedApprovalField('wallet_pk', walletPublicKey),
    taggedApprovalField('account_id', textEncoder.encode(accountId))
  );
};

export const encodeLegacyIrohaConnectApproveFrame = (input: EncodeLegacyIrohaConnectApproveFrameInput): Uint8Array => {
  profileForNetwork(input.network);
  const sid = normalizeFixed32(input.sid, 'sid');
  const walletPublicKey = normalizeBytes(input.walletPublicKey, 'walletPublicKey', {
    exact: FIXED_KEY_BYTES,
    nonZero: true,
  });
  const walletSignature = normalizeBytes(input.walletSignature, 'walletSignature', {
    exact: ED25519_SIGNATURE_BYTES,
    nonZero: true,
  });
  const accountId = normalizeAccountId(input.accountId);
  const legacySignatureEncoding = input.legacySignatureEncoding ?? input.network === 'taira';
  const signature = encodeStruct([
    legacySignatureEncoding ? encodeU32(SIGNATURE_ALGORITHM_ED25519) : Uint8Array.of(SIGNATURE_ALGORITHM_ED25519),
    encodeByteVector(walletSignature, legacySignatureEncoding || (input.legacyByteVectorEncoding ?? false)),
  ]);
  const body = encodeStruct([
    encodeFixedArray32(walletPublicKey, input.legacyFixedArrayEncoding ?? false),
    encodeString(accountId, 'accountId', LEGACY_IROHA_CONNECT_LIMITS.accountIdBytes),
    Uint8Array.of(0),
    Uint8Array.of(0),
    signature,
  ]);
  const control = wrapTaggedPayload(CONTROL_APPROVE, body);

  return encodeFrame(
    sid,
    'wallet-to-app',
    input.sequence ?? 1,
    FRAME_KIND_CONTROL,
    control,
    input.legacyFixedArrayEncoding ?? false
  );
};

export const encodeLegacyIrohaConnectCiphertextFrame = (
  input: EncodeLegacyIrohaConnectCiphertextFrameInput
): Uint8Array => {
  const sid = normalizeFixed32(input.sid, 'sid');
  const aead = normalizeBytes(input.aead, 'aead', {
    maximum: LEGACY_IROHA_CONNECT_LIMITS.ciphertextBytes,
  });
  if (aead.length === 0) {
    return fail('aead must not be empty');
  }
  const body = encodeStruct([
    encodeU32(DIRECTION_WALLET_TO_APP),
    encodeByteVector(aead, input.legacyByteVectorEncoding ?? false),
  ]);

  return encodeFrame(
    sid,
    'wallet-to-app',
    input.sequence,
    FRAME_KIND_CIPHERTEXT,
    body,
    input.legacyFixedArrayEncoding ?? false
  );
};

export const encodeLegacyIrohaConnectRejectFrame = (input: EncodeLegacyIrohaConnectRejectFrameInput): Uint8Array => {
  const sid = normalizeFixed32(input.sid, 'sid');
  ensureUnsignedInteger(input.code, 'reject code', 0xffff);
  if (
    !CODE_ID_PATTERN.test(input.codeId) ||
    textEncoder.encode(input.codeId).length > LEGACY_IROHA_CONNECT_LIMITS.codeIdBytes
  ) {
    return fail('codeId must be a lowercase snake_case identifier');
  }
  const body = encodeStruct([
    encodeU16(input.code),
    encodeString(input.codeId, 'codeId', LEGACY_IROHA_CONNECT_LIMITS.codeIdBytes),
    encodeString(input.reason, 'reason', LEGACY_IROHA_CONNECT_LIMITS.reasonBytes),
  ]);
  const control = wrapTaggedPayload(CONTROL_REJECT, body);

  return encodeFrame(
    sid,
    'wallet-to-app',
    input.sequence,
    FRAME_KIND_CONTROL,
    control,
    input.legacyFixedArrayEncoding ?? false
  );
};

export const encodeLegacyIrohaConnectCloseFrame = (input: EncodeLegacyIrohaConnectCloseFrameInput): Uint8Array => {
  const sid = normalizeFixed32(input.sid, 'sid');
  ensureUnsignedInteger(input.code, 'close code', 0xffff);
  const body = encodeStruct([
    encodeU32(ROLE_WALLET),
    encodeU16(input.code),
    encodeString(input.reason, 'reason', LEGACY_IROHA_CONNECT_LIMITS.reasonBytes),
    Uint8Array.of(input.retryable ? 1 : 0),
  ]);
  const control = wrapTaggedPayload(CONTROL_CLOSE, body);

  return encodeFrame(
    sid,
    'wallet-to-app',
    input.sequence,
    FRAME_KIND_CONTROL,
    control,
    input.legacyFixedArrayEncoding ?? false
  );
};

const encodeLegacyIrohaConnectHeartbeatFrame = (
  input: EncodeLegacyIrohaConnectPingFrameInput,
  controlTag: typeof CONTROL_PING | typeof CONTROL_PONG
): Uint8Array => {
  const sid = normalizeFixed32(input.sid, 'sid');
  const body = encodeStruct([encodeU64(input.nonce)]);
  const control = wrapTaggedPayload(controlTag, body);

  return encodeFrame(
    sid,
    'wallet-to-app',
    input.sequence,
    FRAME_KIND_CONTROL,
    control,
    input.legacyFixedArrayEncoding ?? false
  );
};

export const encodeLegacyIrohaConnectPingFrame = (input: EncodeLegacyIrohaConnectPingFrameInput): Uint8Array =>
  encodeLegacyIrohaConnectHeartbeatFrame(input, CONTROL_PING);

export const encodeLegacyIrohaConnectPongFrame = (input: EncodeLegacyIrohaConnectPingFrameInput): Uint8Array =>
  encodeLegacyIrohaConnectHeartbeatFrame(input, CONTROL_PONG);

class Cursor {
  private offset = 0;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly label: string
  ) {}

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  readBytes(length: number, label: string): Uint8Array {
    ensureUnsignedInteger(length, `${label} length`, LEGACY_IROHA_CONNECT_LIMITS.frameBytes);
    if (length > this.remaining) {
      return fail(`${label} is truncated`);
    }
    const output = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return output;
  }

  readU16(label: string): number {
    const bytes = this.readBytes(2, label);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(0, true);
  }

  readU32(label: string): number {
    const bytes = this.readBytes(4, label);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  }

  readU64(label: string): number {
    const bytes = this.readBytes(8, label);
    const value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(0, true);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      return fail(`${label} exceeds the safe integer range`);
    }
    return Number(value);
  }

  readField(label: string, maximum: number = LEGACY_IROHA_CONNECT_LIMITS.frameBytes): Uint8Array {
    const length = this.readU64(`${label} length`);
    if (length > maximum) {
      return fail(`${label} exceeds ${maximum} bytes`);
    }
    return this.readBytes(length, label);
  }

  expectDone(): void {
    if (this.remaining !== 0) {
      fail(`${this.label} has trailing bytes`);
    }
  }
}

const decodeDirection = (tag: number): LegacyIrohaConnectDirection => {
  if (tag === DIRECTION_APP_TO_WALLET) {
    return 'app-to-wallet';
  }
  if (tag === DIRECTION_WALLET_TO_APP) {
    return 'wallet-to-app';
  }
  return fail(`unsupported direction tag ${tag}`);
};

const decodeFixedArray32 = (payload: Uint8Array, label: string): Uint8Array => {
  if (payload.length === FIXED_KEY_BYTES) {
    return normalizeBytes(payload, label, { exact: FIXED_KEY_BYTES, nonZero: true });
  }
  if (payload.length !== FIXED_KEY_BYTES * 9) {
    return fail(`${label} is neither canonical nor the supported legacy fixed-array encoding`);
  }

  const cursor = new Cursor(payload, label);
  const output = new Uint8Array(FIXED_KEY_BYTES);
  for (let index = 0; index < FIXED_KEY_BYTES; index += 1) {
    const field = cursor.readField(`${label}[${index}]`, 1);
    if (field.length !== 1) {
      return fail(`${label}[${index}] is not one byte`);
    }
    output[index] = field[0];
  }
  cursor.expectDone();
  if (output.every((byte) => byte === 0)) {
    return fail(`${label} must not be all zeroes`);
  }
  return output;
};

const decodeByteVector = (payload: Uint8Array, label: string, maximum: number): Uint8Array => {
  const cursor = new Cursor(payload, label);
  const count = cursor.readU64(`${label} count`);
  if (count > maximum) {
    return fail(`${label} exceeds ${maximum} bytes`);
  }
  if (cursor.remaining === count) {
    const output = cursor.readBytes(count, label);
    cursor.expectDone();
    return output;
  }
  if (cursor.remaining !== count * 9) {
    return fail(`${label} is neither a canonical nor supported legacy byte vector`);
  }

  const output = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const field = cursor.readField(`${label}[${index}]`, 1);
    if (field.length !== 1) {
      return fail(`${label}[${index}] is not one byte`);
    }
    output[index] = field[0];
  }
  cursor.expectDone();
  return output;
};

const decodeString = (payload: Uint8Array, label: string, maximum: number, allowEmpty = false): string => {
  const cursor = new Cursor(payload, label);
  const length = cursor.readU64(`${label} length`);
  if (length > maximum) {
    return fail(`${label} exceeds ${maximum} UTF-8 bytes`);
  }
  const bytes = cursor.readBytes(length, label);
  cursor.expectDone();

  let value: string;
  try {
    value = strictTextDecoder.decode(bytes);
  } catch {
    return fail(`${label} is not valid UTF-8`);
  }
  if ((!allowEmpty && value.length === 0) || value !== value.trim() || containsControlCharacter(value)) {
    return fail(`${label} is not valid display text`);
  }
  return value;
};

const decodeOptionString = (payload: Uint8Array, label: string, maximum: number): string | undefined => {
  const cursor = new Cursor(payload, label);
  const tag = cursor.readBytes(1, `${label} option tag`)[0];
  if (tag === 0) {
    cursor.expectDone();
    return undefined;
  }
  if (tag !== 1) {
    return fail(`${label} has an unsupported option tag`);
  }
  const value = decodeString(cursor.readField(`${label} value`, maximum + 8), label, maximum);
  cursor.expectDone();
  return value;
};

const decodeAppMeta = (payload: Uint8Array): LegacyIrohaConnectAppMeta | null => {
  const cursor = new Cursor(payload, 'app meta');
  const tag = cursor.readBytes(1, 'app meta option tag')[0];
  if (tag === 0) {
    cursor.expectDone();
    return null;
  }
  if (tag !== 1) {
    return fail('app meta has an unsupported option tag');
  }

  const meta = new Cursor(cursor.readField('app meta value', 4096), 'app meta value');
  const name = decodeString(
    meta.readField('app name', LEGACY_IROHA_CONNECT_LIMITS.appNameBytes + 8),
    'app name',
    LEGACY_IROHA_CONNECT_LIMITS.appNameBytes
  );
  const url = decodeOptionString(
    meta.readField('app URL', LEGACY_IROHA_CONNECT_LIMITS.appUrlBytes + 17),
    'app URL',
    LEGACY_IROHA_CONNECT_LIMITS.appUrlBytes
  );
  const iconHash = decodeOptionString(
    meta.readField('app icon hash', LEGACY_IROHA_CONNECT_LIMITS.iconHashBytes + 17),
    'app icon hash',
    LEGACY_IROHA_CONNECT_LIMITS.iconHashBytes
  );
  meta.expectDone();
  cursor.expectDone();
  return { name, url, iconHash };
};

const decodeTaggedPayload = (
  payload: Uint8Array,
  label: string,
  maximum: number = LEGACY_IROHA_CONNECT_LIMITS.frameBytes
): { tag: number; body: Uint8Array } => {
  const cursor = new Cursor(payload, label);
  const tag = cursor.readU32(`${label} tag`);
  const length = cursor.readU64(`${label} body length`);
  if (length > maximum) {
    return fail(`${label} body exceeds ${maximum} bytes`);
  }
  const body = cursor.readBytes(length, `${label} body`);
  cursor.expectDone();
  return { tag, body };
};

const assertExpectedSid = (sid: Uint8Array, expectedSid: DecodeLegacyIrohaConnectFrameOptions['expectedSid']): void => {
  if (expectedSid === undefined) {
    return;
  }
  const expected = normalizeFixed32(expectedSid, 'expectedSid');
  if (sid.some((byte, index) => byte !== expected[index])) {
    fail('frame sid does not match the expected session');
  }
};

const decodeOpenFrame = (
  sid: Uint8Array,
  sequence: number,
  controlBody: Uint8Array,
  options: DecodeLegacyIrohaConnectFrameOptions
): DecodedLegacyIrohaConnectOpenFrame => {
  const body = new Cursor(controlBody, 'open control');
  const appPublicKey = decodeFixedArray32(body.readField('app public key', FIXED_KEY_BYTES * 9), 'appPublicKey');
  const appMeta = decodeAppMeta(body.readField('app meta', 4096));
  const constraints = new Cursor(body.readField('constraints', 512), 'constraints');
  const chainId = decodeString(constraints.readField('chain_id', 256), 'chain_id', 248);
  constraints.expectDone();
  const permissions = body.readField('permissions', 1);
  if (permissions.length !== 1 || permissions[0] !== 0) {
    return fail('legacy Open permissions must be None');
  }
  body.expectDone();

  const profile = profileForChainId(chainId);
  if (options.expectedNetwork !== undefined && profile.network !== options.expectedNetwork) {
    return fail('Open chain_id does not match the expected network');
  }

  return {
    kind: 'open',
    sid,
    sidBase64Url: encodeBase64Url(sid),
    direction: 'app-to-wallet',
    sequence,
    appPublicKey,
    appMeta,
    network: profile.network,
    chainId: profile.chainId,
  };
};

const decodeHeartbeatFrame = (
  sid: Uint8Array,
  direction: LegacyIrohaConnectDirection,
  sequence: number,
  controlTag: typeof CONTROL_PING | typeof CONTROL_PONG,
  controlBody: Uint8Array
): DecodedLegacyIrohaConnectHeartbeatFrame => {
  const heartbeat = new Cursor(controlBody, controlTag === CONTROL_PING ? 'ping control' : 'pong control');
  const nonceField = new Cursor(heartbeat.readField('heartbeat nonce', 8), 'heartbeat nonce');
  const nonce = nonceField.readU64('heartbeat nonce');
  nonceField.expectDone();
  heartbeat.expectDone();

  return {
    kind: controlTag === CONTROL_PING ? 'ping' : 'pong',
    sid,
    sidBase64Url: encodeBase64Url(sid),
    direction,
    sequence,
    nonce,
  };
};

export const decodeLegacyIrohaConnectFrame = (
  input: LegacyIrohaConnectBinaryInput,
  options: DecodeLegacyIrohaConnectFrameOptions = {}
): DecodedLegacyIrohaConnectFrame => {
  const bytes = normalizeBytes(input, 'frame', { maximum: LEGACY_IROHA_CONNECT_LIMITS.frameBytes });
  if (bytes.length === 0) {
    return fail('frame must not be empty');
  }

  const cursor = new Cursor(bytes, 'frame');
  const sid = decodeFixedArray32(cursor.readField('sid', FIXED_KEY_BYTES * 9), 'sid');
  assertExpectedSid(sid, options.expectedSid);
  const directionField = new Cursor(cursor.readField('direction', 4), 'direction');
  const direction = decodeDirection(directionField.readU32('direction'));
  directionField.expectDone();
  if (options.expectedDirection !== undefined && direction !== options.expectedDirection) {
    return fail('frame direction does not match the expected direction');
  }
  const sequenceField = new Cursor(cursor.readField('sequence', 8), 'sequence');
  const sequence = ensureSequence(sequenceField.readU64('sequence'));
  sequenceField.expectDone();
  const kind = decodeTaggedPayload(cursor.readField('frame kind'), 'frame kind');
  cursor.expectDone();

  if (kind.tag === FRAME_KIND_CONTROL) {
    const control = decodeTaggedPayload(kind.body, 'control');
    if (control.tag === CONTROL_OPEN) {
      if (direction !== 'app-to-wallet') {
        return fail('Open frame direction must be app-to-wallet');
      }
      return decodeOpenFrame(sid, sequence, control.body, options);
    }
    if (control.tag === CONTROL_PING || control.tag === CONTROL_PONG) {
      return decodeHeartbeatFrame(sid, direction, sequence, control.tag, control.body);
    }
    return fail(`wallet decoder does not accept control tag ${control.tag}`);
  }

  if (kind.tag !== FRAME_KIND_CIPHERTEXT) {
    return fail(`unsupported frame kind tag ${kind.tag}`);
  }

  const ciphertext = new Cursor(kind.body, 'ciphertext');
  const innerDirectionField = new Cursor(ciphertext.readField('ciphertext direction', 4), 'ciphertext direction');
  const innerDirection = decodeDirection(innerDirectionField.readU32('ciphertext direction'));
  innerDirectionField.expectDone();
  if (innerDirection !== direction) {
    return fail('ciphertext direction does not match frame direction');
  }
  const aead = decodeByteVector(
    ciphertext.readField('ciphertext aead', LEGACY_IROHA_CONNECT_LIMITS.frameBytes),
    'ciphertext aead',
    LEGACY_IROHA_CONNECT_LIMITS.ciphertextBytes
  );
  ciphertext.expectDone();
  if (aead.length === 0) {
    return fail('ciphertext aead must not be empty');
  }

  return {
    kind: 'ciphertext',
    sid,
    sidBase64Url: encodeBase64Url(sid),
    direction,
    sequence,
    aead,
  };
};
