import { api as apiSora } from '@sora-substrate/util';
import { ApiProps, BasicTxResponse, TransferErrorCode } from '../../background/types/types';
import {
  ValidatorsRequest,
  RequestBond,
  RequestUnbond,
  RequestRebond,
  RequestRedeem,
  RequestSetControllerAccount,
  RequestBondExtra,
  MakeStakingRequest,
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

    const validators: FWValidatorInfoFull[] = (await apiSora.staking.getValidatorsInfo()).map((validator) => {
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

  public async makeStaking({ params, type }: MakeStakingRequest): Promise<BasicTxResponse> {
    const { networkName, isSavePass } = params;

    const apiProps = this.getSubstrateApiMap[networkName];

    if (!apiProps.api) return { status: false };

    const isReady = await apiProps.api?.isReady;

    if (!isReady) return { status: false };

    apiSora.shouldPairBeLocked = !isSavePass;

    if (type === 'bond') return this.makeBond(params as RequestBond);

    if (type === 'bondExtra') return this.makeBondExtra(params as RequestBondExtra);

    if (type === 'unbond') return this.makeUnbond(params as RequestUnbond);

    if (type === 'rebond') return this.makeRebond(params as RequestRebond);

    if (type === 'redeem') return this.makeRedeem(params as RequestRedeem);

    return this.setControllerAccount(params as RequestSetControllerAccount);
  }

  public async makeBond(params: RequestBond): Promise<BasicTxResponse> {
    const { amount, controller } = params;

    try {
      // TODO дописать параметры
      apiSora.staking.bond({ value: amount, controller, payee: '' });
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

    return { status: true };
  }

  public async makeBondExtra(params: RequestBondExtra): Promise<BasicTxResponse> {
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

  public async makeUnbond(params: RequestUnbond): Promise<BasicTxResponse> {
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

  public async makeRebond(params: RequestRebond): Promise<BasicTxResponse> {
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

  public async makeRedeem(params: RequestRedeem): Promise<BasicTxResponse> {
    const { amount } = params;

    try {
      //TODO use redeem call
      apiSora.staking.rebond({ value: amount });
    } catch (ex) {
      const message = `[STAKING] Redeem failed: ${ex}`;

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
    const { address } = params;

    try {
      apiSora.staking.setController({ address });
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
}
