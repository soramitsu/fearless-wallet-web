import { FPNumber } from '@sora-substrate/math';
import { state } from '@extension-base/background/handlers';
import { ApiProps, BasicTxResponse, SignerType } from '../../background/types/types';
import { getValidatorsInfo, bond } from '../../api/substrate/staking';
import { signAndSendExtrinsic } from '../../api/substrate/shared/signAndSendExtrinsic';
import { getUtilityProps } from '../../background/utils/utils';
import {
  ValidatorsRequest,
  RequestBond,
  RequestUnbond,
  RequestRebond,
  RequestRedeem,
  RequestSetControllerAccount,
} from './types';
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

    if (!apiProps.api) return [];

    const isReady = await apiProps.api?.isReady;

    if (!isReady) return [];

    // TODO STAKING: использовать функцию из библиотеки
    const validators: FWValidatorInfoFull[] = (await getValidatorsInfo(apiProps.api)).map((validator) => {
      const info = validator.identity?.info;
      const name = info?.display || info?.legal || 'no validator info';
      const description = info?.twitter || info?.web || 'no validator info';

      return { ...validator, name, description };
    });

    this.validators[networkName] = {
      value: validators,
      timespan: Date.now(),
    };

    return validators;
  }

  public async createBondExtrinsic({ networkName, controller, amount, stashAccount, from }: RequestBond) {
    const apiProps = this.getSubstrateApiMap[networkName];

    if (!apiProps.api) return { extrinsic: null, fee: '0' };

    const isReady = await apiProps.api?.isReady;

    if (!isReady) return { extrinsic: null, fee: '0' };

    // TODO STAKING: использовать функцию из библиотеки
    const extrinsic = bond(apiProps.api, { controller, amount, stashAccount });

    const { precision: utilityPrecision } = getUtilityProps(networkName); // стекается всегда утилити токен, ВАЖНО!!! уточнить этот момент

    const paymentInfo = await extrinsic?.paymentInfo(from);
    const partialFee = paymentInfo ? +paymentInfo.partialFee : '0';
    const fee = FPNumber.fromCodecValue(partialFee, utilityPrecision).toString();

    return { extrinsic, fee };
  }

  public async makeBond(params: RequestBond & { callback: (res: BasicTxResponse) => void }): Promise<BasicTxResponse> {
    const { networkName, password, isSavePass, from, callback } = params;

    const isUnlock = state.keyringService.unlockPair(from, password);

    if (!isUnlock) return { status: false, errors: [{ message: 'Invalid password' }] };

    const apiProps = this.getSubstrateApiMap[networkName];

    const { extrinsic } = await this.createBondExtrinsic(params);

    await signAndSendExtrinsic({
      type: SignerType.PASSWORD,
      apiProps,
      callback,
      extrinsic,
      password,
      isSavePass,
      address: from,
      errorMessage: 'bond error',
    });

    return { status: true };
  }

  public async makeUnbond(
    params: RequestUnbond & { callback: (res: BasicTxResponse) => void }
  ): Promise<BasicTxResponse> {
    const { networkName, password, isSavePass, from, callback } = params;

    const isUnlock = state.keyringService.unlockPair(from, password);

    if (!isUnlock) return { status: false, errors: [{ message: 'Invalid password' }] };

    const apiProps = this.getSubstrateApiMap[networkName];

    const { extrinsic } = await this.createBondExtrinsic(params);

    await signAndSendExtrinsic({
      type: SignerType.PASSWORD,
      apiProps,
      callback,
      extrinsic,
      password,
      isSavePass,
      address: from,
      errorMessage: 'bond error',
    });

    return { status: true };
  }

  public async makeRebond(
    params: RequestRebond & { callback: (res: BasicTxResponse) => void }
  ): Promise<BasicTxResponse> {
    const { networkName, password, isSavePass, from, callback } = params;

    const isUnlock = state.keyringService.unlockPair(from, password);

    if (!isUnlock) return { status: false, errors: [{ message: 'Invalid password' }] };

    const apiProps = this.getSubstrateApiMap[networkName];

    const { extrinsic } = await this.createBondExtrinsic(params);

    await signAndSendExtrinsic({
      type: SignerType.PASSWORD,
      apiProps,
      callback,
      extrinsic,
      password,
      isSavePass,
      address: from,
      errorMessage: 'bond error',
    });

    return { status: true };
  }

  public async makeRedeem(
    params: RequestRedeem & { callback: (res: BasicTxResponse) => void }
  ): Promise<BasicTxResponse> {
    const { networkName, password, isSavePass, from, callback } = params;

    const isUnlock = state.keyringService.unlockPair(from, password);

    if (!isUnlock) return { status: false, errors: [{ message: 'Invalid password' }] };

    const apiProps = this.getSubstrateApiMap[networkName];

    const { extrinsic } = await this.createBondExtrinsic(params);

    await signAndSendExtrinsic({
      type: SignerType.PASSWORD,
      apiProps,
      callback,
      extrinsic,
      password,
      isSavePass,
      address: from,
      errorMessage: 'bond error',
    });

    return { status: true };
  }

  public async setControllerAccount(
    params: RequestSetControllerAccount & { callback: (res: BasicTxResponse) => void }
  ): Promise<BasicTxResponse> {
    const { networkName, password, isSavePass, from, callback } = params;

    const isUnlock = state.keyringService.unlockPair(from, password);

    if (!isUnlock) return { status: false, errors: [{ message: 'Invalid password' }] };

    const apiProps = this.getSubstrateApiMap[networkName];

    const { extrinsic } = await this.createBondExtrinsic(params);

    await signAndSendExtrinsic({
      type: SignerType.PASSWORD,
      apiProps,
      callback,
      extrinsic,
      password,
      isSavePass,
      address: from,
      errorMessage: 'bond error',
    });

    return { status: true };
  }
}
