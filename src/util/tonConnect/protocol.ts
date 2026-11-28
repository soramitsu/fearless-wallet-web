/**
 * TON Connect v2, wallet side: the parts that need no browser or wallet state, so the background service, the popup
 * and the tests share one reading of every request.
 *
 * Spec: https://github.com/ton-blockchain/ton-connect (spec/connect.md, spec/rpc.md, spec/bridge.md). The signature
 * layouts follow the spec and the reference verifiers of ton-connect/demo-dapp-with-react-ui: `ton_proof` writes the
 * domain length and the timestamp little-endian, `signData` text and binary write every integer big-endian.
 */
import { sha256 } from '@noble/hashes/sha2';
import { Address, Cell, beginCell, loadStateInit, storeStateInit, type StateInit } from '@ton/core';
import { TON_CONNECT_MAX_MESSAGES, TON_CONNECT_MAINNET } from './device';

export * from './device';


export const CONNECT_ERROR = Object.freeze({
  UNKNOWN: 0,
  BAD_REQUEST: 1,
  MANIFEST_NOT_FOUND: 2,
  MANIFEST_CONTENT: 3,
  UNKNOWN_APP: 100,
  USER_DECLINED: 300,
  METHOD_NOT_SUPPORTED: 400,
});

export const RPC_ERROR = Object.freeze({
  UNKNOWN: 0,
  BAD_REQUEST: 1,
  UNKNOWN_APP: 100,
  USER_DECLINED: 300,
  METHOD_NOT_SUPPORTED: 400,
});

const MAX_MANIFEST_URL_LENGTH = 2048;
const MAX_CONNECT_ITEMS = 8;
const MAX_ITEM_NAME_LENGTH = 64;
const MAX_PROOF_PAYLOAD_BYTES = 1024;
const MAX_REQUEST_ID_LENGTH = 20;
const MAX_METHOD_LENGTH = 64;
const MAX_PARAMS = 4;
const MAX_TRANSACTION_JSON_LENGTH = 512 * 1024;
const MAX_BOC_BASE64_LENGTH = 128 * 1024;
const MAX_SIGN_DATA_JSON_LENGTH = 256 * 1024;
const MAX_SIGN_DATA_BYTES = 64 * 1024;
const MAX_SCHEMA_LENGTH = 8 * 1024;
/** Coins are VarUInteger 16: at most 120 bits. */
const MAX_COINS = (1n << 120n) - 1n;
/** A wallet message that stays valid longer than this is refused; dApps ask for minutes. */
const MAX_VALID_FOR_SECONDS = 24 * 60 * 60;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]*={0,2}$/;

export class TonConnectError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message);
    this.name = 'TonConnectError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const utf8Length = (value: string): number => new TextEncoder().encode(value).length;

// ---------------------------------------------------------------------------------------------------------------
// Domains

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** A page TON Connect answers: HTTPS, or plain HTTP on this computer only. */
export function isTonConnectPageOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);

    if (url.origin !== origin) return false;
    if (url.protocol === 'https:') return true;

    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * The AppDomain bound into `ton_proof` and `signData` signatures: the host (with any port) of the page that asked,
 * which the browser reports, never a domain the page or its manifest names. The spec reserves names without a dot
 * for wallets' own integrations, so such a page gets no signature.
 */
export function tonConnectSigningDomain(origin: string): string {
  const url = new URL(origin);

  if (!/^[^.[\]]+(?:\.[^.[\]]+)+$/.test(url.hostname))
    throw new TonConnectError(CONNECT_ERROR.BAD_REQUEST, 'This site has no domain a TON signature can name');

  return url.host;
}

/** TEP-81 DNS wire order without the length bytes, as the reference verifier encodes it: `a.b.com` → `com\0b\0a\0`. */
export function encodeDnsLikeDomain(domain: string): string {
  return domain
    .split('.')
    .reverse()
    .map((part) => `${part}\0`)
    .join('');
}

// ---------------------------------------------------------------------------------------------------------------
// Connect

export type TonConnectAddressItem = { name: 'ton_addr'; network?: string };
export type TonConnectProofItem = { name: 'ton_proof'; payload: string };

export type ParsedConnectRequest = {
  manifestUrl: string;
  addressItem: TonConnectAddressItem;
  proof?: TonConnectProofItem;
  /** Items this wallet does not support. Each gets a per-item error with code 400. */
  unsupportedItems: string[];
};

