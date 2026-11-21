import { NetworkId } from '@iroha/iroha-js/browser';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { x25519 } from '@noble/curves/ed25519';
import { blake2b } from '@noble/hashes/blake2b';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';

// Wallet side of the current Iroha Connect v1 protocol: the one Torii relays on Taira (Torii build of
// 2026-11-17) and that `@iroha/iroha-js/connect-browser` and `@iroha/connect-widget` speak on the app side.
// Reference: hyperledger-iroha `javascript/iroha_js/src/connect.browser.js` and
// `crates/iroha_torii_shared/examples/connect_wallet.rs`.

export type IrohaConnectNetwork = 'taira' | 'nexus';
export type IrohaConnectBinaryInput = Uint8Array | ArrayBuffer | ArrayBufferView;

export type IrohaConnectErrorCode =
  | 'iroha_connect_invalid_link'
  | 'iroha_connect_retired_link'
  | 'iroha_connect_unknown_network'
  | 'iroha_connect_network_unavailable'
  | 'iroha_connect_wrong_node'
  | 'iroha_connect_invalid_frame';

export class IrohaConnectError extends Error {
  constructor(
    readonly code: IrohaConnectErrorCode,
    readonly detail?: string
  ) {
    // Only the stable code crosses the extension messaging boundary; the page translates it.
    super(code);
    this.name = 'IrohaConnectError';
  }
}

export interface IrohaConnectProfile {
  network: IrohaConnectNetwork;
  chainId: string;
  toriiBaseUrl: string;
  /** Exact checksummed NetworkId literal, or null while the network has no pinned genesis hash. */
  networkId: string | null;
  networkPrefix: number;
}

const tairaNetwork = UNIVERSAL_WALLET_IROHA_NETWORKS.taira;
const nexusNetwork = UNIVERSAL_WALLET_IROHA_NETWORKS.nexus;

// A dApp's link names the network by its NetworkId; the wallet accepts only these pinned profiles and only their
// own Torii. SORA Nexus stays refused until its genesis NetworkId is pinned in the wallet's network catalog.
export const IROHA_CONNECT_PROFILES: Readonly<Record<IrohaConnectNetwork, IrohaConnectProfile>> = Object.freeze({
  taira: {
    network: 'taira',
    chainId: tairaNetwork.chainId,
    toriiBaseUrl: tairaNetwork.toriiBaseUrl,
    networkId: tairaNetwork.networkId,
    networkPrefix: tairaNetwork.chainDiscriminant,
  },
  nexus: {
    network: 'nexus',
    chainId: nexusNetwork.chainId,
    toriiBaseUrl: nexusNetwork.toriiBaseUrl,
    networkId: 'networkId' in nexusNetwork ? (nexusNetwork as { networkId: string }).networkId : null,
    networkPrefix: nexusNetwork.chainDiscriminant,
  },
});

export const IROHA_CONNECT_LIMITS = Object.freeze({
  uriBytes: 4096,
  // Torii bounds every frame with its own policy; this is the wallet's ceiling for one relayed frame.
  frameBytes: 2 * 1024 * 1024,
  transactionBytes: 1024 * 1024,
  rawBytes: 64 * 1024,
  accountIdBytes: 1024,
  appNameBytes: 128,
  appUrlBytes: 2048,
  iconHashBytes: 256,
  reasonBytes: 1024,
  codeBytes: 128,
  domainTagBytes: 256,
  permissionEntries: 32,
  permissionEntryBytes: 256,
});

const textEncoder = new TextEncoder();
const strictTextDecoder = new TextDecoder('utf-8', { fatal: true });

const SID_PREFIX = textEncoder.encode('iroha-connect|sid|');
const SALT_PREFIX = textEncoder.encode('iroha-connect|salt|');
const AAD_PREFIX = textEncoder.encode('connect:v1');
const K_APP = textEncoder.encode('iroha-connect|k_app');
const K_WALLET = textEncoder.encode('iroha-connect|k_wallet');
const X25519_HKDF_SALT = textEncoder.encode('iroha:x25519:hkdf:v1');
const X25519_HKDF_INFO = textEncoder.encode('iroha:x25519:session-key');
const APPROVE_DOMAIN = textEncoder.encode('iroha-connect|approve|v1');
const RELAY_AUTH_DOMAIN = textEncoder.encode('iroha-connect|relay-auth|v1');
const ENVELOPE_TYPE_NAME = 'iroha_torii_shared::connect::EnvelopeV1';
const NORITO_MAGIC = textEncoder.encode('NRT0');
const NORITO_HEADER_BYTES = 40;

const URI_FIELDS = ['sid', 'network_id', 'app_pk', 'nonce', 'node', 'v', 'role', 'token', 'relay'] as const;
const URI_FIELD_SET = new Set<string>(URI_FIELDS);
const LEGACY_URI_FIELDS = new Set(['chain_id']);
const CONNECT_SCHEME_PATTERN = /^(iroha|irohaconnect):\/\/connect\?/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const CODE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/u;

