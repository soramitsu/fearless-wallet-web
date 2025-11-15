import { FPNumber } from '@sora/math';

import type { OutgoingRequestEncoded, SignatureParams } from '../../types/primitives';

import { toAssetId } from '../../assets';
import { BridgeTxDirection, BridgeTxStatus } from '../consts';
import { EthCurrencyType } from './consts';

import type { EthRequest, EthApprovedRequest } from './types';

type ResultLike<T, E = unknown> = {
  readonly isOk: boolean;
  readonly asOk: T;
  readonly asErr: { toString(): string } & E;
};

type CodecLike = { toString(): string; toNumber?: () => number };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isCodecLike = (value: unknown): value is CodecLike =>
  (typeof value === 'object' && value !== null && typeof (value as { toString?: unknown }).toString === 'function') ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'bigint';

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return value.toString();
  if (isCodecLike(value) && typeof (value as CodecLike).toString === 'function') return (value as CodecLike).toString();

  return undefined;
};

const hasToString = (value: unknown): value is { toString(): string } =>
  typeof value === 'object' && value !== null && typeof (value as { toString?: unknown }).toString === 'function';

const isAssetIdCodec = (value: unknown): value is { code: { toString(): string } } =>
  typeof value === 'object' && value !== null && 'code' in value && hasToString((value as { code?: unknown }).code);

const isAssetIdInput = (value: unknown): value is Parameters<typeof toAssetId>[0] =>
  typeof value === 'string' || hasToString(value) || isAssetIdCodec(value);

const toAssetAddress = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;

  try {
    if (isAssetIdInput(value)) {
      return toAssetId(value);
    }
  } catch {
    // no-op, allow fallback below
  }

  return toOptionalString(value);
};

const toAmountString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;

  try {
    return new FPNumber(value as ConstructorParameters<typeof FPNumber>[0]).toString();
  } catch {
    const stringValue = toOptionalString(value);

    if (stringValue === undefined) return undefined;

    try {
      return new FPNumber(stringValue).toString();
    } catch {
      return undefined;
    }
  }
};

const toAmountCodecString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;

  try {
    return new FPNumber(value as ConstructorParameters<typeof FPNumber>[0]).toCodecString();
  } catch {
    const stringValue = toOptionalString(value);

    if (stringValue === undefined) return undefined;

    try {
      return new FPNumber(stringValue).toCodecString();
    } catch {
      return undefined;
    }
  }
};

const extractHash = (value: Record<string, unknown>): string | undefined => {
  return (
    toOptionalString(value.hash) ??
    toOptionalString(value.hash_) ??
    toOptionalString(value.txHash) ??
    toOptionalString(value.requestHash)
  );
};

const extractLoadIncomingAssetId = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined;

  if ('assetId' in value) return toAssetAddress(value.assetId);

  if ('asTransfer' in value && isRecord(value.asTransfer)) {
    return extractLoadIncomingAssetId(value.asTransfer);
  }

  return undefined;
};

const getIncomingTransfer = (request: unknown) => {
  if (!isRecord(request) || request.isIncoming !== true) return null;

  const incoming = request.asIncoming;

  if (!Array.isArray(incoming) || incoming.length === 0) return null;

  const variant = incoming[0];

  if (!isRecord(variant)) return null;

  const transferCandidate = 'asTransfer' in variant ? variant.asTransfer : null;

  if (!isRecord(transferCandidate)) return null;

  const transfer = transferCandidate;

  const assetId = toAssetAddress(transfer.assetId);
  const amount = toAmountString(transfer.amount);
  const from = toOptionalString(transfer.author ?? transfer.from);
  const kind = toOptionalString(transfer.assetKind);
  const hash = toOptionalString(transfer.txHash ?? transfer.hash ?? transfer.hash_);

  if (!hash) return null;

  return { assetId, amount, from, kind, hash };
};

const getLoadIncomingTransaction = (request: unknown) => {
  if (!isRecord(request) || request.isLoadIncoming !== true) return null;

  const loadIncoming = request.asLoadIncoming;

  if (!isRecord(loadIncoming) || loadIncoming.isTransaction !== true || !isRecord(loadIncoming.asTransaction)) {
    return null;
  }

  const tx = loadIncoming.asTransaction;
  const from = toOptionalString(tx.author);
  const kind = toOptionalString(tx.kind);
  const hash = extractHash(tx);
  const assetId = extractLoadIncomingAssetId(tx.kind);

  if (!hash) return null;

  return { from, kind, hash, assetId };
};