export function parseConnectRequest(value: unknown): ParsedConnectRequest {
  if (!isRecord(value)) throw new TonConnectError(CONNECT_ERROR.BAD_REQUEST, 'Invalid connect request');

  const { manifestUrl, items } = value;

  if (typeof manifestUrl !== 'string' || manifestUrl.length === 0 || manifestUrl.length > MAX_MANIFEST_URL_LENGTH)
    throw new TonConnectError(CONNECT_ERROR.BAD_REQUEST, 'Invalid manifest URL');
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_CONNECT_ITEMS)
    throw new TonConnectError(CONNECT_ERROR.BAD_REQUEST, 'Invalid connect items');

  let addressItem: TonConnectAddressItem | undefined;
  let proof: TonConnectProofItem | undefined;
  const unsupportedItems = new Set<string>();

  for (const item of items) {
    if (!isRecord(item) || typeof item.name !== 'string' || item.name.length === 0 || item.name.length > MAX_ITEM_NAME_LENGTH)
      throw new TonConnectError(CONNECT_ERROR.BAD_REQUEST, 'Invalid connect item');

    if (item.name === 'ton_addr') {
      if (item.network !== undefined && (typeof item.network !== 'string' || !/^-?\d{1,11}$/.test(item.network)))
        throw new TonConnectError(CONNECT_ERROR.BAD_REQUEST, 'Invalid network');
      addressItem = typeof item.network === 'string' ? { name: 'ton_addr', network: item.network } : { name: 'ton_addr' };
    } else if (item.name === 'ton_proof') {
      if (typeof item.payload !== 'string' || utf8Length(item.payload) > MAX_PROOF_PAYLOAD_BYTES)
        throw new TonConnectError(CONNECT_ERROR.BAD_REQUEST, 'Invalid proof payload');
      if (proof) throw new TonConnectError(CONNECT_ERROR.BAD_REQUEST, 'Duplicate proof request');
      proof = { name: 'ton_proof', payload: item.payload };
    } else unsupportedItems.add(item.name);
  }

  if (!addressItem) throw new TonConnectError(CONNECT_ERROR.BAD_REQUEST, 'The request does not ask for an address');

  return { manifestUrl, addressItem, proof, unsupportedItems: [...unsupportedItems] };
}

// ---------------------------------------------------------------------------------------------------------------
// RPC envelope

export type TonConnectRpcMethod = 'sendTransaction' | 'signData' | 'disconnect';

export type ParsedAppRequest = { id: string; method: string; params: unknown[] };

/** The `{ method, params, id }` envelope. Its id must answer even a refusal, so it is read first. */
export function parseAppRequest(value: unknown): ParsedAppRequest {
  if (!isRecord(value)) throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid request');

  const { id, method, params } = value;

  if (typeof id !== 'string' || !/^\d+$/.test(id) || id.length > MAX_REQUEST_ID_LENGTH)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid request id');
  if (typeof method !== 'string' || method.length === 0 || method.length > MAX_METHOD_LENGTH)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid method');
  if (!Array.isArray(params) || params.length > MAX_PARAMS)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid parameters');

  return { id, method, params };
}

/** Request ids rise strictly within a session; the spec makes the wallet refuse one that does not. */
export function requestIdFollows(id: string, lastId: string | undefined): boolean {
  if (lastId === undefined) return true;

  return BigInt(id) > BigInt(lastId);
}

// ---------------------------------------------------------------------------------------------------------------
// Addresses and cells

export function rawTonAddress(address: Address): string {
  return address.toRawString();
}

/** Raw or friendly: `from` may be either. A friendly address for a test network is refused on mainnet. */
export function parseAnyTonAddress(value: unknown): Address {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid address');

  try {
    if (Address.isFriendly(value)) {
      const parsed = Address.parseFriendly(value);

      if (parsed.isTestOnly) throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'The address belongs to a test network');

      return parsed.address;
    }
    if (Address.isRaw(value)) return Address.parseRaw(value);
  } catch (error) {
    if (error instanceof TonConnectError) throw error;
  }

  throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid address');
}

function parseOneCellBoc(value: unknown, what: string): Cell {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_BOC_BASE64_LENGTH)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, `Invalid ${what}`);

  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');

  if (!BASE64_RE.test(normalized) && !BASE64URL_RE.test(value))
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, `Invalid ${what}`);

  try {
    const roots = Cell.fromBoc(Buffer.from(normalized, 'base64'));

    if (roots.length !== 1) throw new Error('not one root');

    return roots[0];
  } catch {
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, `Invalid ${what}`);
  }
}