const FRAME_KIND_CONTROL = 0;
const FRAME_KIND_CIPHERTEXT = 1;
const DIR_APP_TO_WALLET = 0;
const DIR_WALLET_TO_APP = 1;
const ROLE_APP = 0;
const ROLE_WALLET = 1;
const CONTROL_OPEN = 0;
const CONTROL_APPROVE = 1;
const CONTROL_REJECT = 2;
const CONTROL_CLOSE = 3;
const CONTROL_PING = 4;
const CONTROL_PONG = 5;
const CONTROL_SERVER_EVENT = 6;
const PAYLOAD_CONTROL = 0;
const PAYLOAD_SIGN_REQUEST_RAW = 1;
const PAYLOAD_SIGN_REQUEST_TX = 2;
const PAYLOAD_SIGN_RESULT_OK = 3;
const PAYLOAD_SIGN_RESULT_ERR = 4;
const CONTROL_AFTER_KEY_CLOSE = 0;
const CONTROL_AFTER_KEY_REJECT = 1;
const ALGORITHM_ED25519 = 0;
const FIXED_BYTES = 32;
const ELEMENT_FRAME_BYTES = 9;
const ED25519_SIGNATURE_BYTES = 64;

export type IrohaConnectDirection = 'app-to-wallet' | 'wallet-to-app';
export type IrohaConnectRole = 'app' | 'wallet';

export interface ParsedIrohaConnectUri {
  scheme: 'iroha' | 'irohaconnect';
  network: IrohaConnectNetwork;
  chainId: string;
  networkId: string;
  networkIdBytes: Uint8Array;
  networkPrefix: number;
  node: string;
  sid: string;
  sidBytes: Uint8Array;
  appPublicKey: Uint8Array;
  nonce: Uint8Array;
  token: string;
  relayToken: string;
}

export interface IrohaConnectPermissions {
  methods: string[];
  events: string[];
  resources: string[] | null;
}

export interface IrohaConnectAppMeta {
  name: string;
  url?: string;
  iconHash?: string;
}

export type DecodedIrohaConnectControl =
  | {
      type: 'open';
      appPublicKey: Uint8Array;
      appMeta: IrohaConnectAppMeta | null;
      networkIdBytes: Uint8Array;
      permissions: IrohaConnectPermissions | null;
      /** The exact `Option<Permissions>` field bytes, echoed in the approval. */
      permissionsField: Uint8Array;
    }
  | { type: 'ping' | 'pong'; nonce: bigint }
  | { type: 'close'; who: IrohaConnectRole; code: number; reason: string; retryable: boolean }
  | { type: 'reject'; code: number; codeId: string; reason: string }
  | { type: 'server_event' };

export type DecodedIrohaConnectFrame =
  | { kind: 'control'; direction: IrohaConnectDirection; sequence: number; control: DecodedIrohaConnectControl }
  | { kind: 'ciphertext'; direction: IrohaConnectDirection; sequence: number; aead: Uint8Array };

export type IrohaConnectAppPayload =
  | { type: 'sign_request_tx'; txBytes: Uint8Array }
  | { type: 'sign_request_raw'; domainTag: string; bytes: Uint8Array }
  | { type: 'control_close'; who: IrohaConnectRole; code: number; reason: string; retryable: boolean }
  | { type: 'control_reject'; code: number; codeId: string; reason: string }
  | { type: 'unknown'; tag: number };

export type IrohaConnectWalletPayload =
  | { type: 'sign_result_ok'; signature: Uint8Array }
  | { type: 'sign_result_err'; code: string; message: string }
  | { type: 'control_close'; code: number; reason: string; retryable?: boolean };

export interface IrohaConnectDirectionKeys {
  appKey: Uint8Array;
  walletKey: Uint8Array;
}

const invalidFrame = (detail: string): never => {
  throw new IrohaConnectError('iroha_connect_invalid_frame', detail);
};

const invalidLink = (detail: string): never => {
  throw new IrohaConnectError('iroha_connect_invalid_link', detail);
};

const containsControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });

export const concatBytes = (...chunks: Uint8Array[]): Uint8Array => {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
};

const copyBytes = (input: IrohaConnectBinaryInput): Uint8Array => {
  if (input instanceof Uint8Array) return input.slice();
  if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0));
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice();
  return invalidFrame('expected binary data');
};

export const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
};

const u16 = (value: number): Uint8Array => {
  const output = new Uint8Array(2);
  new DataView(output.buffer).setUint16(0, value, true);
  return output;
};

const u32 = (value: number): Uint8Array => {
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value, true);
  return output;
};

const u64 = (value: number | bigint): Uint8Array => {
  const output = new Uint8Array(8);
  new DataView(output.buffer).setBigUint64(0, BigInt(value), true);
  return output;
};

const field = (payload: Uint8Array): Uint8Array => concatBytes(u64(payload.length), payload);
const struct = (fields: Uint8Array[]): Uint8Array => concatBytes(...fields.map(field));
const tagged = (tag: number, body: Uint8Array): Uint8Array => concatBytes(u32(tag), u64(body.length), body);

const noritoString = (value: string, label: string, maximum: number): Uint8Array => {
  if (value.length === 0 || value !== value.trim() || containsControlCharacter(value)) {
    throw new Error(`${label} must be non-empty trimmed text without control characters`);
  }
  const bytes = textEncoder.encode(value);
  if (bytes.length > maximum) throw new Error(`${label} exceeds ${maximum} UTF-8 bytes`);
  return field(bytes);
};

const elementFramed = (bytes: Uint8Array): Uint8Array => {
  const output = new Uint8Array(bytes.length * ELEMENT_FRAME_BYTES);
  bytes.forEach((byte, index) => {
    const offset = index * ELEMENT_FRAME_BYTES;
    output[offset] = 1;
    output[offset + 8] = byte;
  });
  return output;
};

const fixed32 = (bytes: Uint8Array, label: string): Uint8Array => {
  if (bytes.length !== FIXED_BYTES) throw new Error(`${label} must be ${FIXED_BYTES} bytes`);
  return elementFramed(bytes);
};

