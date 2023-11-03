import {
  ValidatorInfoFull,
  Payouts,
  MyStakingInfo as SoraMyStakingInfo,
  Unlocking,
} from '@sora-substrate/util/build/staking/types';
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

export interface PayoutRewards {
  from: string;
  networkName: NetworkName;
  payouts: Payouts;
}

export type RequestPayoutRewards = PasswordRequestSign<PayoutRewards>;

//////////////////////////////////////////////////////////

export type RequestStaking =
  | RequestBond
  | RequestBondExtra
  | RequestUnbond
  | RequestRebond
  | RequestWithdrawUnbonded
  | RequestSetControllerAccount
  | RequestNominate
  | RequestSetPayee
  | RequestPayoutRewards;

export type MakeStakingRequest = {
  params: RequestStaking;
  type: StakingOperation;
};

export interface FWValidatorInfoFull extends ValidatorInfoFull {
  name: string;
  description: string;
  status: string;
  isActive: boolean;
  isInactive: boolean;
  isWaiting: boolean;
  isOversubscribed: boolean;
}

export type Alert = { name: string; timespan: number };

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
  controller: string;
  redeemAmount: string;
  unbond: {
    unlocking: Unlocking[];
    sum: string;
  };
  alerts: Alert[];
};

export interface MyStakingInfo extends Omit<SoraMyStakingInfo, 'myValidators'> {
  myValidators: FWValidatorInfoFull[];
  alerts: Alert[];
}

export type StakingParamsRequest = {
  networks: NetworkName[];
};

export type StakingParamsResponse = StakingParams[];

export type ValidatorReward = FWValidatorInfoFull & {
  rewards: string;
};

export type RewardsResponse = {
  validators: ValidatorReward[];
  sum: string; // per all current Eras
  payouts: Payouts;
};

export type StakingNetworkRequest = {
  network: NetworkName;
};

export type MyValidatorsResponse = FWValidatorInfoFull[];

export type MyStakingInfoResponse = MyStakingInfo;

export type ValidatorStatuses = {
  validatorsOversubscribed: string[];
  validatorsWaiting: string[];
  validatorsActive: string[];
  validatorsInactive: string[];
};
