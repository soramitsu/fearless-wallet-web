import { base58Encode } from '@polkadot/util-crypto';
import { deriveSolanaAccount, signSolanaMessage, SOLANA_DEFAULT_DERIVATION_PATH } from '@/util/solanaKeyring';

const SIGNATURE_BYTES = 64;
const PUBLIC_KEY_BYTES = 32;
const VERSION_PREFIX_MASK = 0x80;
const VERSION_VALUE_MASK = 0x7f;
const MAX_COMPACT_U16_BYTES = 3;

export type SolanaTransactionVersion = 'legacy' | 0;

export type ParsedSolanaTransaction = {
  accountKeys: string[];
  addressTableLookupCount: number;
  instructionCount: number;
  messageBytes: Uint8Array;
  messageOffset: number;
  readonlySignedAccounts: number;
  readonlyUnsignedAccounts: number;
  recentBlockhash: string;
  requiredSignatures: number;
  signatureCount: number;
  signaturesOffset: number;
  version: SolanaTransactionVersion;
};

export type SignSolanaTransactionPayload = {
  expectedSigner?: string;
  mnemonic: string;
  path?: string;
  transaction: string | Uint8Array;
};

export type SignedSolanaTransaction = {
  requiredSignatures: number;
  signedTransaction: Uint8Array;
  signedTransactionBase64: string;
  signatureBase58: string;
  signer: string;
  version: SolanaTransactionVersion;
};

export class SolanaTransactionError extends Error {
  constructor(
    readonly code: string,
    message: string = code,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'SolanaTransactionError';
  }
}

export function parseSolanaSerializedTransaction(transaction: string | Uint8Array): ParsedSolanaTransaction {
  const bytes = normalizeTransaction(transaction);
  const signatureCount = readCompactU16(bytes, 0, 'invalid_signature_count');
  const signaturesOffset = signatureCount.offset;
  const messageOffset = signaturesOffset + signatureCount.value * SIGNATURE_BYTES;

  if (signatureCount.value < 1) throw new SolanaTransactionError('missing_signature_slot');
  ensureAvailable(bytes, signaturesOffset, signatureCount.value * SIGNATURE_BYTES, 'truncated_signatures');
  ensureAvailable(bytes, messageOffset, 1, 'missing_message');

  const messageBytes = bytes.slice(messageOffset);
  const message = parseSolanaMessage(messageBytes);

  if (signatureCount.value < message.requiredSignatures) {
    throw new SolanaTransactionError('missing_required_signature_slots');
  }

  return {
    ...message,
    messageBytes,
    messageOffset,
    signatureCount: signatureCount.value,
    signaturesOffset,
  };
}

export function getSolanaSerializedMessageBase64(transaction: string | Uint8Array): string {
  return bytesToBase64(parseSolanaSerializedTransaction(transaction).messageBytes);
}

export function signSolanaSerializedTransaction({
  expectedSigner,
  mnemonic,
  path = SOLANA_DEFAULT_DERIVATION_PATH,
  transaction,
}: SignSolanaTransactionPayload): SignedSolanaTransaction {
  const parsed = parseSolanaSerializedTransaction(transaction);
  const account = deriveSolanaAccount({ mnemonic, path });

  if (expectedSigner !== undefined && account.address !== expectedSigner) {
    throw new SolanaTransactionError('signer_mismatch');
  }

  const signerIndex = parsed.accountKeys.indexOf(account.address);

  if (signerIndex < 0) throw new SolanaTransactionError('signer_not_found');
  if (signerIndex >= parsed.requiredSignatures) throw new SolanaTransactionError('signer_not_required');
  if (signerIndex >= parsed.signatureCount) throw new SolanaTransactionError('missing_signature_slot');

  const signature = signSolanaMessage({ message: parsed.messageBytes, mnemonic, path });
  const signedTransaction = normalizeTransaction(transaction);

  signedTransaction.set(signature.signature, parsed.signaturesOffset + signerIndex * SIGNATURE_BYTES);

  return {
    requiredSignatures: parsed.requiredSignatures,
    signedTransaction,
    signedTransactionBase64: bytesToBase64(signedTransaction),
    signatureBase58: signature.signatureBase58,
    signer: account.address,
    version: parsed.version,
  };
}

function parseSolanaMessage(message: Uint8Array): Pick<
  ParsedSolanaTransaction,
  | 'accountKeys'
  | 'addressTableLookupCount'
  | 'instructionCount'
  | 'readonlySignedAccounts'
  | 'readonlyUnsignedAccounts'
  | 'recentBlockhash'
  | 'requiredSignatures'
  | 'version'