export const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const decodeCanonicalBase64Url = (value: string, label: string, length: number): Uint8Array => {
  if (!BASE64URL_PATTERN.test(value)) return invalidLink(`${label} must be unpadded base64url`);
  let decoded: Uint8Array;
  try {
    const standard = value.replace(/-/gu, '+').replace(/_/gu, '/');
    const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
    decoded = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return invalidLink(`${label} is not base64url`);
  }
  if (decoded.length !== length || toBase64Url(decoded) !== value) {
    return invalidLink(`${label} must be the canonical spelling of ${length} bytes`);
  }
  if (decoded.every((byte) => byte === 0)) return invalidLink(`${label} must not be all zeroes`);
  return decoded;
};

const sanitizeNode = (value: string): string => value.replace(/\/+$/u, '');

/** blake2b-256("iroha-connect|sid|" || NetworkId || app_pk || nonce): the sid binds the network and app key. */
export const deriveIrohaConnectSessionId = (
  networkIdBytes: Uint8Array,
  appPublicKey: Uint8Array,
  nonce: Uint8Array
): Uint8Array => blake2b(concatBytes(SID_PREFIX, networkIdBytes, appPublicKey, nonce), { dkLen: 32 });

const profileForNetworkId = (networkIdLiteral: string): IrohaConnectProfile | undefined =>
  Object.values(IROHA_CONNECT_PROFILES).find((profile) => profile.networkId === networkIdLiteral);

export const parseIrohaConnectUri = (input: string): ParsedIrohaConnectUri => {
  if (typeof input !== 'string' || input.length === 0 || input !== input.trim()) {
    return invalidLink('link must be a non-empty string without surrounding whitespace');
  }
  if (textEncoder.encode(input).length > IROHA_CONNECT_LIMITS.uriBytes) return invalidLink('link is too long');
  const schemeMatch = CONNECT_SCHEME_PATTERN.exec(input);
  if (!schemeMatch) return invalidLink('link must use iroha://connect or irohaconnect://connect');

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return invalidLink('link is malformed');
  }
  if (url.host !== 'connect' || url.username || url.password || url.pathname !== '' || url.hash !== '') {
    return invalidLink('link authority, path, or fragment is not canonical');
  }

  const values = new Map<string, string>();
  for (const [name, value] of url.searchParams) {
    if (LEGACY_URI_FIELDS.has(name)) throw new IrohaConnectError('iroha_connect_retired_link');
    if (!URI_FIELD_SET.has(name)) return invalidLink(`unexpected link field ${name}`);
    if (values.has(name)) return invalidLink(`duplicate link field ${name}`);
    if (value.length === 0) return invalidLink(`empty link field ${name}`);
    values.set(name, value);
  }
  for (const name of URI_FIELDS) {
    if (!values.has(name)) return invalidLink(`link is missing ${name}`);
  }
  if (values.get('v') !== '1') return invalidLink('v must be exactly 1');
  if (values.get('role') !== 'wallet') return invalidLink('role must be exactly wallet');

  const networkIdLiteral = values.get('network_id')!;
  let networkId: NetworkId;
  try {
    networkId = NetworkId.parse(networkIdLiteral);
  } catch {
    return invalidLink('network_id is not a canonical checksummed NetworkId');
  }
  const profile = profileForNetworkId(networkId.literal);
  if (!profile) {
    const nexus = IROHA_CONNECT_PROFILES.nexus;
    const node = sanitizeNode(values.get('node')!);
    if (nexus.networkId === null && node === nexus.toriiBaseUrl) {
      throw new IrohaConnectError('iroha_connect_network_unavailable');
    }
    throw new IrohaConnectError('iroha_connect_unknown_network');
  }
  if (values.get('node') !== profile.toriiBaseUrl) throw new IrohaConnectError('iroha_connect_wrong_node');

  const networkIdBytes = networkId.toBytes();
  const sid = values.get('sid')!;
  const sidBytes = decodeCanonicalBase64Url(sid, 'sid', 32);
  const appPublicKey = decodeCanonicalBase64Url(values.get('app_pk')!, 'app_pk', 32);
  const nonce = decodeCanonicalBase64Url(values.get('nonce')!, 'nonce', 16);
  const token = values.get('token')!;
  const relayToken = values.get('relay')!;
  decodeCanonicalBase64Url(token, 'token', 32);
  decodeCanonicalBase64Url(relayToken, 'relay', 32);
  if (!bytesEqual(deriveIrohaConnectSessionId(networkIdBytes, appPublicKey, nonce), sidBytes)) {
    return invalidLink('sid is not bound to network_id, app_pk, and nonce');
  }

  return {
    scheme: schemeMatch[1] as 'iroha' | 'irohaconnect',
    network: profile.network,
    chainId: profile.chainId,
    networkId: networkId.literal,
    networkIdBytes,
    networkPrefix: profile.networkPrefix,
    node: profile.toriiBaseUrl,
    sid,
    sidBytes,
    appPublicKey,
    nonce,
    token,
    relayToken,
  };
};

export const buildIrohaConnectTokenProtocol = (token: string): string =>
  `iroha-connect.token.v1.${toBase64Url(textEncoder.encode(token))}`;

export const buildIrohaConnectWebSocket = (session: ParsedIrohaConnectUri): { url: string; protocols: [string] } => {
  const url = new URL('/v1/connect/ws', `${session.node}/`);
  if (url.protocol !== 'https:') throw new Error('IrohaConnect relays must use HTTPS Torii roots');
  url.protocol = 'wss:';
  url.searchParams.set('sid', session.sid);
  url.searchParams.set('role', 'wallet');
  return { url: url.toString(), protocols: [buildIrohaConnectTokenProtocol(session.token)] };
};

