import { NetworkId } from '@iroha/iroha-js/browser';
import {
  browserTransactionPayloadHashHex,
  buildBrowserExecutableBatchPayload,
  buildBrowserTransferPayload,
  validateBrowserExecutableBatchSignable,
  validateBrowserTransferSignable,
  type BrowserFeePayment,
  type BrowserTransactionMetadataValue,
} from '@iroha/iroha-js/transaction-codec';
import { blake3 } from '@noble/hashes/blake3';
import { sha256 } from '@noble/hashes/sha256';

import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { encodeIrohaI105Address } from '@/util/iroha';

// A Connect `SignRequestTx` carries an unsigned transaction payload. The wallet signs its hash only after decoding
// every signature-bound field into a review and proving the review is the payload: the decoded values are rebuilt
// with the SDK's canonical builders and must reproduce the exact bytes. Anything the browser codec cannot rebuild
// (instructions that need the SDK's native decoder, proof attachments, foreign authorities) is refused, never signed.

export type IrohaConnectTransactionErrorCode =
  | 'unsupported_transaction'
  | 'invalid_transaction'
  | 'wrong_network'
  | 'wrong_authority';

export class IrohaConnectTransactionError extends Error {
  constructor(
    readonly code: IrohaConnectTransactionErrorCode,
    readonly detail: string
  ) {
    super(`${code}: ${detail}`);
    this.name = 'IrohaConnectTransactionError';
  }
}

export interface IrohaConnectReviewAsset {
  definitionId: string;
  symbol?: string;
}

export interface IrohaConnectReviewFeeLimit {
  kind: 'nexus' | 'pipelineGas';
  asset: IrohaConnectReviewAsset;
  maxAmount: string;
}

export interface IrohaConnectReviewFee {
  payer: 'authority' | 'sponsor';
  program?: string;
  programRevision?: string;
  chargeLimits: IrohaConnectReviewFeeLimit[];
  gasLimit: string | null;
}

export interface IrohaConnectReviewContractCall {
  contractAddress: string;
  entrypoint: string;
  codeHashHex: string;
  argumentBytes: number | null;
  argumentsSha256: string | null;
}

export interface IrohaConnectTransactionReview {
  kind: 'transfer' | 'contract-calls';
  authority: string;
  networkId: string;
  payloadBytes: number;
  payloadHashHex: string;
  creationTimeMs: string;
  ttlMs: string | null;
  nonce: string | null;
  fee: IrohaConnectReviewFee;
  /** Canonical metadata JSON with control and bidirectional characters escaped, or null when empty. */
  metadata: string | null;
  transfer?: {
    asset: IrohaConnectReviewAsset;
    scope: string | null;
    quantity: string;
    destination: string;
  };
  calls?: IrohaConnectReviewContractCall[];
}

export interface ReviewedIrohaConnectTransaction {
  review: IrohaConnectTransactionReview;
  /** The marked Blake2b-256 payload hash the transaction key signs. */
  payloadHash: Uint8Array;
}

export interface IrohaConnectTransactionExpectation {
  networkId: string;
  networkPrefix: number;
  authority: string;
  signingPublicKeyHex: string;
}

const MAX_PAYLOAD_BYTES = 1024 * 1024;
const MAX_REVIEW_TEXT = 512;
const MAX_METADATA_TEXT = 2048;
const MAX_ENTRIES = 64;
const WIRE_ID_TRANSFER = 'iroha.transfer';
const ASSET_DEFINITION_VERSION = 1;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;
const strictTextDecoder = new TextDecoder('utf-8', { fatal: true });

const KNOWN_ASSETS = new Map<string, string>([
  [UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset.id, UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset.symbol],
]);

const invalid = (detail: string): never => {
  throw new IrohaConnectTransactionError('invalid_transaction', detail);
};

const unsupported = (detail: string): never => {
  throw new IrohaConnectTransactionError('unsupported_transaction', detail);
};

