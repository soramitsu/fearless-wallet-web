import {
  type BondExtra,
  type Nominate,
  type Rebond,
  type SetControllerAccount,
  type SetPayee,
  type Unbond,
  type WithdrawUnbonded,
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
  | 'nominate'
  | 'setController'
  | 'setPayee'
  | 'payoutRewards';

export type StakingOperationParams =
  | BondExtra
  | Unbond
  | Rebond
  | WithdrawUnbonded
  | SetControllerAccount
  | Nominate
  | SetPayee;
