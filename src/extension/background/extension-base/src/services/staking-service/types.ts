import type {
  ValidatorInfoFull,
  Payouts,
  MyStakingInfo as SoraMyStakingInfo,
  Unlocking,
} from '@sora-substrate/util/build/staking/types';
import type { ActivityRequestSign } from '@extension-base/background/types/types';
import type { NetworkName, StakingOperation } from '@/interfaces';

export interface Bond {
  from: string;
  payoutAddress: string;
  networkName: NetworkName;
  amount: string;
  validators: string[];
}

export type RequestBond = ActivityRequestSign<Bond>;

///////////////////////////////////////////////////////

export interface BondExtra {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestBondExtra = ActivityRequestSign<BondExtra>;

///////////////////////////////////////////////////////

export interface Unbond {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestUnbond = ActivityRequestSign<Unbond>;

///////////////////////////////////////////////////////

export interface Rebond {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestRebond = ActivityRequestSign<Rebond>;

///////////////////////////////////////////////////////

export interface WithdrawUnbonded {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestWithdrawUnbonded = ActivityRequestSign<WithdrawUnbonded>;

//////////////////////////////////////////////////////////

export interface SetControllerAccount {
  networkName: NetworkName;
  from: string;
  controllerAddress: string;
}

export type RequestSetControllerAccount = ActivityRequestSign<SetControllerAccount>;

//////////////////////////////////////////////////////////

export interface Nominate {
  from: string;
  networkName: NetworkName;
  validators: string[];
}

export type RequestNominate = ActivityRequestSign<Nominate>;

//////////////////////////////////////////////////////////

export interface SetPayee {
  from: string;
  networkName: NetworkName;
  payee: string;
}

export type RequestSetPayee = ActivityRequestSign<SetPayee>;

//////////////////////////////////////////////////////////

export interface PayoutRewards {
  from: string;
  networkName: NetworkName;
  payouts: Payouts;
}

export type RequestPayoutRewards = ActivityRequestSign<PayoutRewards>;

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

export type GetPayoutsFeeRequest = {
  payouts: Payouts;
  network: NetworkName;
};

export type GetNominateNetworkFeeRequest = {
  validators: string[];
  network: NetworkName;
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

export type Alert = { name: string; timespan: number; formName: string };

export type DefaultStakingParams = {
  stashAddress: string;
  stashName: string;
  payeeAddress: string;
  payeeName: string;
  controllerAddress: string;
  controllerName: string;
  isController: boolean; // аккаунт является Controller аккаунтом для другого аккаунта
  isOtherPayee: boolean; // payee аккаунт не является stash аккаунтом
  isOtherController: boolean; // controller аккаунт не является stash аккаунтом
};

export interface StakingParams extends DefaultStakingParams {
  network: NetworkName;
  unbondPeriod: number;
  maxNominations: number;
  minBond: number;
  maxNominatorRewardedPerValidator: number;
  apy: number;
  validators: FWValidatorInfoFull[];

  // my stake info:
  myValidators: FWValidatorInfoFull[];
  activeStake: string;
  totalStake: string;
  redeemAmount: string;
  alerts: Alert[];
  unbond: {
    unlocking: Unlocking[];
    sum: string;
  };
}

export interface MyStakingInfo extends DefaultStakingParams, Omit<SoraMyStakingInfo, 'myValidators' | 'payee'> {
  myValidators: FWValidatorInfoFull[];
  alerts: Alert[];
}

export type StakingParamsRequest = {
  networks: NetworkName[];
};

export type CheckControllerRequest = {
  address: string;
};

export type getRewardsRequest = {
  network: NetworkName;
  address: string;
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
