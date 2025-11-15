import type { StakingParams, StakingAssetMetadata } from '@extension-base/services/staking-service/types';
import type { NetworkName } from '@/interfaces';

type DefaultStakingParamsOptions = {
  network: NetworkName;
} & Partial<StakingAssetMetadata>;

const getDefaultStakingParams = (options: DefaultStakingParamsOptions): StakingParams => {
  const { network, asset = '', assetId = '', icon = '', color = '', priceId = '', transferableAmount = '0' } = options;

  return {
    network,
    asset,
    assetId,
    icon,
    color,
    priceId,
    transferableAmount,
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
  };
};

export { getDefaultStakingParams };
