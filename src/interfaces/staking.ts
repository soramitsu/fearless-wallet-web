interface Validator {
  name: string;
  address: string;
  description: string;
  isSelect: boolean;
  apy: number;
  isRecommended?: true;
  isSlashed: boolean;
  isOversubscribed: boolean;
  limitValidatorsIdentity: boolean;
  onchainIdentity: boolean;
}

export { Validator };
