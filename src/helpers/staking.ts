import { NetworkName } from '@/interfaces';

const getDefaultStakingParams = (network: NetworkName) => ({
  network,
  apy: 0,
  unbondPeriod: 0,
  maxNominations: 0,
  minBond: 0,
  unbondAmount: '0',
  withdrawUnbondedAmount: '0',
  validators: [],
  myValidators: [],
});

export { getDefaultStakingParams };
