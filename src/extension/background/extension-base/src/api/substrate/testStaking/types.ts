import type { Vec, Struct, u32, bool, BTreeMap, u128, Enum, Option, U8aFixed } from '@polkadot/types-codec';
import type { AccountId32 } from '@polkadot/types/interfaces/runtime';
import type { ITuple } from '@polkadot/types-codec/types';
import type { Data } from '@polkadot/types';

export enum StakingRewardsDestination {
  /** not used in sora */
  // Staked = 'Staked',
  Stash = 'Stash',
  Controller = 'Controller',
  Account = 'Account',
  None = 'None',
}

export interface ValidatorInfo {
  address: string;
  commission: string;
  blocked?: boolean;
}

export interface ValidatorInfoFull extends ValidatorInfo {
  rewardPoints: number;
  nominators: Others;
  identity: PalletIdentityRegistration;
  apy: string;
  stake: Omit<ValidatorExposure, 'others'>;
}

type Others = {
  who: string;
  value: string;
}[];

export interface ValidatorExposure {
  total: string;
  own: string;
  others: Others;
}

export interface ElectedValidator extends ValidatorExposure {
  address: string;
}

export type StashNominatorsInfo = {
  submittedIn: number; // era in which account submitted the decision to nominate
  suppressed: boolean; // not used currently by substrate and designed for future
  targets: string[]; // list of accountIds of validators nominated by the account
};

export type ActiveEra = {
  index: number; // index of era
  start: number; // timestamp when era was started
};

export type EraElectionStatus = { close: null } | { open: number };

export type RewardPointsIndividual = {
  [key: string]: number;
};

export type EraRewardPoints = {
  total: number;
  individual: RewardPointsIndividual;
};

// To calculate redeemable and unbounding tokens, an active era must be fetched that determines whether an account is ready to claim tokens and unlock them for transfers
export type AccountStakingLedgerUnlock = {
  value: string;
  era: number;
};

export type AccountStakingLedger = {
  stash: string; // address of stash account
  total: string; // active + unlocking (XOR)
  active: string; // still bonded (XOR)
  unlocking: AccountStakingLedgerUnlock[]; // redeemable + unbounding
};

export type StakeReturn = {
  apy: string;
  stakeReturn: string;
  stakeReturnReward: string;
};

export interface PalletStakingNominations extends Struct {
  readonly targets: Vec<AccountId32>;
  readonly submittedIn: u32;
  readonly suppressed: bool;
}

export interface PalletStakingEraRewardPoints extends Struct {
  readonly total: u32;
  readonly individual: BTreeMap<AccountId32, u32>;
}

export type NominatorReward = {
  rewardPerEra: string;
  rewardPerDay: string;
  rewardPerYear: string;
};

export interface PalletIdentityRegistration extends Struct {
  readonly judgements: Vec<ITuple<[u32, PalletIdentityJudgement]>>;
  readonly deposit: u128;
  readonly info: PalletIdentityIdentityInfo;
}

export interface PalletIdentityJudgement extends Enum {
  readonly isUnknown: boolean;
  readonly isFeePaid: boolean;
  readonly asFeePaid: u128;
  readonly isReasonable: boolean;
  readonly isKnownGood: boolean;
  readonly isOutOfDate: boolean;
  readonly isLowQuality: boolean;
  readonly isErroneous: boolean;
  readonly type: 'Unknown' | 'FeePaid' | 'Reasonable' | 'KnownGood' | 'OutOfDate' | 'LowQuality' | 'Erroneous';
}

interface PalletIdentityIdentityInfo extends Struct {
  readonly additional: Vec<ITuple<[Data, Data]>>;
  readonly display: Data;
  readonly legal: Data;
  readonly web: Data;
  readonly riot: Data;
  readonly email: Data;
  readonly pgpFingerprint: Option<U8aFixed>;
  readonly image: Data;
  readonly twitter: Data;
}
