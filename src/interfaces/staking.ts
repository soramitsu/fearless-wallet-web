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

interface SelectionValidator extends Validator {
  isSelect: boolean;
}

interface MyValidator extends Validator {
  rewards: string;
}

export { Validator, SelectionValidator, MyValidator };
