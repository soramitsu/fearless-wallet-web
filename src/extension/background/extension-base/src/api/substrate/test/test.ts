import { ApiPromise } from '@polkadot/api';
import { CodecString, FPNumber } from '@sora-substrate/math';
import { LiquiditySourceTypes } from '@sora-substrate/liquidity-proxy';
import { DexId } from '@sora-substrate/util/build/dex/consts';
import { api as apiSora } from '@sora-substrate/util';
import { formatEra, toCodecString, formatValidatorExposure } from './helpers';
import type { ElectedValidator, StakeReturn, ValidatorInfo } from './types';

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
  const ratioReturnStakeToTotalStake = stakeReturn.div(validatorTotalStake).mul(new FPNumber(4)).mul(new FPNumber(365));
  const nominatorShare = FPNumber.ONE.sub(FPNumber.fromCodecValue(commission, 9));
  const apy = ratioReturnStakeToTotalStake.sub(FPNumber.ONE).mul(FPNumber.HUNDRED).mul(nominatorShare);

  console.log(' ');

  console.log('validatorTotalStake', validatorTotalStake.toString());
  console.log('validatorShareStake', validatorShareStake.toString());

  console.log(' ');

  console.log('rewardToStakeRatio', FPNumber.fromCodecValue(rewardToStakeRatio).toString());
  console.log('stakeReturnReward', stakeReturnReward.toString());
  console.log('stakeReturn', stakeReturn.toString());
  console.log('nominatorShare', nominatorShare.toString());
  console.log('apy', apy.toString());

  console.log(' ');

  return {
    stakeReturnReward: stakeReturnReward.toString(),
    stakeReturn: stakeReturn.toString(),
    apy: apy.toFixed(2),
  };
}

export async function calculating(api: ApiPromise) {
  if (!api?.query?.staking) {
    return;
  }

  const currentEra = await getCurrentEra(api);
  const electedValidators = await getElectedValidators(currentEra, api);
  const wannabeValidators = await getWannabeValidators(api);
  const eraTotalStake = await getEraTotalStake(currentEra, api);
  const eraAverageRewards = await getAverageRewards(api);

  const { amount: rewardToStakeRatio } = await apiSora.swap.getResultFromBackend(
    '0x0200040000000000000000000000000000000000000000000000000000000000',
    '0x0200000000000000000000000000000000000000000000000000000000000000',
    1,
    false,
    LiquiditySourceTypes.Default,
    DexId.XOR
  );

  wannabeValidators.forEach(({ address, commission }) => {
    const electedValidator = electedValidators.find(({ address: _address }) => _address === address);
    const totalStakeValidator = electedValidator?.total ?? '0';

    calculatingStakeReturn(totalStakeValidator, rewardToStakeRatio, eraTotalStake, eraAverageRewards, commission);
  });
}