export function walletStateInitBase64(init: StateInit): string {
  return beginCell().store(storeStateInit(init)).endCell().toBoc().toString('base64');
}

// ---------------------------------------------------------------------------------------------------------------
// Network and sender checks shared by sendTransaction and signData

function assertNetwork(network: unknown): string | undefined {
  if (network === undefined) return undefined;
  if (typeof network !== 'string' || !/^-?\d{1,11}$/.test(network))
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid network');
  // The wallet sends and signs on TON mainnet only. A request for another network is refused, never sent there.
  if (network !== TON_CONNECT_MAINNET)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Fearless Wallet uses TON mainnet; the request names another network');

  return network;
}

function assertFrom(from: unknown, account: Address): string | undefined {
  if (from === undefined) return undefined;
  if (!parseAnyTonAddress(from).equals(account))
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'The request names another sender than the connected wallet');

  return from as string;
}

// ---------------------------------------------------------------------------------------------------------------
// sendTransaction

export type TonConnectMessage = {
  /** The destination as the dApp wrote it: friendly, with its bounce flag. */
  address: string;
  destination: Address;
  bounce: boolean;
  /** Nanotons. */
  amount: bigint;
  payload?: Cell;
  stateInit?: StateInit;
  stateInitCell?: Cell;
};

export type TonConnectTransaction = {
  /** Unix seconds; the wallet message expires then. */
  validUntil?: number;
  network?: string;
  from?: string;
  messages: TonConnectMessage[];
};

function parseMessage(value: unknown): TonConnectMessage {
  if (!isRecord(value)) throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid message');

  const { address, amount, payload, stateInit, extra_currency: extraCurrency } = value;

  if (typeof address !== 'string' || address.length === 0 || address.length > 128)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid destination');

  // The spec makes wallets refuse a raw destination: only a friendly one carries the bounce flag the dApp chose.
  let friendly: ReturnType<typeof Address.parseFriendly>;

  try {
    if (!Address.isFriendly(address)) throw new Error('not friendly');
    friendly = Address.parseFriendly(address);
  } catch {
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'The destination must be a user-friendly address');
  }
  if (friendly.isTestOnly)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'The destination belongs to a test network');
  if (friendly.address.workChain !== 0 && friendly.address.workChain !== -1)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Unknown workchain');

  if (typeof amount !== 'string' || !/^\d{1,40}$/.test(amount))
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid amount');

  const nanotons = BigInt(amount);

  if (nanotons > MAX_COINS) throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid amount');

  if (extraCurrency !== undefined && !(isRecord(extraCurrency) && Object.keys(extraCurrency).length === 0))
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Extra currencies are not supported');

  const message: TonConnectMessage = {
    address,
    destination: friendly.address,
    bounce: friendly.isBounceable,
    amount: nanotons,
  };

  if (payload !== undefined && payload !== null && payload !== '') message.payload = parseOneCellBoc(payload, 'payload');
  if (stateInit !== undefined && stateInit !== null && stateInit !== '') {
    const cell = parseOneCellBoc(stateInit, 'state init');

    try {
      message.stateInit = loadStateInit(cell.beginParse());
    } catch {
      throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid state init');
    }
    message.stateInitCell = cell;
  }

  return message;
}

/** Unix seconds. Some dApps send milliseconds; such a value is read as milliseconds, as other wallets do. */
function normalizeValidUntil(value: unknown, now: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid valid_until');

  const seconds = value > 1e11 ? Math.floor(value / 1000) : value;

  if (seconds <= now) throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'The request has expired');

  return Math.min(seconds, now + MAX_VALID_FOR_SECONDS);
}

