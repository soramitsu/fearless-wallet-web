import { PasswordRequestSign } from '../../background/types/types';
import { NetworkName } from '@/interfaces';

export interface ValidatorsRequest {
  networkName: NetworkName;
}

export interface ResponseCheckStaking {
  fee: string;
}

///////////////////////////////////////////////////////

export interface Bond {
  stashAccount: string;
  controller: string;
  networkName: NetworkName;
  from: string;
  amount: string;
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

export interface Redeem {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestRedeem = PasswordRequestSign<Redeem>;

//////////////////////////////////////////////////////////

export interface SetControllerAccount {
  networkName: NetworkName;
  from: string;
  address: string;
}

export type RequestSetControllerAccount = PasswordRequestSign<SetControllerAccount>;

//////////////////////////////////////////////////////////

export type RequestCheckStaking = Bond | BondExtra | Unbond | Rebond | Redeem;

export type StakingOperation = 'bond' | 'bondExtra' | 'unbond' | 'rebond' | 'redeem' | 'controllerAccount';

export type RequestStaking =
  | RequestBond
  | RequestBondExtra
  | RequestUnbond
  | RequestRebond
  | RequestRedeem
  | RequestSetControllerAccount;

export type MakeStakingRequest = {
  params: RequestStaking;
  type: StakingOperation;
};
