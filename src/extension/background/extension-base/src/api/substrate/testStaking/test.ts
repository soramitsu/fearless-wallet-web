import { ApiPromise } from '@polkadot/api';
import { CodecString, FPNumber } from '@sora-substrate/math';
import { LiquiditySourceTypes } from '@sora-substrate/liquidity-proxy';
import { DexId } from '@sora-substrate/util/build/dex/consts';
import { api as apiSora } from '@sora-substrate/util';
import { formatEra, toCodecString, formatValidatorExposure, formatIndividualRewardPoints } from './helpers';
import type {
  ElectedValidator,
  NominatorReward,
  StakeReturn,
  ValidatorInfo,
  ValidatorInfoFull,
  RewardPointsIndividual,
  Identity,
} from './types';

const countErasInDaily = 4;
const COUNT_DAYS_IN_YEAR = 365;
const COMMISSION_DECIMALS = 9;

async function getAverageRewards(api: ApiPromise, eraIndex?: number): Promise<FPNumber> {
  const erasValidatorRewardPallet = api.query.staking.erasValidatorReward;

  if (eraIndex !== undefined) {
    const eraValidatorReward = await erasValidatorRewardPallet(eraIndex);

    return new FPNumber(eraValidatorReward.value);
  }

  const erasValidatorReward = await erasValidatorRewardPallet.entries();
  const summaryRewards = erasValidatorReward.reduce((sum, [, eraReward]) => {
    const eraRewardValue = eraReward.value.toString();

    return sum.add(FPNumber.fromCodecValue(eraRewardValue));
  }, FPNumber.ZERO);

  const averageRewards = summaryRewards.div(new FPNumber(erasValidatorReward.length));

  return averageRewards;
}

async function getIdentity(address: string, api: ApiPromise): Promise<Identity | null> {
  const identity = await api.query.identity.identityOf(address);

  if (identity.isNone) return null;

  return identity.toHuman() as unknown as Identity;
}

async function getEraRewardPoints(eraIndex: number, api: ApiPromise): Promise<RewardPointsIndividual> {
  const data = await api.query.staking.erasRewardPoints(eraIndex);

  return formatIndividualRewardPoints(data);
}

async function getEraTotalStake(eraIndex: number, api: ApiPromise): Promise<CodecString> {
  const erasTotalStake = await api.query.staking.erasTotalStake(eraIndex);

  return toCodecString(erasTotalStake);
}

async function getCurrentEra(api: ApiPromise): Promise<number> {
  const data = await api.query.staking?.currentEra();

  return formatEra(data);
}

async function getElectedValidators(eraIndex: number, api: ApiPromise): Promise<ElectedValidator[]> {
  const storage = api.query.staking.erasStakers;

  const validators = (await storage.entries(eraIndex)).map(([key, codec]) => {
    const address = key.args[1].toString();
    const data = formatValidatorExposure(codec);

    return { address, ...data };
  });

  return validators;
}

async function getWannabeValidators(api: ApiPromise): Promise<ValidatorInfo[]> {
  const validators = (await api.query.staking.validators.entries()).map(([key, codec]) => {
    const address = key.args[0].toString();
    const { commission, blocked } = codec;

    return {
      address,
      blocked: blocked.isTrue,
      commission: commission.unwrap().toString(),
    };
  });

  return validators;
}

async function calculatingStakeReturn(
  totalStakeValidator: string,
  rewardToStakeRatio: string,
  eraTotalStake: string,
  eraAverageRewards: FPNumber,
  commission: string
): Promise<StakeReturn> {
  const validatorTotalStake = FPNumber.fromCodecValue(totalStakeValidator);

  if (validatorTotalStake.isZero())
    return {
      stakeReturnReward: '0',
      stakeReturn: '0',
      apy: '0',
    };

  const validatorShareStake = validatorTotalStake.div(FPNumber.fromCodecValue(eraTotalStake));
  const stakeReturnReward = eraAverageRewards.mul(validatorShareStake);

  const stakeReturn = stakeReturnReward.mul(FPNumber.fromCodecValue(rewardToStakeRatio));
  const ratioReturnStakeToTotalStake = stakeReturn
    .div(validatorTotalStake)
    .mul(new FPNumber(countErasInDaily))
    .mul(new FPNumber(COUNT_DAYS_IN_YEAR));
  const nominatorShare = FPNumber.ONE.sub(FPNumber.fromCodecValue(commission, COMMISSION_DECIMALS));
  const apy = ratioReturnStakeToTotalStake.sub(FPNumber.ONE).mul(FPNumber.HUNDRED).mul(nominatorShare);

  // console.info(' ');
  // console.info('validatorTotalStake', validatorTotalStake.toString());
  // console.info('validatorShareStake', validatorShareStake.toString());
  // console.info('rewardToStakeRatio', FPNumber.fromCodecValue(rewardToStakeRatio).toString());
  // console.info('stakeReturnReward', stakeReturnReward.toString());
  // console.info('stakeReturn', stakeReturn.toString());
  // console.info('nominatorShare', nominatorShare.toString());
  // console.info('apy', apy.toString());
  // console.info(' ');

  return {
    stakeReturnReward: stakeReturnReward.toString(),
    stakeReturn: stakeReturn.toString(),
    apy: apy.toFixed(2),
  };
}

