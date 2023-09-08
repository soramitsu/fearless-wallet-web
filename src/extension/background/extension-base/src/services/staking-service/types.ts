import { BasicTxResponse } from '../../background/types/types';
import { NetworkName } from '@/interfaces';

export interface BondParams {
  controller: string;
  stashAccount: string;
  amount: string;
}

export interface ValidatorsRequest {
  networkName: NetworkName;
}

export interface BondRequest extends BondParams {
  networkName: NetworkName;
  address: string;
  password: string;
  from: string;
  callback: (data: BasicTxResponse) => void;
  isSavePass?: boolean;
}

export interface UnbondRequest extends BondParams {
  networkName: NetworkName;
  address: string;
  password: string;
}

export interface RebondRequest extends BondParams {
  networkName: NetworkName;
  address: string;
  password: string;
}

export interface RedeemRequest extends BondParams {
  networkName: NetworkName;
  address: string;
  password: string;
}