export function parseSendTransactionParams(params: unknown[], account: Address, now: number): TonConnectTransaction {
  if (params.length !== 1 || typeof params[0] !== 'string' || params[0].length > MAX_TRANSACTION_JSON_LENGTH)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid transaction');

  let payload: unknown;

  try {
    payload = JSON.parse(params[0]);
  } catch {
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid transaction');
  }
  if (!isRecord(payload)) throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid transaction');
  if (payload.items !== undefined)
    throw new TonConnectError(RPC_ERROR.METHOD_NOT_SUPPORTED, 'Structured items are not supported; send raw messages');

  const { messages } = payload;

  if (!Array.isArray(messages) || messages.length === 0)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'The transaction has no messages');
  if (messages.length > TON_CONNECT_MAX_MESSAGES)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, `At most ${TON_CONNECT_MAX_MESSAGES} messages are supported`);

  return {
    validUntil: normalizeValidUntil(payload.valid_until, now),
    network: assertNetwork(payload.network),
    from: assertFrom(payload.from, account),
    messages: messages.map(parseMessage),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// signData

export type TonConnectSignData =
  | { type: 'text'; text: string }
  | { type: 'binary'; bytes: Uint8Array }
  | { type: 'cell'; schema: string; cell: Cell };

export type ParsedSignData = {
  data: TonConnectSignData;
  /** The payload as the response echoes it: the fields the signature covers plus `network` and `from`. */
  echo: Record<string, string>;
};

export function parseSignDataParams(params: unknown[], account: Address): ParsedSignData {
  if (params.length !== 1 || typeof params[0] !== 'string' || params[0].length > MAX_SIGN_DATA_JSON_LENGTH)
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid sign data request');

  let payload: unknown;

  try {
    payload = JSON.parse(params[0]);
  } catch {
    throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid sign data request');
  }
  if (!isRecord(payload)) throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid sign data request');

  const network = assertNetwork(payload.network);
  const from = assertFrom(payload.from, account);
  const echo: Record<string, string> = {};
  let data: TonConnectSignData;

  if (payload.type === 'text') {
    if (typeof payload.text !== 'string' || utf8Length(payload.text) > MAX_SIGN_DATA_BYTES)
      throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid text');
    data = { type: 'text', text: payload.text };
    Object.assign(echo, { type: 'text', text: payload.text });
  } else if (payload.type === 'binary') {
    if (typeof payload.bytes !== 'string' || !BASE64_RE.test(payload.bytes) || payload.bytes.length > (MAX_SIGN_DATA_BYTES * 4) / 3 + 4)
      throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid bytes');
    data = { type: 'binary', bytes: Uint8Array.from(Buffer.from(payload.bytes, 'base64')) };
    Object.assign(echo, { type: 'binary', bytes: payload.bytes });
  } else if (payload.type === 'cell') {
    if (typeof payload.schema !== 'string' || payload.schema.length === 0 || payload.schema.length > MAX_SCHEMA_LENGTH)
      throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Invalid schema');
    data = { type: 'cell', schema: payload.schema, cell: parseOneCellBoc(payload.cell, 'cell') };
    Object.assign(echo, { type: 'cell', schema: payload.schema, cell: payload.cell as string });
  } else throw new TonConnectError(RPC_ERROR.METHOD_NOT_SUPPORTED, 'Unsupported sign data type');

  if (network !== undefined) echo.network = network;
  if (from !== undefined) echo.from = from;

  return { data, echo };
}

// ---------------------------------------------------------------------------------------------------------------
// Signed messages

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;

  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });

  return out;
};

const u32 = (value: number, littleEndian: boolean): Uint8Array => {
  const bytes = new Uint8Array(4);

  new DataView(bytes.buffer).setUint32(0, value, littleEndian);

  return bytes;
};

const i32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);

  new DataView(bytes.buffer).setInt32(0, value, false);

  return bytes;
};

const u64 = (value: number, littleEndian: boolean): Uint8Array => {
  const bytes = new Uint8Array(8);

  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), littleEndian);

  return bytes;
};

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

/** The 32 bytes a `ton_proof` signs: sha256(0xffff ++ "ton-connect" ++ sha256(message)). */
export function tonProofSigningHash(input: { address: Address; domain: string; timestamp: number; payload: string }): Uint8Array {
  const domain = utf8(input.domain);
  const message = concat(
    utf8('ton-proof-item-v2/'),
    i32(input.address.workChain),
    input.address.hash,
    u32(domain.length, true),
    domain,
    u64(input.timestamp, true),
    utf8(input.payload)
  );

  return sha256(concat(new Uint8Array([0xff, 0xff]), utf8('ton-connect'), sha256(message)));
}

/** The 32 bytes a `signData` signs: sha256 of the text/binary message, or the hash of the cell message. */
export function signDataSigningHash(input: {
  address: Address;
  domain: string;
  timestamp: number;
  data: TonConnectSignData;
}): Uint8Array {
  const { address, domain, timestamp, data } = input;

  if (data.type === 'cell') {
    return Uint8Array.from(
      beginCell()
        .storeUint(0x75569022, 32)
        .storeUint(crc32(utf8(data.schema)), 32)
        .storeUint(timestamp, 64)
        .storeAddress(address)
        .storeStringRefTail(encodeDnsLikeDomain(domain))
        .storeRef(data.cell)
        .endCell()
        .hash()
    );
  }

  const domainBytes = utf8(domain);
  const payload = data.type === 'text' ? utf8(data.text) : data.bytes;

  return sha256(
    concat(
      new Uint8Array([0xff, 0xff]),
      utf8('ton-connect/sign-data/'),
      i32(address.workChain),
      address.hash,
      u32(domainBytes.length, false),
      domainBytes,
      u64(timestamp, false),
      utf8(data.type === 'text' ? 'txt' : 'bin'),
      u32(payload.length, false),
      payload
    )
  );
}