// ---------------------------------------------------------------------------------------------------------------
// Plain frame codec

class Reader {
  private offset = 0;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly label: string
  ) {}

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  readBytes(length: number, label: string): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining) {
      return invalidFrame(`${this.label}.${label} is truncated`);
    }
    const output = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return output;
  }

  readU8(label: string): number {
    return this.readBytes(1, label)[0];
  }

  readU16(label: string): number {
    const bytes = this.readBytes(2, label);
    return new DataView(bytes.buffer, bytes.byteOffset, 2).getUint16(0, true);
  }

  readU32(label: string): number {
    const bytes = this.readBytes(4, label);
    return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
  }

  readU64Big(label: string): bigint {
    const bytes = this.readBytes(8, label);
    return new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, true);
  }

  readU64(label: string): number {
    const value = this.readU64Big(label);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) return invalidFrame(`${this.label}.${label} is too large`);
    return Number(value);
  }

  readField(label: string, maximum = IROHA_CONNECT_LIMITS.frameBytes): Uint8Array {
    const length = this.readU64(`${label}.length`);
    if (length > maximum) return invalidFrame(`${this.label}.${label} exceeds ${maximum} bytes`);
    return this.readBytes(length, label);
  }

  done(): void {
    if (this.remaining !== 0) invalidFrame(`${this.label} has trailing bytes`);
  }
}

const exactWidth = (bytes: Uint8Array, width: number, label: string): Reader => {
  if (bytes.length !== width) invalidFrame(`${label} must be ${width} bytes`);
  return new Reader(bytes, label);
};

const decodeFixed32 = (bytes: Uint8Array, label: string): Uint8Array => {
  if (bytes.length !== FIXED_BYTES * ELEMENT_FRAME_BYTES) return invalidFrame(`${label} must be element-framed`);
  const reader = new Reader(bytes, label);
  const output = new Uint8Array(FIXED_BYTES);
  for (let index = 0; index < FIXED_BYTES; index += 1) {
    const element = reader.readField(`[${index}]`, 1);
    if (element.length !== 1) invalidFrame(`${label}[${index}] must be one byte`);
    output[index] = element[0];
  }
  reader.done();
  if (output.every((byte) => byte === 0)) invalidFrame(`${label} must not be all zeroes`);
  return output;
};

const decodeText = (bytes: Uint8Array, label: string, maximum: number): string => {
  const reader = new Reader(bytes, label);
  const value = reader.readField('utf8', maximum);
  reader.done();
  let text: string;
  try {
    text = strictTextDecoder.decode(value);
  } catch {
    return invalidFrame(`${label} is not UTF-8`);
  }
  if (text.length === 0 || text !== text.trim() || containsControlCharacter(text)) {
    return invalidFrame(`${label} is not display text`);
  }
  return text;
};

const decodeOptionText = (bytes: Uint8Array, label: string, maximum: number): string | undefined => {
  const reader = new Reader(bytes, label);
  const tag = reader.readU8('tag');
  if (tag === 0) {
    reader.done();
    return undefined;
  }
  if (tag !== 1) return invalidFrame(`${label} has an invalid option tag`);
  const value = decodeText(reader.readField('value', maximum + 8), label, maximum);
  reader.done();
  return value;
};

const decodeAppMeta = (bytes: Uint8Array): IrohaConnectAppMeta | null => {
  const reader = new Reader(bytes, 'app_meta');
  const tag = reader.readU8('tag');
  if (tag === 0) {
    reader.done();
    return null;
  }
  if (tag !== 1) return invalidFrame('app_meta has an invalid option tag');
  const meta = new Reader(reader.readField('value', 4096), 'app_meta.value');
  reader.done();
  const name = decodeText(meta.readField('name', 256), 'app_meta.name', IROHA_CONNECT_LIMITS.appNameBytes);
  const url = decodeOptionText(meta.readField('url', 4096), 'app_meta.url', IROHA_CONNECT_LIMITS.appUrlBytes);
  const iconHash = decodeOptionText(
    meta.readField('icon_hash', 512),
    'app_meta.icon_hash',
    IROHA_CONNECT_LIMITS.iconHashBytes
  );
  meta.done();
  return { name, ...(url === undefined ? {} : { url }), ...(iconHash === undefined ? {} : { iconHash }) };
};

const decodeStringVec = (bytes: Uint8Array, label: string): string[] => {
  const reader = new Reader(bytes, label);
  const count = reader.readU64('count');
  if (count > IROHA_CONNECT_LIMITS.permissionEntries) return invalidFrame(`${label} has too many entries`);
  const values: string[] = [];
  for (let index = 0; index < count; index += 1) {
    values.push(
      decodeText(
        reader.readField(`[${index}]`, IROHA_CONNECT_LIMITS.permissionEntryBytes + 8),
        `${label}[${index}]`,
        IROHA_CONNECT_LIMITS.permissionEntryBytes
      )
    );
  }
  reader.done();
  return values;
};

const decodePermissions = (bytes: Uint8Array): IrohaConnectPermissions | null => {
  const reader = new Reader(bytes, 'permissions');
  const tag = reader.readU8('tag');
  if (tag === 0) {
    reader.done();
    return null;
  }
  if (tag !== 1) return invalidFrame('permissions has an invalid option tag');
  const value = new Reader(reader.readField('value', 32 * 1024), 'permissions.value');
  reader.done();
  const methods = decodeStringVec(value.readField('methods', 16 * 1024), 'permissions.methods');
  const events = decodeStringVec(value.readField('events', 16 * 1024), 'permissions.events');
  const resourcesOption = new Reader(value.readField('resources', 16 * 1024), 'permissions.resources');
  value.done();
  const resourcesTag = resourcesOption.readU8('tag');
  let resources: string[] | null = null;
  if (resourcesTag === 1) {
    resources = decodeStringVec(resourcesOption.readField('value', 16 * 1024), 'permissions.resources');
  } else if (resourcesTag !== 0) {
    return invalidFrame('permissions.resources has an invalid option tag');
  }
  resourcesOption.done();
  return { methods, events, resources };
};

