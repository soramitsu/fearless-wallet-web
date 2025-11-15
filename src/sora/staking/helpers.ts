import { StakingRewardsDestination, RewardPointsIndividual, StashNominatorsInfo, ValidatorExposure } from './types';
import type { Option, u32 } from '@polkadot/types';
import type { Exposure } from '@polkadot/types/interfaces/staking';
import type { OptionCodec } from './codecHelpers';

type RewardPointEntries = {
  entries(): Iterable<[{ toString(): string }, { toNumber(): number }]>;
};

type EraRewardPointsCodec = {
  individual: RewardPointEntries;
};

type NominationsCodec = {
  targets: Array<{ toString(): string }>;
  suppressed: { isTrue: boolean };
  submittedIn: { toNumber(): number };
};

const formatEra = (data: Option<u32>): number => {
  const era = data.unwrap();

  return era.toNumber();
};

const formatIndividualRewardPoints = (data: EraRewardPointsCodec): RewardPointsIndividual => {
  const result: RewardPointsIndividual = {};

  for (const [account, points] of data.individual.entries()) {
    result[account.toString()] = points.toNumber();
  }

  return result;
};

const formatNominations = (codec: OptionCodec<unknown>): StashNominatorsInfo | null => {
  if ((codec.isEmpty ?? false) || (codec.isNone ?? false)) return null;

  const data = codec.unwrap() as NominationsCodec;
  const targets = data.targets.map((target) => target.toString());
  const suppressed = data.suppressed.isTrue;
  const submittedIn = data.submittedIn.toNumber();

  return { targets, suppressed, submittedIn };
};

const formatPayee = (payee: StakingRewardsDestination | string): string | { Account: string } => {
  return payee in StakingRewardsDestination ? payee : { Account: payee };
};

const formatValidatorExposure = (codec: Exposure): ValidatorExposure => {
  return {
    total: codec.total.toString(),
    own: codec.own.toString(),
    others: codec.others.map((item) => ({ who: item.who.toString(), value: item.value.toString() })),
  };
};

export { formatEra, formatPayee, formatNominations, formatValidatorExposure, formatIndividualRewardPoints };