let crcTable: Uint32Array | undefined;

/** CRC-32 (IEEE 802.3), unsigned, as the `crc-32` package computes the cell schema hash. */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;

      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }

  let crc = 0xffffffff;

  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);

  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------------------------------------------
// What a message does, for the review screen

export type TonMessagePreview = {
  /** The destination in the form the dApp gave it. */
  to: string;
  bounce: boolean;
  /** Nanotons, as a decimal string. */
  amount: string;
  kind: 'transfer' | 'comment' | 'jettonTransfer' | 'nftTransfer' | 'unknown';
  comment?: string;
  /** Hex opcode of a body the wallet does not decode. */
  opcode?: string;
  jetton?: {
    /** In the jetton's elementary units: its decimals are not known here. */
    amount: string;
    destination: string;
    responseDestination?: string;
    forwardTon: string;
    forwardComment?: string;
  };
  nft?: {
    newOwner: string;
    responseDestination?: string;
    forwardTon: string;
  };
  /** The message carries code and data for a new contract. */
  deploysContract: boolean;
};

const friendly = (address: Address | null | undefined): string | undefined =>
  address ? address.toString({ urlSafe: true, bounceable: true }) : undefined;

/** Text with controls that could hide or reorder what is shown is not shown as text. */
export function readableText(value: string): string | undefined {
  return value.length > 0 && !/[\p{Cc}\p{Cf}]/u.test(value.replace(/[\n\r\t]/g, '')) ? value : undefined;
}

function readForwardComment(slice: ReturnType<Cell['beginParse']>): string | undefined {
  try {
    const inRef = slice.loadBit();
    const body = inRef ? slice.loadRef().beginParse() : slice;

    if (body.remainingBits < 32 || body.loadUint(32) !== 0) return undefined;

    return readableText(body.loadStringTail());
  } catch {
    return undefined;
  }
}

export function previewTonMessage(message: TonConnectMessage): TonMessagePreview {
  const preview: TonMessagePreview = {
    to: message.address,
    bounce: message.bounce,
    amount: message.amount.toString(),
    kind: 'transfer',
    deploysContract: !!message.stateInit,
  };

  if (!message.payload) return preview;

  try {
    const slice = message.payload.beginParse();

    if (slice.remainingBits === 0 && slice.remainingRefs === 0) return preview;
    if (slice.remainingBits < 32) return { ...preview, kind: 'unknown' };

    const opcode = slice.loadUint(32);

    if (opcode === 0) {
      const comment = readableText(slice.loadStringTail());

      return comment === undefined ? { ...preview, kind: 'unknown', opcode: '0x00000000' } : { ...preview, kind: 'comment', comment };
    }
    if (opcode === 0x0f8a7ea5) {
      slice.loadUintBig(64);

      const amount = slice.loadCoins();
      const destination = slice.loadAddress();
      const responseDestination = slice.loadMaybeAddress();

      slice.loadMaybeRef();

      const forwardTon = slice.loadCoins();

      return {
        ...preview,
        kind: 'jettonTransfer',
        jetton: {
          amount: amount.toString(),
          destination: friendly(destination)!,
          responseDestination: friendly(responseDestination),
          forwardTon: forwardTon.toString(),
          forwardComment: readForwardComment(slice),
        },
      };
    }
    if (opcode === 0x5fcc3d14) {
      slice.loadUintBig(64);

      const newOwner = slice.loadAddress();
      const responseDestination = slice.loadMaybeAddress();

      slice.loadMaybeRef();

      return {
        ...preview,
        kind: 'nftTransfer',
        nft: {
          newOwner: friendly(newOwner)!,
          responseDestination: friendly(responseDestination),
          forwardTon: slice.loadCoins().toString(),
        },
      };
    }

    return { ...preview, kind: 'unknown', opcode: `0x${opcode.toString(16).padStart(8, '0')}` };
  } catch {
    return { ...preview, kind: 'unknown' };
  }
}
