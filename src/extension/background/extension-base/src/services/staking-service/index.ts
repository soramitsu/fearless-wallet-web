import { FPNumber, api as apiSora } from '@sora-substrate/util';
import State from '@extension-base/background/handlers/State';
import { storage } from '@extension-base/stores/Storage';
import { BasicTxErrorCode, BasicTxResponse, TransferErrorCode } from '../../background/types/types';
import { getUtilityProps } from '../../background/utils/utils';
import {
  RequestBond,
  RequestUnbond,
  RequestRebond,
  RequestWithdrawUnbonded,
  RequestSetControllerAccount,
  RequestBondExtra,
  MakeStakingRequest,
  StakingParamsResponse,
  RequestNominate,
} from './types';
import type {
  FWValidatorInfoFull,
  RequestSetPayee,
  StakingParams,
  StakingParamsRequest,
  MyStakingInfo,
  RewardsResponse,
  RequestPayoutRewards,
} from '@extension-base/services/staking-service/types';
import { NetworkName } from '@/interfaces';
import { getDefaultStakingParams } from '@/helpers/staking';
import { cut, isSameString } from '@/helpers';
export * from '@sora-substrate/util/build/staking/types';

export class StakingService {
  constructor(private state: State) {}

  public async getStakingParams(params: StakingParamsRequest): Promise<StakingParamsResponse> {
    const { networks } = params;

    // TODO use networks
    const promises: Promise<StakingParams>[] = networks.map(async (network) => {
      const apiProps = this.state.getSubstrateApiMap[network];
      const isReady = await apiProps?.api?.isReady;

      if (!isReady) return getDefaultStakingParams(network);

      const minBond = await this.getMinNominatorBond();
      const validators = await this.getValidators(network);
      const myStakingInfo = await this.getMyStakingInfo(network, validators, minBond);
      const apy = validators.reduce((result, { apy }) => result + +apy, 0) / validators.length;

      return {
        ...myStakingInfo,
        network,
        validators,
        apy,
        unbondPeriod: this.getUnbondPeriod(),
        maxNominations: this.getMaxNominations(),
        maxNominatorRewardedPerValidator: this.maxNominatorRewardedPerValidator(),
        minBond,
      };
    });

    return Promise.all(promises);
  }

  public async getMyStakingInfo(
    network: NetworkName,
    validators: FWValidatorInfoFull[],
    _minBond?: number
  ): Promise<MyStakingInfo> {
    const address = await this.state.getCurrentAddress(network);

    const stakingInfo = await apiSora.staking.getMyStakingInfo(address);
    const { addressBook } = await storage.get(['addressBook']);

    const myAccountName = this.state.keyringService.getAccountName(stakingInfo.payee);
    const addressBookName = addressBook[network]?.find(({ address: _address }) =>
      isSameString(_address, stakingInfo.payee)
    )?.name;
    const payee = myAccountName ?? addressBookName ?? stakingInfo.payee;

    const nameController = this.state.keyringService.getAccountName(stakingInfo.controller);
    const addressBookNameController = addressBook[network]?.find(({ address: _address }) =>
      isSameString(_address, stakingInfo.controller)
    )?.name;
    const controller = nameController ?? addressBookNameController ?? stakingInfo.controller;

    const result = {
      ...stakingInfo,
      payee,
      controller,
      myValidators: this.getValidatorsInformation(stakingInfo.myValidators, validators),
    };

    const minBond = _minBond ?? (await this.getMinNominatorBond());
    const alerts = this.getALerts(result, minBond);

    return { ...result, alerts };
  }

  public async getRewards(network: NetworkName, address: string): Promise<RewardsResponse> {
    const rewards = await apiSora.staking.getNominatorsReward(address);

    const validatorsRewards = rewards.reduce((result, { validators }) => {
      validators.forEach(({ address, value }) => {
        if (!result[address]) result[address] = new FPNumber(value);
        else result[address] = result[address].add(new FPNumber(value));
      });

      return result;
    }, {} as Record<string, FPNumber>);

    const sum = Object.values(validatorsRewards)
      .reduce((sum, rewards) => sum.add(new FPNumber(rewards)), FPNumber.ZERO)
      .toString();

    const allValidators = await this.getValidators(network);

    return {
      sum,
      payouts: rewards.map(({ era, validators }) => ({ era, validators: validators.map(({ address }) => address) })),
      validators: Object.entries(validatorsRewards).map(([address, rewards]) => {
        const info = this.getValidatorsInformation([address], allValidators)[0];

        return {
          ...info,
          rewards: rewards.toString(),
        };
      }),
    };
  }

