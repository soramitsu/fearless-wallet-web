import { ValidatorInfoFull } from '@sora-substrate/util/build/staking/types';
import { PasswordRequestSign } from '../../background/types/types';
import { NetworkName } from '@/interfaces';

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

export type StakingOperation =
  | 'bond'
  | 'bondExtra'
  | 'unbond'
  | 'rebond'
  | 'redeem'
  | 'controllerAccount'
  | 'nominate'
  | 'payee';

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

export type StakingOperationParams =
  | BondExtra
  | Unbond
  | Rebond
  | WithdrawUnbonded
  | SetControllerAccount
  | Nominate
  | SetPayee;

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
  unbond: {
    unlocking: Unlocking[];
    sum: string;
  };
  redeemAmount: string;
  payee: string;
  validators: FWValidatorInfoFull[];
  myValidators: FWValidatorInfoFull[];
};

export type Unlocking_Redeem = {
  unbond: {
    unlocking: Unlocking[];
    sum: string;
  };
  redeem: string;
};

export type StakingParamsRequest = {
  networks: NetworkName[];
};

export type StakingParamsResponse = StakingParams[];

export type StakingNetworkRequest = {
  network: NetworkName;
};

export type MyValidatorsResponse = FWValidatorInfoFull[];

export type UnlockingResponse = Unlocking_Redeem;
