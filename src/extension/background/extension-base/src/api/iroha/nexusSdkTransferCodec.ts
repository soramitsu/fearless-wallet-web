import type { IrohaSignedTransaction, IrohaTransferCodec, IrohaTransferCodecInput } from './transfer';
import { deriveIrohaSigningKey } from '@/util/irohaKeyring';

type BinaryLike = ArrayBuffer | ArrayBufferView | number[] | string;

type NexusSignableTransaction = {
  authority: string;
  payloadBytes: BinaryLike;
  payloadHashHex: string;
  signatureAlgorithm: 'ed25519';
  signingPublicKey: BinaryLike | null;
};

type NexusTransferDraft = {
  signable: NexusSignableTransaction;
};

type NexusTransactionCodec = {
  buildTransferPayload(input: Record<string, unknown>): BinaryLike;
  finalizeSignedTransaction(
    signable: NexusSignableTransaction,
    signature: { algorithm: 'ed25519'; signature: Uint8Array },
    signingPublicKey: Uint8Array
  ): BinaryLike | {
    bytes?: BinaryLike;
    hash?: BinaryLike;
    hashHex?: string;
    hash_hex?: string;
    signedTransaction?: BinaryLike;
    signed_transaction?: BinaryLike;
  };
};

type NexusAppClient = {
  buildTransferDraft(input: {
    destinationAccountId: string;
    quantity: string;
    sourceAssetHoldingId: string;
  }): NexusTransferDraft;
};

type NexusAppClientConstructor = new (config: {
  authority: string;
  chainId: string;
  signingPublicKey: Uint8Array;
  transactionCodec: NexusTransactionCodec;
}) => NexusAppClient;

type IrohaNexusSdkTransferCodecDeps = {
  NexusAppClient: NexusAppClientConstructor;
  signEd25519(message: Uint8Array, privateKey: Uint8Array): BinaryLike;
  transactionCodec: NexusTransactionCodec;
};

function createIrohaNexusSdkTransferCodec({
  NexusAppClient,
  signEd25519,
  transactionCodec,
}: IrohaNexusSdkTransferCodecDeps): IrohaTransferCodec {
  if (typeof NexusAppClient !== 'function') throw new Error('iroha_nexus_sdk_unavailable');
  if (typeof signEd25519 !== 'function') throw new Error('iroha_nexus_sdk_unavailable');
  if (
    !transactionCodec ||
    typeof transactionCodec.buildTransferPayload !== 'function' ||
    typeof transactionCodec.finalizeSignedTransaction !== 'function'
  ) {
    throw new Error('iroha_transaction_codec_unavailable');
  }

  return {
    async buildAndSignTransfer(input: IrohaTransferCodecInput): Promise<IrohaSignedTransaction> {
      const publicKey = normalizeHexBytes(input.signingPublicKeyHex, 32, 'invalid_iroha_signing_public_key');
      const signingKey = deriveIrohaSigningKey({
        mnemonic: input.mnemonicOrSeed,
        path: input.derivationPath,
      });

      if (signingKey.publicKeyHex.toLowerCase() !== bytesToHex(publicKey)) {
        throw new Error('iroha_signing_key_mismatch');
      }

      const client = new NexusAppClient({
        authority: input.authority,
        chainId: input.chainId,
        signingPublicKey: publicKey,
        transactionCodec,
      });
      const draft = client.buildTransferDraft({
        destinationAccountId: input.destinationAccountId,
        quantity: input.amount,
        sourceAssetHoldingId: input.sourceAssetId,
      });
      const signable = normalizeSignable(draft.signable);
      const signature = binaryToBytes(
        signEd25519(normalizeHexBytes(signable.payloadHashHex, 32, 'invalid_iroha_payload_hash'), signingKey.privateKeySeed),
        'invalid_iroha_signature'
      );

      if (signature.byteLength !== 64) throw new Error('invalid_iroha_signature');

      return normalizeFinalizedTransaction(
        transactionCodec.finalizeSignedTransaction(signable, { algorithm: 'ed25519', signature }, publicKey)
      );
    },
  };
}

function normalizeSignable(signable: NexusSignableTransaction | undefined): NexusSignableTransaction {
  if (!signable || typeof signable !== 'object') throw new Error('invalid_iroha_signable_transaction');
  binaryToBytes(signable.payloadBytes, 'invalid_iroha_signable_transaction');
  normalizeHexBytes(signable.payloadHashHex, 32, 'invalid_iroha_payload_hash');
  if (signable.signatureAlgorithm !== 'ed25519') throw new Error('invalid_iroha_signature_algorithm');

  return signable;
}

function normalizeFinalizedTransaction(result: ReturnType<NexusTransactionCodec['finalizeSignedTransaction']>): IrohaSignedTransaction {
  const record = isRecord(result) ? result : null;
  const signedCandidate =
    record?.signedTransaction ??
    record?.signed_transaction ??
    record?.bytes ??
    result;
  const signedTransaction = binaryToBytes(signedCandidate, 'invalid_iroha_signed_transaction');
  const hashCandidate = record?.hashHex ?? record?.hash_hex ?? record?.hash;
  const signedTransactionHashHex =
    hashCandidate === undefined ? undefined : normalizeHashCandidate(hashCandidate);

  if (signedTransaction.byteLength === 0) throw new Error('invalid_iroha_signed_transaction');

  return {
    signedTransaction,
    signedTransactionHashHex,
  };
}

function normalizeHashCandidate(value: unknown): string {
  if (typeof value === 'string') return bytesToHex(normalizeHexBytes(value, 32, 'invalid_iroha_signed_transaction_hash'));

  const bytes = binaryToBytes(value, 'invalid_iroha_signed_transaction_hash');

  if (bytes.byteLength !== 32) throw new Error('invalid_iroha_signed_transaction_hash');

  return bytesToHex(bytes);
}

function normalizeHexBytes(value: string, byteLength: number, errorCode: string): Uint8Array {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;

  if (!/^[0-9a-fA-F]+$/u.test(normalized) || normalized.length !== byteLength * 2) {
    throw new Error(errorCode);
  }

  return hexToBytes(normalized.toLowerCase());
}

function binaryToBytes(value: unknown, errorCode: string): Uint8Array {
  if (typeof value === 'string') return hexToBytesFromUnknown(value, errorCode);
  if (value instanceof ArrayBuffer) return new Uint8Array(value).slice();
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  }
  if (Array.isArray(value)) {
    if (!value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error(errorCode);

    return new Uint8Array(value);
  }

  throw new Error(errorCode);
}

function hexToBytesFromUnknown(value: string, errorCode: string): Uint8Array {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;

  if (!/^[0-9a-fA-F]+$/u.test(normalized) || normalized.length % 2 !== 0) throw new Error(errorCode);

  return hexToBytes(normalized.toLowerCase());
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export { createIrohaNexusSdkTransferCodec };
export type { IrohaNexusSdkTransferCodecDeps, NexusTransactionCodec };