  public getValidatorsInformation(
    validatorsAddress: string[],
    validators: FWValidatorInfoFull[]
  ): FWValidatorInfoFull[] {
    return validators.filter(({ address }) => validatorsAddress.includes(address));
  }

  public async getValidators(network: NetworkName): Promise<FWValidatorInfoFull[]> {
    const { precision } = getUtilityProps(network, this.state);

    const validatorsInfo = await apiSora.staking.getValidatorsInfo();
    const validators: FWValidatorInfoFull[] = validatorsInfo.map((validator) => {
      const info = validator.identity?.info;

      const name = info?.display || info?.legal || cut(validator.address);
      const description = info?.twitter || info?.web || 'no validator info';

      const stake = Object.fromEntries(
        Object.entries(validator.stake).map(([key, value]) => [
          key,
          FPNumber.fromCodecValue(value, precision).toString(),
        ])
      );

      return { ...validator, name, description, stake } as FWValidatorInfoFull;
    });

    return validators;
  }

  public getALerts(myStakingInfo: Omit<MyStakingInfo, 'alerts'>, minBond: number) {
    const alerts = [];
    const { redeemAmount, myValidators, totalStake } = myStakingInfo;
    const isRedeem = redeemAmount !== '0';
    const isNeedBondExtra = +totalStake < minBond;
    const electedValidators = myValidators.filter(({ isElected }) => isElected);
    const waitingValidators = myValidators.filter(({ isWaiting }) => isWaiting);

    const isEmptyValidators = myValidators.length === 0;
    const isEmptyElectedValidators = electedValidators.length === 0;
    const isWaitingValidators = waitingValidators.length !== 0;

    if (isRedeem) alerts.push({ name: 'redeem', timespan: Date.now() });

    if (isNeedBondExtra) alerts.push({ name: 'bondMoreTokens', timespan: Date.now() });

    // Если нет избранных валидаторов
    if (isEmptyValidators) alerts.push({ name: 'emptyValidators', timespan: Date.now() });
    else {
      // Если нет активных валидаторов и нет валидаторов в режиме ожидания(то есть все валидаторы неактивны)
      if (isEmptyElectedValidators && !isWaitingValidators)
        alerts.push({ name: 'emptyElectedValidators', timespan: Date.now() });
      // Если есть валидаторы в режиме ожидания
      else if (isWaitingValidators) alerts.push({ name: 'waitingForNextEra', timespan: Date.now() });
    }

    return alerts;
  }

  public async getMinNominatorBond() {
    return await apiSora.staking.getMinNominatorBond();
  }

  public getMaxNominations() {
    return apiSora.staking.getMaxNominations();
  }

  public getUnbondPeriod() {
    return apiSora.staking.getUnbondPeriod();
  }

  public maxNominatorRewardedPerValidator() {
    return apiSora.staking.getMaxNominatorRewardedPerValidator();
  }

  public async makeStaking({ params, type }: MakeStakingRequest): Promise<BasicTxResponse> {
    const { networkName, isSavePass } = params;
    const apiProps = this.state.getSubstrateApiMap[networkName];
    const isReady = await apiProps.api?.isReady;

    if (!isReady) return { status: false };

    if (type === 'bond') {
      // после бонда не нужно лочить пару, тк следом идет операция номинейта валидаторов
      apiSora.shouldPairBeLocked = false;

      return this.bond(params as RequestBond);
    }

    apiSora.shouldPairBeLocked = !isSavePass;

    if (type === 'bondExtra') return this.bondExtra(params as RequestBondExtra);

    if (type === 'unbond') return this.unbond(params as RequestUnbond);

    if (type === 'rebond') return this.rebond(params as RequestRebond);

    if (type === 'redeem') return this.withdrawUnbonded(params as RequestWithdrawUnbonded);

    if (type === 'nominate') return this.nominate(params as RequestNominate);

    if (type === 'setController') return this.setControllerAccount(params as RequestSetControllerAccount);

    if (type === 'setPayee') return this.setPayee(params as RequestSetPayee);

    if (type === 'payoutRewards') return this.payoutRewards(params as RequestPayoutRewards);

    return {
      status: false,
      errors: [{ message: '[STAKING] unknown operation', code: BasicTxErrorCode.INVALID_PARAM }],
    };
  }