/** Escape control, format (including bidi) and line-separator characters, then bound the text. */
export const sanitizeIrohaConnectReviewText = (value: string, maximum = MAX_REVIEW_TEXT): string => {
  const escaped = value.replace(
    UNSAFE_TEXT,
    (character) => `\\u{${(character.codePointAt(0) ?? 0).toString(16).toUpperCase()}}`
  );
  return escaped.length > maximum ? `${escaped.slice(0, maximum - 1)}…` : escaped;
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../gu) ?? [], (pair) => parseInt(pair, 16));

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const compactLengthSize = (value: bigint): number => {
  let size = 1;
  for (let remaining = value >> 7n; remaining > 0n; remaining >>= 7n) size += 1;
  return size;
};

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
      return invalid(`${this.label}.${label} is truncated`);
    }
    const output = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return output;
  }

  readU8(label: string): number {
    return this.readBytes(1, label)[0];
  }

  readU32(label: string): number {
    const bytes = this.readBytes(4, label);
    return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
  }

  readU64(label: string): bigint {
    const bytes = this.readBytes(8, label);
    return new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, true);
  }

  /** Transaction payload fields carry canonical LEB128 ("compact") length prefixes. */
  readField(label: string): Uint8Array {
    const start = this.offset;
    let length = 0n;
    let shift = 0n;
    for (let index = 0; index < 10; index += 1) {
      const byte = this.readU8(`${label}.length`);
      length |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        if (this.offset - start !== compactLengthSize(length)) invalid(`${this.label}.${label} length is not canonical`);
        if (length > BigInt(this.remaining)) return invalid(`${this.label}.${label} is truncated`);
        return this.readBytes(Number(length), label);
      }
      shift += 7n;
    }
    return invalid(`${this.label}.${label} length prefix is invalid`);
  }

  /** The transfer instruction's frame container keeps a fixed u64 length prefix. */
  readFieldU64(label: string): Uint8Array {
    const length = this.readU64(`${label}.length`);
    if (length > BigInt(this.remaining)) return invalid(`${this.label}.${label} is truncated`);
    return this.readBytes(Number(length), label);
  }

  done(): void {
    if (this.remaining !== 0) invalid(`${this.label} has trailing bytes`);
  }
}

const readText = (archive: Uint8Array, label: string): string => {
  const reader = new Reader(archive, label);
  const value = reader.readField('utf8');
  reader.done();
  try {
    return strictTextDecoder.decode(value);
  } catch {
    return invalid(`${label} is not UTF-8`);
  }
};

const readU64Field = (bytes: Uint8Array, label: string): bigint => {
  if (bytes.length !== 8) invalid(`${label} must be a u64`);
  return new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, true);
};

const readOptionUnsigned = (bytes: Uint8Array, width: 4 | 8, label: string): bigint | null => {
  const reader = new Reader(bytes, label);
  const tag = reader.readU8('tag');
  if (tag === 0) {
    reader.done();
    return null;
  }
  if (tag !== 1) return invalid(`${label} has an invalid option tag`);
  const value = reader.readField('value');
  reader.done();
  if (value.length !== width) invalid(`${label} has the wrong width`);
  const view = new DataView(value.buffer, value.byteOffset, width);
  return width === 8 ? view.getBigUint64(0, true) : BigInt(view.getUint32(0, true));
};

const readElementBytes = (bytes: Uint8Array, count: number, label: string): Uint8Array => {
  const reader = new Reader(bytes, label);
  const output = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const element = reader.readField(`[${index}]`);
    if (element.length !== 1) invalid(`${label}[${index}] must be one byte`);
    output[index] = element[0];
  }
  reader.done();
  return output;
};

const readAccount = (archive: Uint8Array, label: string, networkPrefix: number): string => {
  const reader = new Reader(archive, label);
  if (reader.readU32('controller') !== 0) unsupported(`${label} is not a single-key account`);
  const controller = new Reader(reader.readField('key'), `${label}.key`);
  reader.done();
  if (controller.readU64('count') !== 33n) invalid(`${label} key must be 33 bytes`);
  const key = readElementBytes(controller.readBytes(controller.remaining, 'bytes'), 33, `${label}.key`);
  if (key[0] !== 0) unsupported(`${label} is not an Ed25519 account`);
  try {
    return encodeIrohaI105Address(bytesToHex(key.subarray(1)), networkPrefix);
  } catch {
    return invalid(`${label} has an invalid public key`);
  }
};

