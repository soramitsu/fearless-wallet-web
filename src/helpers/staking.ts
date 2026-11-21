import { type StakingParams } from '@extension-base/services/staking-service/types';
import type { ValidatorInfoFull } from '@/sora/types';
import { type NetworkName } from '@/interfaces';

export function recommendedValidatorAddresses(validators: ValidatorInfoFull[], limit: number): Set<string> {
  const result = new Set<string>();
  const identities = new Set<string>();
  if (!Number.isSafeInteger(limit) || limit <= 0) return result;
  const candidates = [...validators].filter((validator) =>
    validator.blocked !== true && validator.isSlashed === false && validator.isKnownGood === true &&
    validator.isOversubscribed === false && validator.identityKey && Number.isFinite(+validator.apy) && +validator.apy > 0
  ).sort((left, right) => +right.apy - +left.apy);
  for (const validator of candidates) {
    if (identities.has(validator.identityKey!)) continue;
    identities.add(validator.identityKey!);
    result.add(validator.address);
    if (result.size === limit) break;
  }
  return result;
}

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
