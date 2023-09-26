import { StakingParams } from '@/extension/background/extension-base/src/services/staking-service/types';
import { NetworkName } from '@/interfaces';

const getDefaultStakingParams = (network: NetworkName): StakingParams => ({
  network,
  apy: 0,
  unbondPeriod: 0,
  maxNominations: 0,
  minBond: 0,
  maxNominatorRewardedPerValidator: 0,
  unbond: { sum: '0', unlocking: [] },
  redeemAmount: '0',
  validators: [],
  myValidators: [],
  payee: '',
});

export { getDefaultStakingParams };
