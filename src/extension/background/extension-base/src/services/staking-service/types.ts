import { ValidatorInfoFull } from '@sora-substrate/util/build/staking/types';
import { PasswordRequestSign } from '../../background/types/types';
import { NetworkName, StakingOperation } from '@/interfaces';

export interface Bond {
  from: string;
  payoutAddress: string;
  networkName: NetworkName;
  amount: string;
  validators: string[];
}

export type RequestBond = PasswordRequestSign<Bond>;

///////////////////////////////////////////////////////

export interface BondExtra {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestBondExtra = PasswordRequestSign<BondExtra>;

///////////////////////////////////////////////////////

export interface Unbond {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestUnbond = PasswordRequestSign<Unbond>;

///////////////////////////////////////////////////////

export interface Rebond {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestRebond = PasswordRequestSign<Rebond>;

///////////////////////////////////////////////////////

export interface WithdrawUnbonded {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestWithdrawUnbonded = PasswordRequestSign<WithdrawUnbonded>;

//////////////////////////////////////////////////////////

export interface SetControllerAccount {
  networkName: NetworkName;
  from: string;
  controllerAddress: string;
}

export type RequestSetControllerAccount = PasswordRequestSign<SetControllerAccount>;

//////////////////////////////////////////////////////////

export interface Nominate {
  from: string;
  networkName: NetworkName;
  validators: string[];
}

export type RequestNominate = PasswordRequestSign<Nominate>;

//////////////////////////////////////////////////////////

export interface SetPayee {
  from: string;
  networkName: NetworkName;
  payee: string;
}

export type RequestSetPayee = PasswordRequestSign<SetPayee>;

//////////////////////////////////////////////////////////

export type RequestStaking =
  | RequestBond
  | RequestBondExtra
  | RequestUnbond
  | RequestRebond
  | RequestWithdrawUnbonded
  | RequestSetControllerAccount
  | RequestNominate
  | RequestSetPayee;

export type MakeStakingRequest = {
  params: RequestStaking;
  type: StakingOperation;
};

export interface FWValidatorInfoFull extends ValidatorInfoFull {
  name: string;
  description: string;
}

type Unlocking = {
  value: string;
  remainingEras: string;
  remainingDays: string;
};

export type StakingParams = {
  network: NetworkName;
  unbondPeriod: number;
  maxNominations: number;
  minBond: number;
  maxNominatorRewardedPerValidator: number;
  apy: number;
  validators: FWValidatorInfoFull[];

  // my stake info:
  myValidators: FWValidatorInfoFull[];
  payee: string;
  activeStake: string;
  totalStake: string;
  redeemAmount: string;
  unbond: {
    unlocking: Unlocking[];
    sum: string;
  };
};

export type MyStakingInfo = {
  myValidators: FWValidatorInfoFull[];
  payee: string;
  controller: string;
  redeemAmount: string;
  activeStake: string;
  totalStake: string;
  unbond: {
    unlocking: Unlocking[];
    sum: string;
  };
};

type RewardValidator = FWValidatorInfoFull & {
  total: string;
  value: string;
};

export type EraReward = {
  era: string;
  eraRewards: string;
  validators: RewardValidator[];
};

export type StakingParamsRequest = {
  networks: NetworkName[];
};

export type StakingParamsResponse = StakingParams[];

export type RewardsResponse = {
  rewards: EraReward[];
  sum: string;
};

export type StakingNetworkRequest = {
  network: NetworkName;
};

export type MyValidatorsResponse = FWValidatorInfoFull[];

export type MyStakingInfoResponse = MyStakingInfo;
