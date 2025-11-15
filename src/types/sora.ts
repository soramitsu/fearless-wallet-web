export type { CodecString } from '@sora/math';
export type { Asset } from '@sora/assets/types';
export { DexId } from '@sora/dex/consts';
export type { NetworkFeesObject } from '@sora/types';
export type { AccountLiquidity } from '@sora/poolXyk/types';

export type OptionLike<T> = {
  readonly isEmpty: boolean;
  readonly isSome?: boolean;
  readonly value?: T;
  unwrap(): T;
  unwrapOr(value: T | null): T | null;
  toString(): string;
};

export type VecLike<T> = {
  toArray(): T[];
  values?: () => Iterable<T>;
};

export type TupleLike<A, B> = {
  0: A;
  1: B;
  length: 2;
};

export type CodecLike = {
  toString(): string;
};

export type BTreeSetLike<T> = {
  values(): Iterable<T>;
};

export type AssetIdCodec = CodecLike;
