import { FPNumber, api as apiSora } from '@sora-substrate/util';
import State from '@extension-base/background/handlers/State';
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
} from '@extension-base/services/staking-service/types';
import { NetworkName } from '@/interfaces';
import { getDefaultStakingParams } from '@/helpers/staking';
import { cut } from '@/helpers';

export class StakingService {
  constructor(private state: State) {}

  public async getStakingParams(params: StakingParamsRequest): Promise<StakingParamsResponse> {
    const { networks } = params;

    // TODO use networks
    const promises: Promise<StakingParams>[] = networks.map(async (network) => {
      const apiProps = this.state.getSubstrateApiMap[network];
      const isReady = await apiProps?.api?.isReady;

      if (!isReady) return getDefaultStakingParams(network);

      const validators = await this.getValidators(network);
      const myStakingInfo = await this.getMyStakingInfo(network, validators);
      const apy = validators.reduce((result, { apy }) => result + +apy, 0) / validators.length;

      this.getRewards(network);

      return {
        ...myStakingInfo,
        network,
        validators,
        apy,
        unbondPeriod: this.getUnbondPeriod(),
        maxNominations: this.getMaxNominations(),
        maxNominatorRewardedPerValidator: this.maxNominatorRewardedPerValidator(),
        minBond: await this.getMinNominatorBond(),
      };
    });

    return Promise.all(promises);
  }

  public async getRewards(network: NetworkName) {
    const address = await this.state.getCurrentAddress(network);
    const apiProps = this.state.getSubstrateApiMap[network];

    const stakerRewards = await apiProps.api?.derive.staking.stakerRewards(address);

    console.log('stakerRewards', stakerRewards);

    return 1;
  }

  public async getMyStakingInfo(network: NetworkName, validators?: FWValidatorInfoFull[]): Promise<MyStakingInfo> {
    const address = await this.state.getCurrentAddress(network);

    const stakingInfo = await apiSora.staking.getMyStakingInfo(address);

    return {
      ...stakingInfo,
      myValidators: await this.getValidatorsInfo(network, stakingInfo.myValidators, validators),
    };
  }

  public async getValidatorsInfo(
    network: NetworkName,
    myValidators: string[],
    _validators?: FWValidatorInfoFull[]
  ): Promise<FWValidatorInfoFull[]> {
    const validators = _validators ?? (await this.getValidators(network));

    return validators.filter(({ address }) => myValidators.includes(address));
  }

  public async getValidators(network: NetworkName): Promise<FWValidatorInfoFull[]> {
    const { precision } = getUtilityProps(network);

    const validators: FWValidatorInfoFull[] = (await apiSora.staking.getValidatorsInfo()).map((validator) => {
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

    if (type === 'controllerAccount') return this.setControllerAccount(params as RequestSetControllerAccount);

    if (type === 'payee') return this.setPayee(params as RequestSetPayee);

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
}
