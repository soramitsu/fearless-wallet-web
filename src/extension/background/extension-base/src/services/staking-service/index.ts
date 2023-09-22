import { api as apiSora } from '@sora-substrate/util';
import State from '@extension-base/background/handlers/State';
import { BasicTxResponse, TransferErrorCode } from '../../background/types/types';
import { CurrentAccountState } from '../../stores/CurrentAccountStore';
import { isEthereumNetwork } from '../../background/utils/utils';
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
  StakingParams,
  StakingParamsRequest,
} from '@extension-base/services/staking-service/types';
import { NetworkName } from '@/interfaces';
import { getDefaultStakingParams } from '@/helpers/staking';
import { noTimeHasPassed } from '@/helpers/common';
import { cut } from '@/helpers';

type Params = Record<string, Record<NetworkName, StakingParams & { timespan: number }>>;

export class StakingService {
  stakingParams: Params = {};

  constructor(private state: State) {}

  public async getStakingParams(params: StakingParamsRequest): Promise<StakingParamsResponse> {
    const { networks } = params;

    const currentAccount = await this.state.currentAccount;

    // TODO use networks
    const promises: Promise<StakingParams>[] = networks.map(async (network) => {
      const apiProps = this.state.getSubstrateApiMap[network];

      if (!apiProps.api) return getDefaultStakingParams(network);

      const isReady = await apiProps.api?.isReady;

      if (!isReady) return getDefaultStakingParams(network);

      const validators = await this.getValidators(network, currentAccount);
      const summaryApy = validators.reduce((result, { apy }) => result + +apy, 0);
      const apy = summaryApy / validators.length;
      const myValidators = await this.getMyValidators(network, validators, currentAccount);

      // TODO
      const unbondAmount = '0';
      const withdrawUnbondedAmount = '0';

      return {
        network,
        validators,
        myValidators,
        apy,
        unbondAmount,
        withdrawUnbondedAmount,
        unbondPeriod: apiSora.staking.getBondingDuration(),
        maxNominations: apiSora.staking.getMaxNominations(),
        minBond: await this.getMinNominatorBond(network, currentAccount),
      };
    });

    const stakingInfos = await Promise.all(promises);
    const timespan = Date.now();

    stakingInfos.forEach((item) => {
      if (!this.stakingParams[currentAccount!.address]) this.stakingParams[currentAccount!.address] = {};

      this.stakingParams[currentAccount!.address][item.network] = { ...item, timespan };
    });

    return Promise.all(promises);
  }

  public async getValidators(
    networkName: NetworkName,
    currentAccount: CurrentAccountState
  ): Promise<FWValidatorInfoFull[]> {
    const params = this.stakingParams?.[currentAccount!.address]?.[networkName];

    if (noTimeHasPassed(params?.timespan, 'day')) return params.validators;

    const validators: FWValidatorInfoFull[] = (await apiSora.staking.getValidatorsInfo()).map((validator) => {
      const info = validator.identity?.info;

      const name = info?.display || info?.legal || cut(validator.address);
      const description = info?.twitter || info?.web || 'no validator info';

      return { ...validator, name, description };
    });

    return validators;
  }

  public async getMyValidators(
    network: NetworkName,
    _validators?: FWValidatorInfoFull[],
    _currentAccount?: CurrentAccountState
  ): Promise<FWValidatorInfoFull[]> {
    const currentAccount = _currentAccount ?? (await this.state.currentAccount);
    const validators = _validators ?? (await this.getValidators(network, currentAccount));

    const address = isEthereumNetwork(network) ? currentAccount!.ethereumAddress : currentAccount!.address;
    const nominations = await apiSora.staking.getNominations(address);

    if (nominations === null) return [];

    const addresses = nominations.targets;

    return validators.filter(({ address }) => addresses.includes(address));
  }

  public async getMinNominatorBond(network: NetworkName, currentAccount: CurrentAccountState) {
    const params = this.stakingParams?.[currentAccount!.address]?.[network];

    if (noTimeHasPassed(params?.timespan, 'day')) return params.minBond;

    return await apiSora.staking.getMinNominatorBond();
  }

  public async makeStaking({ params, type }: MakeStakingRequest): Promise<BasicTxResponse> {
    const { networkName, isSavePass } = params;

    const apiProps = this.state.getSubstrateApiMap[networkName];

    if (!apiProps.api) return { status: false };

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

    if (type === 'withdrawUnbonded') return this.withdrawUnbonded(params as RequestWithdrawUnbonded);

    if (type === 'nominate') return this.nominate(params as RequestNominate);

    return this.setControllerAccount(params as RequestSetControllerAccount);
  }

  public async bond(params: RequestBond): Promise<BasicTxResponse> {
    const { amount, controllerAddress, from, isSavePass } = params;

    const controller = controllerAddress !== '' ? controllerAddress : from;
    const payee = controllerAddress !== '' ? 'Controller' : 'Stash'; // TODO ??? уточнить как формировать payee

    try {
      await apiSora.staking.bond({ value: amount, controller, payee });
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
}
