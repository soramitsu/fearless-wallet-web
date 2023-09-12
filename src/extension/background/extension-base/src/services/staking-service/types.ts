import { PasswordRequestSign } from '../../background/types/types';
import { NetworkName } from '@/interfaces';

export interface DefaultBondParams {
  controller: string;
  stashAccount: string;
  amount: string;
}

export interface ValidatorsRequest {
  networkName: NetworkName;
}

export interface ResponseCheckStaking {
  fee: string;
}

///////////////////////////////////////////////////////

export interface Bond extends DefaultBondParams {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestBond = PasswordRequestSign<Bond>;

///////////////////////////////////////////////////////

export interface BondExtra extends DefaultBondParams {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestBondExtra = PasswordRequestSign<BondExtra>;

///////////////////////////////////////////////////////

export interface Unbond extends DefaultBondParams {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestUnbond = PasswordRequestSign<Unbond>;

///////////////////////////////////////////////////////

export interface Rebond extends DefaultBondParams {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestRebond = PasswordRequestSign<Rebond>;

///////////////////////////////////////////////////////

export interface Redeem extends DefaultBondParams {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestRedeem = PasswordRequestSign<Redeem>;

//////////////////////////////////////////////////////////

export interface SetControllerAccount extends DefaultBondParams {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestSetControllerAccount = PasswordRequestSign<SetControllerAccount>;

//////////////////////////////////////////////////////////

export type RequestCheckStaking = Bond | BondExtra | Unbond | Rebond | Redeem;

export type RequestStaking = RequestBond | RequestBondExtra | RequestUnbond | RequestRebond | RequestRedeem;
