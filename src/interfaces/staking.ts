import type {
  BondExtra,
  Nominate,
  Rebond,
  SetControllerAccount,
  SetPayee,
  Unbond,
  WithdrawUnbonded,
  FWValidatorInfoFull,
} from '@extension-base/services/staking-service/types';

export interface SelectionValidator extends FWValidatorInfoFull {
  isOversubscribed: boolean;
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