const decodeRole = (bytes: Uint8Array, label: string): IrohaConnectRole => {
  const role = exactWidth(bytes, 4, label).readU32(label);
  if (role === ROLE_APP) return 'app';
  if (role === ROLE_WALLET) return 'wallet';
  return invalidFrame(`${label} is not a Connect role`);
};

const decodeBool = (bytes: Uint8Array, label: string): boolean => {
  if (bytes.length !== 1 || bytes[0] > 1) return invalidFrame(`${label} must be one boolean byte`);
  return bytes[0] === 1;
};

const decodeNonce = (body: Uint8Array, label: string): bigint => {
  const reader = new Reader(body, label);
  const nonce = exactWidth(reader.readField('nonce', 8), 8, `${label}.nonce`).readU64Big('nonce');
  reader.done();
  return nonce;
};

const decodeControl = (bytes: Uint8Array): DecodedIrohaConnectControl => {
  const outer = new Reader(bytes, 'control');
  const tag = outer.readU32('tag');
  const body = outer.readField('body');
  outer.done();
  const reader = new Reader(body, 'control.body');

  if (tag === CONTROL_OPEN) {
    const appPublicKey = decodeFixed32(reader.readField('app_pk', FIXED_BYTES * ELEMENT_FRAME_BYTES), 'app_pk');
    const appMeta = decodeAppMeta(reader.readField('app_meta', 8192));
    const constraints = new Reader(reader.readField('constraints', 64), 'constraints');
    const networkIdBytes = constraints.readField('network_id', FIXED_BYTES);
    constraints.done();
    if (networkIdBytes.length !== FIXED_BYTES || (networkIdBytes[31] & 1) === 0) {
      invalidFrame('constraints.network_id must be 32 marked hash bytes');
    }
    const permissionsField = reader.readField('permissions', 64 * 1024);
    reader.done();
    return {
      type: 'open',
      appPublicKey,
      appMeta,
      networkIdBytes: networkIdBytes.slice(),
      permissions: decodePermissions(permissionsField),
      permissionsField: permissionsField.slice(),
    };
  }
  if (tag === CONTROL_PING || tag === CONTROL_PONG) {
    return { type: tag === CONTROL_PING ? 'ping' : 'pong', nonce: decodeNonce(body, 'heartbeat') };
  }
  if (tag === CONTROL_CLOSE) {
    const who = decodeRole(reader.readField('who', 4), 'close.who');
    const code = exactWidth(reader.readField('code', 2), 2, 'close.code').readU16('code');
    const reason = decodeText(reader.readField('reason'), 'close.reason', IROHA_CONNECT_LIMITS.reasonBytes);
    const retryable = decodeBool(reader.readField('retryable', 1), 'close.retryable');
    reader.done();
    return { type: 'close', who, code, reason, retryable };
  }
  if (tag === CONTROL_REJECT) {
    const code = exactWidth(reader.readField('code', 2), 2, 'reject.code').readU16('code');
    const codeId = decodeText(reader.readField('code_id'), 'reject.code_id', IROHA_CONNECT_LIMITS.codeBytes);
    const reason = decodeText(reader.readField('reason'), 'reject.reason', IROHA_CONNECT_LIMITS.reasonBytes);
    reader.done();
    return { type: 'reject', code, codeId, reason };
  }
  if (tag === CONTROL_SERVER_EVENT) return { type: 'server_event' };
  return invalidFrame(`the wallet does not accept control tag ${tag}`);
};

const decodeDirection = (bytes: Uint8Array, label: string): IrohaConnectDirection => {
  const value = exactWidth(bytes, 4, label).readU32(label);
  if (value === DIR_APP_TO_WALLET) return 'app-to-wallet';
  if (value === DIR_WALLET_TO_APP) return 'wallet-to-app';
  return invalidFrame(`${label} is not a Connect direction`);
};

export const decodeIrohaConnectFrame = (
  input: IrohaConnectBinaryInput,
  { sidBytes }: { sidBytes: Uint8Array }
): DecodedIrohaConnectFrame => {
  const bytes = copyBytes(input);
  if (bytes.length === 0 || bytes.length > IROHA_CONNECT_LIMITS.frameBytes) invalidFrame('frame size is invalid');
  const reader = new Reader(bytes, 'frame');
  const sid = decodeFixed32(reader.readField('sid', FIXED_BYTES * ELEMENT_FRAME_BYTES), 'frame.sid');
  if (!bytesEqual(sid, sidBytes)) invalidFrame('frame belongs to another session');
  const direction = decodeDirection(reader.readField('dir', 4), 'frame.dir');
  const sequence = exactWidth(reader.readField('seq', 8), 8, 'frame.seq').readU64('seq');
  if (sequence === 0) invalidFrame('frame.seq must be positive');
  const kind = new Reader(reader.readField('kind'), 'frame.kind');
  reader.done();
  const kindTag = kind.readU32('tag');
  const body = kind.readField('body');
  kind.done();

  if (kindTag === FRAME_KIND_CONTROL) {
    return { kind: 'control', direction, sequence, control: decodeControl(body) };
  }
  if (kindTag !== FRAME_KIND_CIPHERTEXT) return invalidFrame(`unsupported frame kind ${kindTag}`);

  const ciphertext = new Reader(body, 'ciphertext');
  const innerDirection = decodeDirection(ciphertext.readField('dir', 4), 'ciphertext.dir');
  const aeadField = new Reader(ciphertext.readField('aead'), 'ciphertext.aead');
  ciphertext.done();
  const aead = aeadField.readField('bytes');
  aeadField.done();
  if (innerDirection !== direction) invalidFrame('ciphertext direction does not match the frame');
  if (aead.length === 0) invalidFrame('ciphertext is empty');
  return { kind: 'ciphertext', direction, sequence, aead: aead.slice() };
};