const base58 = (bytes: Uint8Array): string => {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let output = '';
  while (value > 0n) {
    output = BASE58_ALPHABET[Number(value % 58n)] + output;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    output = `1${output}`;
  }
  return output;
};

const readAssetDefinition = (archive: Uint8Array, label: string): IrohaConnectReviewAsset => {
  const definition = readElementBytes(archive, 16, label);
  const versioned = Uint8Array.of(ASSET_DEFINITION_VERSION, ...definition);
  const definitionId = base58(Uint8Array.of(...versioned, ...blake3(versioned).subarray(0, 4)));
  const symbol = KNOWN_ASSETS.get(definitionId);
  return symbol ? { definitionId, symbol } : { definitionId };
};

const readScope = (archive: Uint8Array, label: string): string | null => {
  const reader = new Reader(archive, label);
  const tag = reader.readU32('tag');
  if (tag === 0) {
    reader.done();
    return null;
  }
  if (tag !== 1) return invalid(`${label} has an unsupported tag`);
  const outer = new Reader(reader.readField('dataspace'), `${label}.dataspace`);
  reader.done();
  const value = readU64Field(outer.readField('value'), `${label}.dataspace`);
  outer.done();
  return `dataspace:${value.toString()}`;
};

const readQuantity = (archive: Uint8Array, label: string): string => {
  const reader = new Reader(archive, label);
  const mantissaArchive = new Reader(reader.readField('mantissa'), `${label}.mantissa`);
  const scaleBytes = reader.readField('scale');
  reader.done();
  const mantissaBytes = mantissaArchive.readBytes(mantissaArchive.readU32('length'), 'bytes');
  mantissaArchive.done();
  if (scaleBytes.length !== 4) invalid(`${label}.scale must be a u32`);
  const scale = new DataView(scaleBytes.buffer, scaleBytes.byteOffset, 4).getUint32(0, true);
  if (scale > 28 || mantissaBytes.length === 0 || mantissaBytes.length > 64) invalid(`${label} is out of range`);
  let mantissa = 0n;
  for (let index = mantissaBytes.length - 1; index >= 0; index -= 1) {
    mantissa = (mantissa << 8n) | BigInt(mantissaBytes[index]);
  }
  if ((mantissaBytes[mantissaBytes.length - 1] & 0x80) !== 0) invalid(`${label} must be positive`);
  const digits = mantissa.toString().padStart(scale + 1, '0');
  return scale === 0 ? digits : `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
};

type DecodedFee = { review: IrohaConnectReviewFee; builder: BrowserFeePayment };

const readFee = (archive: Uint8Array, networkPrefix: number): DecodedFee => {
  const reader = new Reader(archive, 'feePayment');
  const payer = reader.readU32('payer');
  const body = new Reader(reader.readField('value'), 'feePayment.value');
  reader.done();
  if (payer > 1) unsupported('feePayment uses an unknown payer');
  let program: { sponsor: string; name: string } | undefined;
  let programRevision: bigint | undefined;
  if (payer === 1) {
    const programId = new Reader(body.readField('programId'), 'feePayment.programId');
    const sponsor = readAccount(programId.readField('sponsor'), 'feePayment.sponsor', networkPrefix);
    const name = readText(programId.readField('name'), 'feePayment.programId.name');
    programId.done();
    program = { sponsor, name };
    programRevision = readU64Field(body.readField('programRevision'), 'feePayment.programRevision');
  }
  const limits = new Reader(body.readField('chargeLimits'), 'feePayment.chargeLimits');
  const count = limits.readU64('count');
  if (count > 2n) invalid('feePayment has too many charge limits');
  const chargeLimits: IrohaConnectReviewFeeLimit[] = [];
  for (let index = 0; index < Number(count); index += 1) {
    const entry = new Reader(limits.readField(`[${index}]`), `feePayment.chargeLimits[${index}]`);
    const kindBytes = entry.readField('kind');
    if (kindBytes.length !== 4) invalid('feePayment charge kind must be a u32');
    const kindTag = new DataView(kindBytes.buffer, kindBytes.byteOffset, 4).getUint32(0, true);
    if (kindTag > 1) unsupported('feePayment uses an unknown charge kind');
    const asset = readAssetDefinition(entry.readField('assetDefinitionId'), 'feePayment.assetDefinitionId');
    const maxAmount = readQuantity(entry.readField('maxAmount'), 'feePayment.maxAmount');
    entry.done();
    chargeLimits.push({ kind: kindTag === 0 ? 'nexus' : 'pipelineGas', asset, maxAmount });
  }
  limits.done();
  const gasLimit = readOptionUnsigned(body.readField('gasLimit'), 8, 'feePayment.gasLimit');
  body.done();

  const builderLimits = chargeLimits.map(({ kind, asset, maxAmount }) => ({
    kind,
    assetDefinitionId: asset.definitionId,
    maxAmount,
  }));
  const gasLimitText = gasLimit === null ? null : gasLimit.toString();
  const review: IrohaConnectReviewFee = {
    payer: program ? 'sponsor' : 'authority',
    chargeLimits,
    gasLimit: gasLimitText,
  };
  if (!program) {
    return { review, builder: { payer: 'authority', chargeLimits: builderLimits, gasLimit: gasLimitText } };
  }
  const programLiteral = `${program.sponsor}/${program.name}`;
  review.program = sanitizeIrohaConnectReviewText(programLiteral);
  review.programRevision = programRevision!.toString();
  return {
    review,
    builder: {
      payer: 'sponsor',
      programId: programLiteral,
      programRevision: programRevision!.toString(),
      chargeLimits: builderLimits,
      gasLimit: gasLimitText,
    },
  };
};

const readMetadata = (archive: Uint8Array): Record<string, unknown> => {
  const reader = new Reader(archive, 'metadata');
  const count = reader.readU64('count');
  if (count > BigInt(MAX_ENTRIES)) invalid('metadata has too many entries');
  const metadata: Record<string, unknown> = Object.create(null);
  for (let index = 0; index < Number(count); index += 1) {
    const entry = new Reader(reader.readField(`[${index}]`), `metadata[${index}]`);
    const key = readText(entry.readField('key'), `metadata[${index}].key`);
    const json = new Reader(entry.readField('json'), `metadata[${index}].json`);
    const text = readText(json.readField('value'), `metadata[${index}].json`);
    json.done();
    entry.done();
    if (Object.prototype.hasOwnProperty.call(metadata, key)) invalid('metadata keys must be unique');
    try {
      metadata[key] = JSON.parse(text);
    } catch {
      invalid(`metadata.${key} is not JSON`);
    }
  }
  reader.done();
  return metadata;
};

type DecodedExecutable =
  | {
      kind: 'transfer';
      sourceOwner: string;
      asset: IrohaConnectReviewAsset;
      scope: string | null;
      quantity: string;
      destination: string;
    }
  | {
      kind: 'contract-calls';
      calls: Array<{
        contractAddress: string;
        expectedCodeHash: Uint8Array;
        entrypoint: string;
        arguments: Uint8Array | null;
      }>;
    };

const readTransferInstruction = (archive: Uint8Array, networkPrefix: number): DecodedExecutable => {
  const instruction = new Reader(archive, 'instruction');
  const wireId = readText(instruction.readField('wireId'), 'instruction.wireId');
  if (wireId !== WIRE_ID_TRANSFER) {
    return unsupported(`instruction ${sanitizeIrohaConnectReviewText(wireId, 96)} needs the native decoder`);
  }
  const container = new Reader(instruction.readField('frameContainer'), 'instruction.frameContainer');
  instruction.done();
  const frame = container.readFieldU64('frame');
  container.done();
  // NRT0 header: magic(4) version(2) schema(16) reserved(1) length(8) crc64(8) flags(1). The rebuild below checks
  // the schema hash, checksum and flags byte for byte.
  if (frame.length < 40) invalid('transfer frame is truncated');
  const transfer = new Reader(frame.subarray(40), 'transfer');
  if (transfer.readU32('variant') !== 2) unsupported('only Transfer::Asset is reviewable');
  const body = new Reader(transfer.readField('body'), 'transfer.body');
  transfer.done();
  const source = new Reader(body.readField('source'), 'transfer.source');
  const sourceOwner = readAccount(source.readField('owner'), 'transfer.source.owner', networkPrefix);
  const asset = readAssetDefinition(source.readField('definition'), 'transfer.source.definition');
  const scope = readScope(source.readField('scope'), 'transfer.source.scope');
  source.done();
  const quantity = readQuantity(body.readField('quantity'), 'transfer.quantity');
  const destination = readAccount(body.readField('destination'), 'transfer.destination', networkPrefix);
  body.done();
  return { kind: 'transfer', sourceOwner, asset, scope, quantity, destination };
};

const readContractCall = (archive: Uint8Array) => {
  const invocation = new Reader(archive, 'contractCall');
  const contractAddress = readText(invocation.readField('contractAddress'), 'contractCall.contractAddress');
  const expectedCodeHash = invocation.readField('expectedCodeHash').slice();
  if (expectedCodeHash.length !== 32) invalid('contractCall.expectedCodeHash must be 32 bytes');
  const entrypoint = readText(invocation.readField('entrypoint'), 'contractCall.entrypoint');
  const option = new Reader(invocation.readField('arguments'), 'contractCall.arguments');
  invocation.done();
  const tag = option.readU8('tag');
  let args: Uint8Array | null = null;
  if (tag === 1) {
    const record = new Reader(option.readField('value'), 'contractCall.arguments.value');
    const length = record.readU64('length');
    args = record.readBytes(Number(length), 'bytes').slice();
    record.done();
  } else if (tag !== 0) {
    invalid('contractCall.arguments has an invalid option tag');
  }
  option.done();
  return { contractAddress, expectedCodeHash, entrypoint, arguments: args };
};

const readExecutable = (archive: Uint8Array, networkPrefix: number): DecodedExecutable => {
  const executable = new Reader(archive, 'executable');
  const variant = executable.readU32('variant');
  const list = new Reader(executable.readField('items'), 'executable.items');
  executable.done();
  const count = list.readU64('count');
  if (count === 0n || count > BigInt(MAX_ENTRIES)) invalid('executable has no or too many entries');

  if (variant === 0) {
    if (count !== 1n) unsupported('instruction lists other than one asset transfer need the native decoder');
    const decoded = readTransferInstruction(list.readField('[0]'), networkPrefix);
    list.done();
    return decoded;
  }
  if (variant !== 4) return unsupported(`executable variant ${variant} is not reviewable`);

  const calls: Extract<DecodedExecutable, { kind: 'contract-calls' }>['calls'] = [];
  for (let index = 0; index < Number(count); index += 1) {
    const entry = new Reader(list.readField(`[${index}]`), `executable.entries[${index}]`);
    const tag = entry.readU32('variant');
    const value = entry.readField('value');
    entry.done();
    if (tag !== 1) unsupported('batches with native instructions need the native decoder');
    calls.push(readContractCall(value));
  }
  list.done();
  return { kind: 'contract-calls', calls };
};

const codecDetail = (error: unknown): string => {
  const code = (error as { code?: unknown })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeIrohaConnectReviewText(typeof code === 'string' ? `${code}: ${message}` : message, 240);
};

export const reviewIrohaConnectTransaction = (
  txBytes: Uint8Array,
  expected: IrohaConnectTransactionExpectation
): ReviewedIrohaConnectTransaction => {
  if (txBytes.length === 0 || txBytes.length > MAX_PAYLOAD_BYTES) invalid('payload size is out of range');
  const networkId = NetworkId.parse(expected.networkId);
  const reader = new Reader(txBytes, 'payload');

  const domain = new Reader(reader.readField('domain'), 'payload.domain');
  if (domain.readU32('variant') !== 0) unsupported('payload must target a network domain');
  const payloadNetwork = domain.readField('networkId');
  domain.done();
  if (!bytesEqual(payloadNetwork, networkId.toBytes())) {
    throw new IrohaConnectTransactionError('wrong_network', 'payload targets another network');
  }
  const authority = readAccount(reader.readField('authority'), 'payload.authority', expected.networkPrefix);
  if (authority !== expected.authority) {
    throw new IrohaConnectTransactionError('wrong_authority', 'payload is not for the connected account');
  }
  const creationTimeMs = readU64Field(reader.readField('creationTimeMs'), 'payload.creationTimeMs');
  const executable = readExecutable(reader.readField('executable'), expected.networkPrefix);
  const ttlMs = readOptionUnsigned(reader.readField('ttlMs'), 8, 'payload.ttlMs');
  const nonce = readOptionUnsigned(reader.readField('nonce'), 4, 'payload.nonce');
  const fee = readFee(reader.readField('feePayment'), expected.networkPrefix);
  const metadata = readMetadata(reader.readField('metadata'));
  const attachments = reader.readField('attachments');
  reader.done();
  if (attachments.length !== 1 || attachments[0] !== 0) unsupported('proof attachments are not reviewable');

  const common = {
    networkId,
    networkPrefix: expected.networkPrefix,
    authority,
    feePayment: fee.builder,
    metadata: { ...metadata } as Record<string, BrowserTransactionMetadataValue>,
    creationTimeMs: creationTimeMs.toString(),
    ttlMs: ttlMs === null ? null : ttlMs.toString(),
    nonce: nonce === null ? null : nonce.toString(),
  };

  let rebuilt: Uint8Array;
  try {
    rebuilt =
      executable.kind === 'transfer'
        ? buildBrowserTransferPayload({
            ...common,
            sourceAssetHoldingId: [executable.asset.definitionId, executable.sourceOwner, executable.scope]
              .filter((part): part is string => part !== null)
              .join('#'),
            quantity: executable.quantity,
            destinationAccountId: executable.destination,
          })
        : buildBrowserExecutableBatchPayload({
            ...common,
            entries: executable.calls.map((call) => ({ kind: 'contractCall' as const, ...call })),
          });
  } catch (error) {
    return invalid(`payload is not canonical: ${codecDetail(error)}`);
  }
  if (!bytesEqual(new Uint8Array(rebuilt), txBytes)) invalid('payload is not the canonical encoding of its fields');

  let payloadHashHex: string;
  try {
    const signable = {
      networkId,
      networkPrefix: expected.networkPrefix,
      payloadBytes: txBytes,
      authority,
      signingPublicKey: expected.signingPublicKeyHex,
      signatureAlgorithm: 'ed25519' as const,
    };
    const constraints = {
      networkId,
      networkPrefix: expected.networkPrefix,
      authority: expected.authority,
      signingPublicKey: expected.signingPublicKeyHex,
    };
    const validate =
      executable.kind === 'transfer' ? validateBrowserTransferSignable : validateBrowserExecutableBatchSignable;
    // The validator recomputes the hash from the bytes and refuses a mismatching assertion.
    payloadHashHex = validate(
      { ...signable, payloadHashHex: browserTransactionPayloadHashHex(txBytes, expected.networkPrefix) },
      constraints
    ).payloadHashHex;
  } catch (error) {
    if (error instanceof IrohaConnectTransactionError) throw error;
    return invalid(`payload does not validate: ${codecDetail(error)}`);
  }

  const metadataKeys = Object.keys(metadata);
  const metadataText =
    metadataKeys.length === 0
      ? null
      : sanitizeIrohaConnectReviewText(
          JSON.stringify(Object.fromEntries(metadataKeys.map((key) => [key, metadata[key]]))),
          MAX_METADATA_TEXT
        );
  const review: IrohaConnectTransactionReview = {
    kind: executable.kind,
    authority,
    networkId: networkId.literal,
    payloadBytes: txBytes.length,
    payloadHashHex,
    creationTimeMs: creationTimeMs.toString(),
    ttlMs: ttlMs === null ? null : ttlMs.toString(),
    nonce: nonce === null ? null : nonce.toString(),
    fee: fee.review,
    metadata: metadataText,
  };
  if (executable.kind === 'transfer') {
    review.transfer = {
      asset: executable.asset,
      scope: executable.scope,
      quantity: executable.quantity,
      destination: executable.destination,
    };
  } else {
    review.calls = executable.calls.map((call) => ({
      contractAddress: sanitizeIrohaConnectReviewText(call.contractAddress),
      entrypoint: sanitizeIrohaConnectReviewText(call.entrypoint),
      codeHashHex: bytesToHex(call.expectedCodeHash),
      argumentBytes: call.arguments === null ? null : call.arguments.length,
      argumentsSha256: call.arguments === null ? null : bytesToHex(sha256(call.arguments)),
    }));
  }

  return { review, payloadHash: hexToBytes(payloadHashHex) };
};
