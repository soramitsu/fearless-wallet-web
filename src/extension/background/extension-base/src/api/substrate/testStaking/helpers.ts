import { Option, u32 } from '@polkadot/types';
import { FPNumber } from '@sora-substrate/math';
import type { CodecString } from '@sora-substrate/math';
import type { Exposure } from '@polkadot/types/interfaces/staking';
import type {
  ValidatorExposure,
  StashNominatorsInfo,
  PalletStakingNominations,
  PalletStakingEraRewardPoints,
  RewardPointsIndividual,
} from './types';

const formatEra = (data: Option<u32>): number => {
  const era = data.unwrap();

  return era.toNumber();
};

const toCodecString = (value: any): CodecString => new FPNumber(value).toCodecString();

const formatValidatorExposure = (codec: Exposure): ValidatorExposure => {
  return {
    total: toCodecString(codec.total),
    own: toCodecString(codec.own),
    others: codec.others.map((item) => ({ who: item.who.toString(), value: toCodecString(item.value) })),
  };
};

const formatNominations = (codec: Option<PalletStakingNominations>): StashNominatorsInfo | null => {
  if (codec.isEmpty) return null;

  const data = codec.unwrap();
  const targets = data.targets.map((target) => target.toString());
  const suppressed = data.suppressed.isTrue;
  const submittedIn = data.submittedIn.toNumber();

  return { targets, suppressed, submittedIn };
};

const formatIndividualRewardPoints = (data: PalletStakingEraRewardPoints): RewardPointsIndividual => {
  const result: RewardPointsIndividual = {};

  for (const [account, points] of data.individual.entries()) {
    result[account.toString()] = points.toNumber();
  }

  return result;
};

export { formatEra, toCodecString, formatValidatorExposure, formatNominations, formatIndividualRewardPoints };