const encodeFrame = (sidBytes: Uint8Array, sequence: number, kind: Uint8Array): Uint8Array => {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('sequence must be a positive integer');
  return struct([fixed32(sidBytes, 'sid'), u32(DIR_WALLET_TO_APP), u64(sequence), kind]);
};

const controlFrame = (sidBytes: Uint8Array, sequence: number, controlTag: number, body: Uint8Array): Uint8Array =>
  encodeFrame(sidBytes, sequence, tagged(FRAME_KIND_CONTROL, tagged(controlTag, body)));

export interface IrohaConnectApprovalInput {
  sidBytes: Uint8Array;
  networkIdBytes: Uint8Array;
  appPublicKey: Uint8Array;
  walletPublicKey: Uint8Array;
  accountId: string;
  /** The Open frame's exact `Option<Permissions>` field. */
  permissionsField: Uint8Array;
  relayToken: string;
}

const taggedApprovalField = (tag: string, value: Uint8Array): Uint8Array => {
  const tagBytes = textEncoder.encode(tag);
  return concatBytes(u16(tagBytes.length), tagBytes, u64(value.length), value);
};

const unwrapOption = (bytes: Uint8Array, label: string): Uint8Array | null => {
  if (bytes.length === 1 && bytes[0] === 0) return null;
  const reader = new Reader(bytes, label);
  if (reader.readU8('tag') !== 1) return invalidFrame(`${label} has an invalid option tag`);
  const value = reader.readField('value');
  reader.done();
  return value;
};

export const irohaConnectRelayAuthHash = (sidBytes: Uint8Array, relayToken: string): Uint8Array =>
  sha256(concatBytes(RELAY_AUTH_DOMAIN, sidBytes, textEncoder.encode(relayToken)));

/** The tagged structure the wallet signs with the account key; the app verifies it before deriving keys. */
export const buildIrohaConnectApprovalPreimage = (input: IrohaConnectApprovalInput): Uint8Array => {
  if (input.networkIdBytes.length !== FIXED_BYTES) throw new Error('networkId must be 32 bytes');
  noritoString(input.accountId, 'accountId', IROHA_CONNECT_LIMITS.accountIdBytes);
  const permissions = unwrapOption(input.permissionsField, 'permissions');
  const fields = [
    taggedApprovalField('domain', APPROVE_DOMAIN),
    taggedApprovalField('network_id', input.networkIdBytes),
    taggedApprovalField('constraints', blake2b(struct([input.networkIdBytes]), { dkLen: 32 })),
    taggedApprovalField('sid', input.sidBytes),
    taggedApprovalField('app_pk', input.appPublicKey),
    taggedApprovalField('wallet_pk', input.walletPublicKey),
    taggedApprovalField('account_id', textEncoder.encode(input.accountId)),
  ];
  if (permissions !== null) fields.push(taggedApprovalField('permissions', blake2b(permissions, { dkLen: 32 })));
  fields.push(taggedApprovalField('relay_auth', irohaConnectRelayAuthHash(input.sidBytes, input.relayToken)));
  return concatBytes(...fields);
};

export const encodeIrohaConnectApproveFrame = (input: {
  sidBytes: Uint8Array;
  sequence: number;
  walletPublicKey: Uint8Array;
  accountId: string;
  permissionsField: Uint8Array;
  signature: Uint8Array;
}): Uint8Array => {
  if (input.signature.length !== ED25519_SIGNATURE_BYTES) throw new Error('approval signature must be 64 bytes');
  unwrapOption(input.permissionsField, 'permissions');
  // Plain frames use the layout Torii decodes and re-encodes: `[u8; 32]` element-framed, and the wallet signature
  // as a u32 algorithm plus a counted, element-framed byte sequence.
  const signature = struct([
    u32(ALGORITHM_ED25519),
    concatBytes(u64(input.signature.length), elementFramed(input.signature)),
  ]);
  const body = struct([
    fixed32(input.walletPublicKey, 'walletPublicKey'),
    noritoString(input.accountId, 'accountId', IROHA_CONNECT_LIMITS.accountIdBytes),
    input.permissionsField,
    Uint8Array.of(0),
    signature,
  ]);
  return controlFrame(input.sidBytes, input.sequence, CONTROL_APPROVE, body);
};

export const encodeIrohaConnectRejectFrame = (input: {
  sidBytes: Uint8Array;
  sequence: number;
  code: number;
  codeId: string;
  reason: string;
}): Uint8Array => {
  if (!CODE_ID_PATTERN.test(input.codeId)) throw new Error('codeId must be an identifier');
  return controlFrame(
    input.sidBytes,
    input.sequence,
    CONTROL_REJECT,
    struct([
      u16(input.code),
      noritoString(input.codeId, 'codeId', IROHA_CONNECT_LIMITS.codeBytes),
      noritoString(input.reason, 'reason', IROHA_CONNECT_LIMITS.reasonBytes),
    ])
  );
};

