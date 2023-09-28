import {
  BondExtra,
  Nominate,
  Rebond,
  SetControllerAccount,
  SetPayee,
  Unbond,
  WithdrawUnbonded,
} from '@extension-base/services/staking-service/types';

export interface SelectionValidator {
  name: string;
  address: string;
  apy: string;
  description: string;
  isOversubscribed: boolean;
  onchainIdentity: boolean;
  isSlashed: boolean;
  limitValidatorsIdentity: boolean;
  isSelect: boolean;
}

export type StakingOperation =
  | 'bond'
  | 'bondExtra'
  | 'unbond'
  | 'rebond'
  | 'redeem'
  | 'controllerAccount'
  | 'nominate'
  | 'payee';

export type StakingOperationParams =
  | BondExtra
  | Unbond
  | Rebond
  | WithdrawUnbonded
  | SetControllerAccount
  | Nominate
  | SetPayee;