const getOutgoingTransfer = (request: unknown) => {
  if (!isRecord(request) || request.isOutgoing !== true) return null;

  const outgoing = request.asOutgoing;

  if (!Array.isArray(outgoing) || outgoing.length < 2) return null;

  const variant = outgoing[0];
  const hashCodec = outgoing[1];

  if (!isRecord(variant)) return null;

  const transferCandidate = 'asTransfer' in variant ? variant.asTransfer : null;

  if (!isRecord(transferCandidate)) return null;

  const transfer = transferCandidate;

  const assetId = toAssetAddress(transfer.assetId);
  const amount = toAmountString(transfer.amount);
  const from = toOptionalString(transfer.from);
  const to = toOptionalString(transfer.to);
  const hash = toOptionalString(hashCodec);

  if (!hash) return null;

  return { assetId, amount, from, to, hash };
};

const toProofArray = (proofs: unknown): unknown[] => {
  if (!proofs) return [];

  if (Array.isArray(proofs)) return proofs;

  if (isRecord(proofs) && typeof proofs.toArray === 'function') return proofs.toArray();

  if (typeof (proofs as Iterable<unknown>)?.[Symbol.iterator] === 'function') {
    return Array.from(proofs as Iterable<unknown>);
  }

  return [];
};

const extractSignatureParts = (proof: unknown) => {
  if (!isRecord(proof)) return null;

  const r = toOptionalString(proof.r);
  const s = toOptionalString(proof.s);

  let v: number | undefined;

  if (typeof proof.v === 'number') v = proof.v;
  else if (isRecord(proof.v) && typeof proof.v.toNumber === 'function') v = proof.v.toNumber();

  if (!r || !s || typeof v !== 'number') return null;

  return { r, s, v: v + 27 };
};

export function assertRequest<T, E>(result: ResultLike<T, E>, message: string): void {
  if (!result?.isOk) {
    // Throws error
    const err = result?.asErr?.toString?.() ?? 'Unknown bridge error';
    console.error(`[${message}]:`, err);
    throw err;
  }
}

export function formatRequest(request: unknown, status: BridgeTxStatus): EthRequest | null {
  const base: EthRequest = {
    status,
    direction: BridgeTxDirection.Incoming,
    hash: '',
  };

  const incoming = getIncomingTransfer(request);

  if (incoming) {
    base.hash = incoming.hash;
    base.from = incoming.from;
    base.kind = incoming.kind;
    base.soraAssetAddress = incoming.assetId;
    base.amount = incoming.amount;

    return base;
  }

  const loadIncoming = getLoadIncomingTransaction(request);

  if (loadIncoming) {
    base.hash = loadIncoming.hash;
    base.from = loadIncoming.from;
    base.kind = loadIncoming.kind;
    base.soraAssetAddress = loadIncoming.assetId;

    return base;
  }

  const outgoing = getOutgoingTransfer(request);

  if (outgoing) {
    base.direction = BridgeTxDirection.Outgoing;
    base.hash = outgoing.hash;
    base.from = outgoing.from;
    base.to = outgoing.to;
    base.soraAssetAddress = outgoing.assetId;
    base.amount = outgoing.amount;

    return base;
  }

  return null;
}

export function formatApprovedRequest(request: OutgoingRequestEncoded, proofs: unknown): EthApprovedRequest {
  if (!isRecord(request) || !isRecord(request.asTransfer)) {
    throw new Error('Unsupported approved request shape');
  }

  const transferRequest = request.asTransfer;

  const hash = toOptionalString(transferRequest.txHash);
  const from = toOptionalString(transferRequest.from);
  const to = toOptionalString(transferRequest.to);
  const amount = toAmountCodecString(transferRequest.amount) ?? '0';
  const currencyId = isRecord(transferRequest.currencyId) ? transferRequest.currencyId : undefined;

  if (!hash || !from || !to) {
    throw new Error('Incomplete approved transfer data');
  }

  const formattedItem: EthApprovedRequest = {
    hash,
    from,
    to,
    amount,
    currencyType:
      currencyId && (currencyId as { isAssetId?: boolean }).isAssetId
        ? EthCurrencyType.AssetId
        : EthCurrencyType.TokenAddress,
    r: [],
    s: [],
    v: [],
  };

  for (const proof of toProofArray(proofs)) {
    const signature = extractSignatureParts(proof as SignatureParams);

    if (!signature) continue;

    formattedItem.r.push(signature.r);
    formattedItem.s.push(signature.s);
    formattedItem.v.push(signature.v);
  }

  return formattedItem;
}