export const encodeIrohaConnectPingFrame = (input: { sidBytes: Uint8Array; sequence: number; nonce: bigint }) =>
  controlFrame(input.sidBytes, input.sequence, CONTROL_PING, struct([u64(input.nonce)]));

export const encodeIrohaConnectPongFrame = (input: { sidBytes: Uint8Array; sequence: number; nonce: bigint }) =>
  controlFrame(input.sidBytes, input.sequence, CONTROL_PONG, struct([u64(input.nonce)]));

// ---------------------------------------------------------------------------------------------------------------
// Session keys and encrypted envelopes

export const generateIrohaConnectWalletKeyPair = (): { privateKey: Uint8Array; publicKey: Uint8Array } => {
  const privateKey = x25519.utils.randomPrivateKey();
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
};

export const deriveIrohaConnectDirectionKeys = (
  walletPrivateKey: Uint8Array,
  appPublicKey: Uint8Array,
  sidBytes: Uint8Array
): IrohaConnectDirectionKeys => {
  const shared = x25519.getSharedSecret(walletPrivateKey, appPublicKey);
  const sessionKey = hkdf(sha256, shared, X25519_HKDF_SALT, X25519_HKDF_INFO, 32);
  try {
    const salt = blake2b(concatBytes(SALT_PREFIX, sidBytes), { dkLen: 32 });
    return {
      appKey: hkdf(sha256, sessionKey, salt, K_APP, 32),
      walletKey: hkdf(sha256, sessionKey, salt, K_WALLET, 32),
    };
  } finally {
    shared.fill(0);
    sessionKey.fill(0);
  }
};

// CRC-64/XZ (ECMA-182 reflected), the checksum in every Norito NRT0 header.
const CRC64_TABLE = (() => {
  const lo = new Uint32Array(256);
  const hi = new Uint32Array(256);
  const polyLo = 0xd7870f42;
  const polyHi = 0xc96c5795;
  for (let index = 0; index < 256; index += 1) {
    let crcLo = index;
    let crcHi = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const carry = crcLo & 1;
      crcLo = ((crcLo >>> 1) | ((crcHi & 1) << 31)) >>> 0;
      crcHi >>>= 1;
      if (carry) {
        crcLo = (crcLo ^ polyLo) >>> 0;
        crcHi = (crcHi ^ polyHi) >>> 0;
      }
    }
    lo[index] = crcLo;
    hi[index] = crcHi;
  }
  return { lo, hi };
})();

export const crc64Xz = (bytes: Uint8Array): bigint => {
  let crcLo = 0xffffffff;
  let crcHi = 0xffffffff;
  for (const byte of bytes) {
    const index = (crcLo ^ byte) & 0xff;
    crcLo = (((crcLo >>> 8) | (crcHi << 24)) ^ CRC64_TABLE.lo[index]) >>> 0;
    crcHi = ((crcHi >>> 8) ^ CRC64_TABLE.hi[index]) >>> 0;
  }
  return (BigInt((crcHi ^ 0xffffffff) >>> 0) << 32n) | BigInt((crcLo ^ 0xffffffff) >>> 0);
};

const ENVELOPE_SCHEMA_HASH = sha256(
  concatBytes(textEncoder.encode('norito:v1:type-name\0'), textEncoder.encode(ENVELOPE_TYPE_NAME))
).slice(0, 16);

const frameNorito = (payload: Uint8Array): Uint8Array =>
  concatBytes(
    NORITO_MAGIC,
    Uint8Array.of(0, 0),
    ENVELOPE_SCHEMA_HASH,
    Uint8Array.of(0),
    u64(payload.length),
    u64(crc64Xz(payload)),
    Uint8Array.of(0),
    payload
  );

const unframeNorito = (bytes: Uint8Array): Uint8Array => {
  if (bytes.length < NORITO_HEADER_BYTES || !bytesEqual(bytes.subarray(0, 4), NORITO_MAGIC)) {
    return invalidFrame('envelope is not an NRT0 frame');
  }
  if (bytes[4] !== 0 || bytes[5] !== 0) invalidFrame('envelope uses an unsupported Norito version');
  if (!bytesEqual(bytes.subarray(6, 22), ENVELOPE_SCHEMA_HASH)) invalidFrame('envelope schema does not match');
  if (bytes[22] !== 0 || bytes[39] !== 0) invalidFrame('envelope uses unsupported layout flags');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getBigUint64(23, true);
  const checksum = view.getBigUint64(31, true);
  if (length !== BigInt(bytes.length - NORITO_HEADER_BYTES)) invalidFrame('envelope length does not match');
  const payload = bytes.subarray(NORITO_HEADER_BYTES);
  if (crc64Xz(payload) !== checksum) invalidFrame('envelope checksum does not match');
  return payload;
};

const aeadNonce = (sequence: number): Uint8Array => concatBytes(new Uint8Array(4), u64(sequence));
const aeadData = (sidBytes: Uint8Array, direction: number, sequence: number): Uint8Array =>
  concatBytes(AAD_PREFIX, sidBytes, Uint8Array.of(direction), u64(sequence), Uint8Array.of(1));

