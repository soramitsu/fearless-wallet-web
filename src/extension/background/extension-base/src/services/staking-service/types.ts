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

export interface RequestCheckBond extends DefaultBondParams {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestBond = PasswordRequestSign<RequestCheckBond>;

///////////////////////////////////////////////////////

export interface RequestCheckBondExtra extends DefaultBondParams {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestBondExtra = PasswordRequestSign<RequestCheckBond>;

///////////////////////////////////////////////////////

export interface RequestCheckUnbond extends DefaultBondParams {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestUnbond = PasswordRequestSign<RequestCheckBond>;

///////////////////////////////////////////////////////

export interface RequestCheckRebond extends DefaultBondParams {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestRebond = PasswordRequestSign<RequestCheckBond>;

///////////////////////////////////////////////////////

export interface RequestCheckRedeem extends DefaultBondParams {
  networkName: NetworkName;
  from: string;
  amount: string;
}

export type RequestRedeem = PasswordRequestSign<RequestCheckBond>;

//////////////////////////////////////////////////////////

export type RequestCheckStaking = RequestCheckBond | RequestCheckUnbond | RequestCheckRebond | RequestCheckRedeem;

export type RequestStaking = RequestBond | RequestUnbond | RequestRebond | RequestRedeem;