> {
  let offset = 0;
  let version: SolanaTransactionVersion = 'legacy';

  if ((message[offset] & VERSION_PREFIX_MASK) !== 0) {
    const versionValue = message[offset] & VERSION_VALUE_MASK;

    if (versionValue !== 0) throw new SolanaTransactionError('unsupported_transaction_version');

    version = 0;
    offset += 1;
  }

  ensureAvailable(message, offset, 3, 'malformed_message_header');

  const requiredSignatures = message[offset];
  const readonlySignedAccounts = message[offset + 1];
  const readonlyUnsignedAccounts = message[offset + 2];

  offset += 3;

  const accountCount = readCompactU16(message, offset, 'invalid_account_keys');

  offset = accountCount.offset;

  if (accountCount.value < requiredSignatures) throw new SolanaTransactionError('invalid_required_signature_count');
  if (readonlySignedAccounts > requiredSignatures) {
    throw new SolanaTransactionError('invalid_required_signature_count');
  }
  if (readonlyUnsignedAccounts > accountCount.value - requiredSignatures) {
    throw new SolanaTransactionError('invalid_required_signature_count');
  }

  ensureAvailable(message, offset, accountCount.value * PUBLIC_KEY_BYTES, 'truncated_account_keys');

  const accountKeys: string[] = [];

  for (let index = 0; index < accountCount.value; index += 1) {
    accountKeys.push(base58Encode(message.slice(offset, offset + PUBLIC_KEY_BYTES)));
    offset += PUBLIC_KEY_BYTES;
  }

  ensureAvailable(message, offset, PUBLIC_KEY_BYTES, 'truncated_recent_blockhash');
  const recentBlockhash = base58Encode(message.slice(offset, offset + PUBLIC_KEY_BYTES));

  offset += PUBLIC_KEY_BYTES;

  const instructions = skipCompiledInstructions(message, offset);
  let addressTableLookupCount = 0;

  offset = instructions.offset;

  if (version === 0) {
    const addressTableLookups = skipAddressTableLookups(message, offset);

    addressTableLookupCount = addressTableLookups.count;
    offset = addressTableLookups.offset;
  }

  if (offset !== message.length) throw new SolanaTransactionError('trailing_message_bytes');

  return {
    accountKeys,
    addressTableLookupCount,
    instructionCount: instructions.count,
    readonlySignedAccounts,
    readonlyUnsignedAccounts,
    recentBlockhash,
    requiredSignatures,
    version,
  };
}

function skipCompiledInstructions(message: Uint8Array, offset: number): { count: number; offset: number } {
  const instructionCount = readCompactU16(message, offset, 'invalid_instruction_count');

  offset = instructionCount.offset;

  for (let index = 0; index < instructionCount.value; index += 1) {
    ensureAvailable(message, offset, 1, 'truncated_instruction_program');
    offset += 1;

    const accountIndexCount = readCompactU16(message, offset, 'invalid_instruction_accounts');

    offset = accountIndexCount.offset;
    ensureAvailable(message, offset, accountIndexCount.value, 'truncated_instruction_accounts');
    offset += accountIndexCount.value;

    const dataLength = readCompactU16(message, offset, 'invalid_instruction_data');

    offset = dataLength.offset;
    ensureAvailable(message, offset, dataLength.value, 'truncated_instruction_data');
    offset += dataLength.value;
  }

  return {
    count: instructionCount.value,
    offset,
  };
}

function skipAddressTableLookups(message: Uint8Array, offset: number): { count: number; offset: number } {
  const lookupCount = readCompactU16(message, offset, 'invalid_address_table_lookups');

  offset = lookupCount.offset;

  for (let index = 0; index < lookupCount.value; index += 1) {
    ensureAvailable(message, offset, PUBLIC_KEY_BYTES, 'truncated_address_table_lookup');
    offset += PUBLIC_KEY_BYTES;

    const writableCount = readCompactU16(message, offset, 'invalid_address_table_writable_indexes');

    offset = writableCount.offset;
    ensureAvailable(message, offset, writableCount.value, 'truncated_address_table_writable_indexes');
    offset += writableCount.value;

    const readonlyCount = readCompactU16(message, offset, 'invalid_address_table_readonly_indexes');

    offset = readonlyCount.offset;
    ensureAvailable(message, offset, readonlyCount.value, 'truncated_address_table_readonly_indexes');
    offset += readonlyCount.value;
  }

  return {
    count: lookupCount.value,
    offset,
  };
}

function readCompactU16(bytes: Uint8Array, offset: number, code: string): { offset: number; value: number } {
  let value = 0;
  let shift = 0;

  for (let index = 0; index < MAX_COMPACT_U16_BYTES; index += 1) {
    ensureAvailable(bytes, offset, 1, code);

    const byte = bytes[offset];

    offset += 1;
    value |= (byte & 0x7f) << shift;

    if ((byte & 0x80) === 0) return { offset, value };

    shift += 7;
  }

  throw new SolanaTransactionError(code);
}

function ensureAvailable(bytes: Uint8Array, offset: number, length: number, code: string): void {
  if (offset < 0 || length < 0 || offset + length > bytes.length) throw new SolanaTransactionError(code);
}

function normalizeTransaction(transaction: string | Uint8Array): Uint8Array {
  if (transaction instanceof Uint8Array) {
    if (transaction.length === 0) throw new SolanaTransactionError('empty_transaction');

    return new Uint8Array(transaction);
  }

  if (typeof transaction !== 'string' || transaction.length === 0) {
    throw new SolanaTransactionError('empty_transaction');
  }

  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(transaction)) {
    throw new SolanaTransactionError('invalid_transaction_base64');
  }

  return base64ToBytes(transaction);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

    return bytes;
  }

  return Uint8Array.from(Buffer.from(value, 'base64'));
}

export function bytesToBase64(value: Uint8Array): string {
  if (typeof globalThis.btoa === 'function') {
    let binary = '';

    value.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });

    return globalThis.btoa(binary);
  }

  return Buffer.from(value).toString('base64');
}
