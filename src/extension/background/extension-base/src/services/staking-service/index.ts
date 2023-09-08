import { ApiProps } from '../../background/types/types';
import { getValidatorsInfo } from '../../api/substrate/staking';
import type { FWValidatorInfoFull } from '@extension-base/api/substrate/testStaking/types';
import { NetworkName } from '@/interfaces';
import { DAY1 } from '@/consts/time';

type Validators = Record<
  NetworkName,
  {
    value: FWValidatorInfoFull[];
    timespan: number;
  }
>;

export class StakingService {
  validators: Validators = {};

  constructor(private getSubstrateApiMap: Record<string, ApiProps>) {}

  public async getValidators(networkName: NetworkName): Promise<FWValidatorInfoFull[]> {
    if (!this.validators[networkName]) this.validators[networkName] = { value: [], timespan: 0 };

    if (this.validators[networkName].value.length !== 0) {
      if (this.validators[networkName].timespan - Date.now() < DAY1) return this.validators[networkName].value;
    }

    const apiProps = this.getSubstrateApiMap[networkName];
    const api = apiProps.api;

    if (!api) return [];

    const isReady = await api?.isReady;

    if (!isReady) return [];

    // TODO STAKING: использовать функцию из библиотеки
    const validators: FWValidatorInfoFull[] = (await getValidatorsInfo(api)).map((validator) => {
      const name = validator.identity?.info.display ?? 'no validator info';
      const description = validator.identity?.info.twitter ?? validator.identity?.info.web ?? 'no validator info';

      return { ...validator, name, description };
    });

    this.validators[networkName] = {
      value: validators,
      timespan: Date.now(),
    };

    return validators;
  }

  public async bond(networkName: NetworkName) {
    const apiProps = this.getSubstrateApiMap[networkName];
    const api = apiProps.api;

    if (!api) return [];

    const isReady = await api?.isReady;

    if (!isReady) return [];
  }

  public async unbond() {
    console.info(1);
  }

  public async rebond() {
    console.info(1);
  }

  public async redeem() {
    console.info(1);
  }
}
