import type { ValidatorInfoFull, Payouts, MyStakingInfo as SoraMyStakingInfo, Unlocking } from '@sora/staking/types';
import type { ActivityRequestSign, BaseRequestSign } from '@extension-base/background/types/types';
import type { NetworkName, StakingOperation } from '@/interfaces';

export interface Bond extends BaseRequestSign {
  from: string;
  payoutAddress: string;
  networkName: NetworkName;
  amount: string;
  validators: string[];
}

export type RequestBond = ActivityRequestSign<Bond>;

///////////////////////////////////////////////////////

export interface BondExtra extends BaseRequestSign {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestBondExtra = ActivityRequestSign<BondExtra>;

///////////////////////////////////////////////////////

export interface Unbond extends BaseRequestSign {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestUnbond = ActivityRequestSign<Unbond>;

///////////////////////////////////////////////////////

export interface Rebond extends BaseRequestSign {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestRebond = ActivityRequestSign<Rebond>;

///////////////////////////////////////////////////////

export interface WithdrawUnbonded extends BaseRequestSign {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestWithdrawUnbonded = ActivityRequestSign<WithdrawUnbonded>;

//////////////////////////////////////////////////////////

export interface SetControllerAccount extends BaseRequestSign {
  networkName: NetworkName;
  from: string;
  controllerAddress: string;
}

export type RequestSetControllerAccount = ActivityRequestSign<SetControllerAccount>;

//////////////////////////////////////////////////////////

export interface Nominate extends BaseRequestSign {
  from: string;
  networkName: NetworkName;
  validators: string[];
}

export type RequestNominate = ActivityRequestSign<Nominate>;

//////////////////////////////////////////////////////////

export interface SetPayee extends BaseRequestSign {
  from: string;
  networkName: NetworkName;
  payee: string;
}

export type RequestSetPayee = ActivityRequestSign<SetPayee>;

//////////////////////////////////////////////////////////

export interface PayoutRewards extends BaseRequestSign {
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

export type StakingAssetMetadata = {
  asset: string;
  assetId: string;
  icon: string;
  color: string;
  priceId: string;
  transferableAmount: string;
};

export type DefaultStakingParams = StakingAssetMetadata & {
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
