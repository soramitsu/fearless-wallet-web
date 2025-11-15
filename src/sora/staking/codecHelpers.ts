import type { Option } from '@polkadot/types';
import type { Exposure } from '@polkadot/types/interfaces/staking';

export type NumberCodec = { toNumber(): number };
export type StringCodec = { toString(): string };

export type BalanceCodec = StringCodec;

export type LedgerUnlockChunkCodec = {
  value: BalanceCodec;
  era: NumberCodec;
};

export type StakingLedgerCodec = {
  stash: StringCodec;
  total: BalanceCodec;
  active: BalanceCodec;
  unlocking: LedgerUnlockChunkCodec[];
};

export type ActiveEraCodec = {
  index: NumberCodec;
  start: { unwrapOrDefault(): NumberCodec };
};

export type RewardDestinationCodec = {
  isStaked: boolean;
  isController: boolean;
  isStash: boolean;
  isAccount: boolean;
  value: StringCodec;
  toHuman(): string | { Account: string };
};

export type RewardPointEntries = {
  entries(): Iterable<[StringCodec, NumberCodec]>;
};

export type RewardPointsCodec = {
  total: NumberCodec;
  individual: RewardPointEntries;
};

export type ValidatorPrefsCodec = {
  commission: { unwrap(): { toString(): string } };
  blocked: { isTrue: boolean };
};

export type ValidatorExposureCodec = Exposure;

export type OptionCodec<T> = {
  readonly isNone?: boolean;
  readonly isSome?: boolean;
  readonly isEmpty?: boolean;
  unwrap(): T;
  unwrapOrDefault(): T;
};

export const optionIsEmpty = <T>(option: OptionCodec<T>): boolean => {
  if (option.isNone !== undefined) return option.isNone;
  if (option.isSome !== undefined) return !option.isSome;
  if (option.isEmpty !== undefined) return option.isEmpty;
  return false;
};

export const asOptionCodec = <T>(option: Option<any>): OptionCodec<T> => option as unknown as OptionCodec<T>;
