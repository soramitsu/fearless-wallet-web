import { StakingParams } from '@extension-base/services/staking-service/types';
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
  stashAddress: '',
  stashName: '',
  payeeAddress: '',
  payeeName: '',
  controllerAddress: '',
  controllerName: '',
  isOtherPayee: false,
  isOtherController: false,
  isController: false,
  activeStake: '0',
  totalStake: '0',
  alerts: [],
});

export { getDefaultStakingParams };
