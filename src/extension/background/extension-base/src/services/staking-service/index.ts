import { keyring } from '@polkadot/ui-keyring';
import { ApiProps, BasicTxError, BasicTxErrorCode, BasicTxResponse, SignerType } from '../../background/types/types';
import { getValidatorsInfo, bond } from '../../api/substrate/staking';
import { signAndSendExtrinsic } from '../../api/substrate/shared/signAndSendExtrinsic';
import { BondRequest, RebondRequest, RedeemRequest, UnbondRequest, ValidatorsRequest } from './types';
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

  public async getValidators({ networkName }: ValidatorsRequest): Promise<FWValidatorInfoFull[]> {
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

  public async bond({
    networkName,
    address,
    password,
    isSavePass,
    controller,
    amount,
    stashAccount,
    from,
    callback,
  }: BondRequest): Promise<boolean> {
    const txState: BasicTxResponse = {};
    const apiProps = this.getSubstrateApiMap[networkName];
    const errors: Array<BasicTxError> = [];

    if (!apiProps.api) return false;

    const isReady = await apiProps.api?.isReady;

    if (!isReady) return false;

    const pair = keyring.getPair(address);

    try {
      if (pair.isLocked && password) pair.unlock(password);
    } catch (e: any) {
      pair.lock();

      errors.push({
        code: BasicTxErrorCode.KEYRING_ERROR,
        message: String(e.message),
      });
    }

    // TODO STAKING: использовать функцию из библиотеки
    const extrinsic = await bond(apiProps.api, { controller, amount, stashAccount });

    await signAndSendExtrinsic({
      type: SignerType.PASSWORD,
      apiProps,
      callback,
      extrinsic,
      txState,
      password,
      isSavePass,
      address: from,
      errorMessage: 'bond error',
    });

    return true;
  }

  public async unbond({ networkName, address, password }: UnbondRequest): Promise<boolean> {
    const apiProps = this.getSubstrateApiMap[networkName];
    const api = apiProps.api;
    const errors: Array<BasicTxError> = [];

    if (!api) return false;

    const isReady = await api?.isReady;

    if (!isReady) return false;

    const pair = keyring.getPair(address);

    try {
      if (pair.isLocked && password) pair.unlock(password);
    } catch (e: any) {
      pair.lock();

      errors.push({
        code: BasicTxErrorCode.KEYRING_ERROR,
        message: String(e.message),
      });
    }

    return true;
  }

  public async rebond({ networkName, address, password }: RebondRequest): Promise<boolean> {
    const apiProps = this.getSubstrateApiMap[networkName];
    const api = apiProps.api;
    const errors: Array<BasicTxError> = [];

    if (!api) return false;

    const isReady = await api?.isReady;

    if (!isReady) return false;

    const pair = keyring.getPair(address);

    try {
      if (pair.isLocked && password) pair.unlock(password);
    } catch (e: any) {
      pair.lock();

      errors.push({
        code: BasicTxErrorCode.KEYRING_ERROR,
        message: String(e.message),
      });
    }

    return true;
  }

  public async redeem({ networkName, address, password }: RedeemRequest): Promise<boolean> {
    const apiProps = this.getSubstrateApiMap[networkName];
    const api = apiProps.api;
    const errors: Array<BasicTxError> = [];

    if (!api) return false;

    const isReady = await api?.isReady;

    if (!isReady) return false;

    const pair = keyring.getPair(address);

    try {
      if (pair.isLocked && password) pair.unlock(password);
    } catch (e: any) {
      pair.lock();

      errors.push({
        code: BasicTxErrorCode.KEYRING_ERROR,
        message: String(e.message),
      });
    }

    return true;
  }
}
