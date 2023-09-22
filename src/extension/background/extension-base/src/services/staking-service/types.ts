import { ValidatorInfoFull } from '@sora-substrate/util/src/staking/types';
import { PasswordRequestSign } from '../../background/types/types';
import { NetworkName } from '@/interfaces';

export interface Bond {
  from: string;
  controllerAddress: string;
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

export type RequestCheckStaking = Bond | BondExtra | Unbond | Rebond | WithdrawUnbonded;

export type StakingOperation =
  | 'bond'
  | 'bondExtra'
  | 'unbond'
  | 'rebond'
  | 'withdrawUnbonded'
  | 'controllerAccount'
  | 'nominate';

export type RequestStaking =
  | RequestBond
  | RequestBondExtra
  | RequestUnbond
  | RequestRebond
  | RequestWithdrawUnbonded
  | RequestSetControllerAccount
  | RequestNominate;

export type MakeStakingRequest = {
  params: RequestStaking;
  type: StakingOperation;
};

export interface FWValidatorInfoFull extends ValidatorInfoFull {
  name: string;
  description: string;
}

export type StakingParams = {
  network: NetworkName;
  unbondPeriod: number;
  maxNominations: number;
  minBond: number;
  apy: number;
  unbondAmount: string;
  withdrawUnbondedAmount: string;
  validators: FWValidatorInfoFull[];
  myValidators: FWValidatorInfoFull[];
};

export type StakingParamsRequest = {
  networks: NetworkName[];
};

export type StakingParamsResponse = StakingParams[];

export type GetMyValidatorsRequest = {
  network: NetworkName;
};

export type GetMyValidatorsResponse = FWValidatorInfoFull[];
