interface SelectionValidator {
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
