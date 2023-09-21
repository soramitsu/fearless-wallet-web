import { api as apiSora } from '@sora-substrate/util';
import State from '@extension-base/background/handlers/State';
import { BasicTxResponse, TransferErrorCode } from '../../background/types/types';
import {
  ValidatorsRequest,
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
import type { FWValidatorInfoFull, StakingParams } from '@extension-base/services/staking-service/types';
import { NetworkName } from '@/interfaces';
import { DAY1 } from '@/consts/time';

type Params = Record<NetworkName, StakingParams & { timespan: number }>;

const getStakingParams = (network: string) => ({
  network,
  apy: 0,
  unbondPeriod: 0,
  maxNominations: 0,
  minBond: 0,
  unbondAmount: '0',
  withdrawUnbondedAmount: '0',
  validators: [],
});

export class StakingService {
  stakingParams: Params = {};

  constructor(private state: State) {}

  public async getStakingParams(networks: NetworkName[]): Promise<StakingParamsResponse> {
    // TODO use networks
    const promises: Promise<StakingParams>[] = networks.map(async (network) => {
      if (Date.now() - this.stakingParams[network]?.timespan < DAY1) return this.stakingParams[network];

      const apiProps = this.state.getSubstrateApiMap[network];

      if (!apiProps.api) return getStakingParams(network);

      const isReady = await apiProps.api?.isReady;

      if (!isReady) return getStakingParams(network);

      const validators = await this.getValidators({ networkName: network });
      const summaryApy = validators.reduce((result, { apy }) => result + +apy, 0);
      const apy = summaryApy / validators.length;

      // TODO
      const unbondAmount = '0';
      const withdrawUnbondedAmount = '0';

      return {
        network,
        validators,
        apy,
        unbondAmount,
        withdrawUnbondedAmount,
        unbondPeriod: apiSora.staking.getBondingDuration(),
        maxNominations: apiSora.staking.getMaxNominations(),
        minBond: await apiSora.staking.getMinNominatorBond(),
      };
    });

    const stakingInfos = await Promise.all(promises);
    const timespan = Date.now();

    stakingInfos.forEach((item) => {
      this.stakingParams[item.network] = { ...item, timespan };
    });

    return Promise.all(promises);
  }

  public async getValidators({ networkName }: ValidatorsRequest): Promise<FWValidatorInfoFull[]> {
    console.info('getValidators', networkName);

    const validators: FWValidatorInfoFull[] = (await apiSora.staking.getValidatorsInfo()).map((validator) => {
      const info = validator.identity?.info;
      const name = info?.display || info?.legal || 'no validator info';
      const description = info?.twitter || info?.web || 'no validator info';

      return { ...validator, name, description };
    });

    return validators;
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

    const controller = controllerAddress === from ? '' : controllerAddress; // TODO уточнить как передавать controller если он не нужен
    const payee = controller === '' ? 'Stash' : 'Controller';

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
      apiSora.staking.bondExtra({ value: amount });
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
      apiSora.staking.unbond({ value: amount });
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
      apiSora.staking.rebond({ value: amount });
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
      apiSora.staking.withdrawUnbonded({ value: amount });
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
      apiSora.staking.setController({ address: controllerAddress });
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