const decodeAfterKeyControl = (bytes: Uint8Array): IrohaConnectAppPayload => {
  const reader = new Reader(bytes, 'payload.control');
  const tag = reader.readU32('tag');
  if (tag === CONTROL_AFTER_KEY_CLOSE) {
    const who = decodeRole(reader.readField('who', 4), 'close.who');
    const code = exactWidth(reader.readField('code', 2), 2, 'close.code').readU16('code');
    const reason = decodeText(reader.readField('reason'), 'close.reason', IROHA_CONNECT_LIMITS.reasonBytes);
    const retryable = decodeBool(reader.readField('retryable', 1), 'close.retryable');
    reader.done();
    return { type: 'control_close', who, code, reason, retryable };
  }
  if (tag === CONTROL_AFTER_KEY_REJECT) {
    const code = exactWidth(reader.readField('code', 2), 2, 'reject.code').readU16('code');
    const codeId = decodeText(reader.readField('code_id'), 'reject.code_id', IROHA_CONNECT_LIMITS.codeBytes);
    const reason = decodeText(reader.readField('reason'), 'reject.reason', IROHA_CONNECT_LIMITS.reasonBytes);
    reader.done();
    return { type: 'control_reject', code, codeId, reason };
  }
  return { type: 'unknown', tag: PAYLOAD_CONTROL };
};

const decodeNoritoBytesField = (bytes: Uint8Array, label: string, maximum: number): Uint8Array => {
  const reader = new Reader(bytes, label);
  const value = reader.readField('bytes', maximum);
  reader.done();
  return value.slice();
};

const decodeAppPayload = (bytes: Uint8Array): IrohaConnectAppPayload => {
  const reader = new Reader(bytes, 'payload');
  const tag = reader.readU32('tag');
  if (tag === PAYLOAD_SIGN_REQUEST_TX) {
    const txBytes = decodeNoritoBytesField(
      reader.readField('tx_bytes'),
      'tx_bytes',
      IROHA_CONNECT_LIMITS.transactionBytes
    );
    reader.done();
    return { type: 'sign_request_tx', txBytes };
  }
  if (tag === PAYLOAD_SIGN_REQUEST_RAW) {
    const domainTag = decodeText(reader.readField('domain_tag'), 'domain_tag', IROHA_CONNECT_LIMITS.domainTagBytes);
    const raw = decodeNoritoBytesField(reader.readField('bytes'), 'bytes', IROHA_CONNECT_LIMITS.rawBytes);
    reader.done();
    return { type: 'sign_request_raw', domainTag, bytes: raw };
  }
  if (tag === PAYLOAD_CONTROL) {
    const control = reader.readField('control');
    reader.done();
    return decodeAfterKeyControl(control);
  }
  return { type: 'unknown', tag };
};

export const openIrohaConnectEnvelope = (
  appKey: Uint8Array,
  sidBytes: Uint8Array,
  frame: Extract<DecodedIrohaConnectFrame, { kind: 'ciphertext' }>
): IrohaConnectAppPayload => {
  if (frame.direction !== 'app-to-wallet') return invalidFrame('the wallet opens only app ciphertext');
  let plaintext: Uint8Array;
  try {
    plaintext = chacha20poly1305(
      appKey,
      aeadNonce(frame.sequence),
      aeadData(sidBytes, DIR_APP_TO_WALLET, frame.sequence)
    ).decrypt(frame.aead);
  } catch {
    return invalidFrame('ciphertext does not authenticate');
  }
  try {
    const envelope = new Reader(unframeNorito(plaintext), 'envelope');
    const sequence = exactWidth(envelope.readField('seq', 8), 8, 'envelope.seq').readU64('seq');
    const payload = envelope.readField('payload');
    envelope.done();
    if (sequence !== frame.sequence) invalidFrame('envelope sequence does not match the frame');
    return decodeAppPayload(payload);
  } finally {
    plaintext.fill(0);
  }
};

const encodeWalletPayload = (payload: IrohaConnectWalletPayload): Uint8Array => {
  if (payload.type === 'sign_result_ok') {
    if (payload.signature.length !== ED25519_SIGNATURE_BYTES) throw new Error('signature must be 64 bytes');
    return concatBytes(
      u32(PAYLOAD_SIGN_RESULT_OK),
      field(struct([Uint8Array.of(ALGORITHM_ED25519), field(payload.signature)]))
    );
  }
  if (payload.type === 'sign_result_err') {
    return concatBytes(
      u32(PAYLOAD_SIGN_RESULT_ERR),
      field(noritoString(payload.code, 'code', IROHA_CONNECT_LIMITS.codeBytes)),
      field(noritoString(payload.message, 'message', IROHA_CONNECT_LIMITS.reasonBytes))
    );
  }
  return concatBytes(
    u32(PAYLOAD_CONTROL),
    field(
      concatBytes(
        u32(CONTROL_AFTER_KEY_CLOSE),
        field(u32(ROLE_WALLET)),
        field(u16(payload.code)),
        field(noritoString(payload.reason, 'reason', IROHA_CONNECT_LIMITS.reasonBytes)),
        field(Uint8Array.of(payload.retryable ? 1 : 0))
      )
    )
  );
};

export const sealIrohaConnectEnvelope = (input: {
  walletKey: Uint8Array;
  sidBytes: Uint8Array;
  sequence: number;
  payload: IrohaConnectWalletPayload;
}): Uint8Array => {
  const plaintext = frameNorito(struct([u64(input.sequence), encodeWalletPayload(input.payload)]));
  try {
    const aead = chacha20poly1305(
      input.walletKey,
      aeadNonce(input.sequence),
      aeadData(input.sidBytes, DIR_WALLET_TO_APP, input.sequence)
    ).encrypt(plaintext);
    return encodeFrame(
      input.sidBytes,
      input.sequence,
      tagged(FRAME_KIND_CIPHERTEXT, struct([u32(DIR_WALLET_TO_APP), field(aead)]))
    );
  } finally {
    plaintext.fill(0);
  }
};