  public async bond(params: RequestBond): Promise<BasicTxResponse> {
    const { amount, payoutAddress, from, isSavePass } = params;

    try {
      await apiSora.staking.bond({ value: amount, controller: from, payee: payoutAddress }); // Controller аккаунт по умолчанию это Stash
    } catch (ex) {
      const message = `[STAKING] Bond failed: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.BOND_ERROR,
            message,
          },
        ],
      };
    }

    apiSora.shouldPairBeLocked = !isSavePass;

    // nominate status
    const { status } = await this.nominate(params);

    return { status };
  }

  public async bondExtra(params: RequestBondExtra): Promise<BasicTxResponse> {
    const { amount } = params;

    try {
      await apiSora.staking.bondExtra({ value: amount });
    } catch (ex) {
      const message = `[STAKING] BondExtra failed: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.BONDEXTRA_ERROR,
            message,
          },
        ],
      };
    }

    return { status: true };
  }

  public async unbond(params: RequestUnbond): Promise<BasicTxResponse> {
    const { amount } = params;

    try {
      await apiSora.staking.unbond({ value: amount });
    } catch (ex) {
      const message = `[STAKING] Unbond failed: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.UNBOND_ERROR,
            message,
          },
        ],
      };
    }

    return { status: true };
  }

  public async rebond(params: RequestRebond): Promise<BasicTxResponse> {
    const { amount } = params;

    try {
      await apiSora.staking.rebond({ value: amount });
    } catch (ex) {
      const message = `[STAKING] Rebond failed: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.REBOND_ERROR,
            message,
          },
        ],
      };
    }

    return { status: true };
  }

  public async withdrawUnbonded(params: RequestWithdrawUnbonded): Promise<BasicTxResponse> {
    const { amount } = params;

    try {
      await apiSora.staking.withdrawUnbonded({ value: amount });
    } catch (ex) {
      const message = `[STAKING] WithdrawUnbonded failed: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.REDEEM_ERROR,
            message,
          },
        ],
      };
    }

    return { status: true };
  }

  public async setControllerAccount(params: RequestSetControllerAccount): Promise<BasicTxResponse> {
    const { controllerAddress } = params;

    try {
      await apiSora.staking.setController({ address: controllerAddress });
    } catch (ex) {
      const message = `[STAKING] Set controller failed: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.SET_CONTROLLER_ERROR,
            message,
          },
        ],
      };
    }

    return { status: true };
  }

  public async nominate(params: RequestNominate): Promise<BasicTxResponse> {
    const { validators } = params;

    try {
      await apiSora.staking.nominate({ validators });
    } catch (ex) {
      const message = `[STAKING] Nominate failed: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.NOMINATE_ERROR,
            message,
          },
        ],
      };
    }

    return { status: true };
  }

  public async setPayee(params: RequestSetPayee): Promise<BasicTxResponse> {
    const { payee } = params;

    try {
      await apiSora.staking.setPayee({ payee });
    } catch (ex) {
      const message = `[STAKING] Set payee failed: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.SET_PAYEE_ERROR,
            message,
          },
        ],
      };
    }

    return { status: true };
  }

  public async payoutRewards({ payouts }: RequestPayoutRewards): Promise<BasicTxResponse> {
    try {
      await apiSora.staking.payout({ payouts });
    } catch (ex) {
      const message = `[STAKING] Payout rewards: ${ex}`;

      console.info(message);

      return {
        status: false,
        errors: [
          {
            code: TransferErrorCode.PAYOUT_REWARDS_ERROR,
            message,
          },
        ],
      };
    }

    return { status: true };
  }
}
