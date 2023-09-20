import type { FWValidatorInfoFull } from '@extension-base/api/substrate/testStaking/types';

interface Validator {
  name: string;
  address: string;
  description: string;
  apy: number;
  isRecommended?: true;
  isSlashed: boolean;
  isOversubscribed: boolean;
  limitValidatorsIdentity: boolean;
  onchainIdentity: boolean;
}

interface SelectionValidator extends FWValidatorInfoFull {
  isSelect: boolean;
}

interface MyValidator extends Validator {
  rewards: string;
}

interface MyValidator extends Validator {
  rewards: string;
}

interface NetworkParams {
  network: string;
  asset: string;
  icon: string;
  unbondPeriod: number;
  maxNominations: number;
  minBond: number;
  apy: number;
  bondAmount: string;
  unbondAmount: string;
  type?: 'regular';
}

export { Validator, SelectionValidator, MyValidator, NetworkParams };
