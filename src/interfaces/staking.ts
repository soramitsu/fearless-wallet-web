import type { FWValidatorInfoFull } from '@extension-base/services/staking-service/types';

interface SelectionValidator extends FWValidatorInfoFull {
  isSelect: boolean;
}

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

interface MyValidator extends Validator {
  rewards: string;
}

export { Validator, SelectionValidator, MyValidator };