export async function getNominatorsReward(api: ApiPromise, address: string): Promise<NominatorReward | null> {
  if (!api?.query?.staking) return null;

  const currentEra = await getCurrentEra(api);
  const eraTotalStake = await getEraTotalStake(currentEra, api);
  const electedValidators = await getElectedValidators(currentEra, api);
  const eraAverageRewards = await getAverageRewards(api);

  const nominatorReward = electedValidators.reduce((sum, validator) => {
    const nominatorInfo = validator.others.find(({ who }) => who === address);

    if (!nominatorInfo) return sum;

    const validatorTotalStake = FPNumber.fromCodecValue(validator?.total ?? '0');
    const validatorShareStake = validatorTotalStake.div(FPNumber.fromCodecValue(eraTotalStake));
    const stakeReturnReward = eraAverageRewards.mul(validatorShareStake);

    const nominatorShare = FPNumber.fromCodecValue(nominatorInfo.value).div(validatorTotalStake);
    const nominatorRewardByValidator = nominatorShare.mul(stakeReturnReward);

    return sum.add(nominatorRewardByValidator);
  }, FPNumber.ZERO);

  const rewardPerDay = nominatorReward.mul(new FPNumber(countErasInDaily));

  // console.info('NominatorsReward', {
  //   rewardPerEra: nominatorReward.toString(),
  //   rewardPerDay: rewardPerDay.toString(),
  //   rewardPerYear: rewardPerDay.mul(new FPNumber(COUNT_DAYS_IN_YEAR)).toString(),
  // });

  return {
    rewardPerEra: nominatorReward.toString(),
    rewardPerDay: rewardPerDay.toString(),
    rewardPerYear: rewardPerDay.mul(new FPNumber(COUNT_DAYS_IN_YEAR)).toString(),
  };
}

export async function getValidatorsInfo(api: ApiPromise): Promise<ValidatorInfoFull[]> {
  if (!api?.query?.staking) return [];

  const currentEra = await getCurrentEra(api);
  const electedValidators = await getElectedValidators(currentEra, api);
  const wannabeValidators = await getWannabeValidators(api);
  const eraTotalStake = await getEraTotalStake(currentEra, api);
  const eraAverageRewards = await getAverageRewards(api);
  const eraRewardPoints = await getEraRewardPoints(currentEra, api);

  const { amount: rewardToStakeRatio } = await apiSora.swap.getResultFromBackend(
    '0x0200040000000000000000000000000000000000000000000000000000000000',
    '0x0200000000000000000000000000000000000000000000000000000000000000',
    1,
    false,
    LiquiditySourceTypes.Default,
    DexId.XOR
  );

  const validatorsPromises = wannabeValidators.map<Promise<ValidatorInfoFull>>(async ({ address, commission }) => {
    const electedValidator = electedValidators.find(({ address: _address }) => _address === address);
    const total = electedValidator?.total ?? '0';
    const rewardPoints = eraRewardPoints[address];

    const identity = await getIdentity(address, api);
    const { apy, stakeReturn, stakeReturnReward } = await calculatingStakeReturn(
      total,
      rewardToStakeRatio,
      eraTotalStake,
      eraAverageRewards,
      commission
    );

    return {
      address,
      rewardPoints,
      commission: commission ?? '',
      nominators: electedValidator?.others ?? [],
      identity:
        identity !== null
          ? {
              ...identity,
              info: Object.fromEntries(
                Object.entries(identity.info).map(([key, value]) => {
                  if (value === 'None') return [key, ''];

                  if (!Array.isArray(value) && value?.Raw !== undefined) return [key, value?.Raw];

                  return [key, value];
                })
              ),
            }
          : null,
      apy,
      stake: {
        stakeReturn,
        stakeReturnReward,
        total,
        own: electedValidator?.own ?? '0',
      },
    };
  });

  const validators = await Promise.all(validatorsPromises);

  const sortedValidators = validators.sort((validator1, validator2) => {
    const { apy: apy1, commission: commission1, identity: identity1 } = validator1;
    const { apy: apy2, commission: commission2 } = validator2;

    const subtractionApy = new FPNumber(apy2).sub(new FPNumber(apy1));

    if (!subtractionApy.isZero()) return subtractionApy.toNumber();

    const subtractionCommission = new FPNumber(commission1).sub(new FPNumber(commission2));

    if (!subtractionCommission.isZero()) return subtractionCommission.toNumber();

    if (identity1 === null) return 1;

    const { judgements: judgements1 } = identity1;
    const knownGoodValue1 = judgements1.find(([, type]) => type === 'KnownGood');
    const isKnownGood1 = knownGoodValue1?.[0] === 1;

    return isKnownGood1 ? -1 : 1;
  });

  console.info('sortedValidators', sortedValidators);

  return sortedValidators;
}
