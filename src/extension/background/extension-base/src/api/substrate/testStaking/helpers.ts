import { type Option, type u32 } from '@polkadot/types';
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

const formatValidatorExposure = (codec: Exposure): ValidatorExposure => {
  return {
    total: codec.total.toString(),
    own: codec.own.toString(),
    others: codec.others.map((item) => ({ who: item.who.toString(), value: item.value.toString() })),
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

export { formatEra, formatValidatorExposure, formatNominations, formatIndividualRewardPoints };
