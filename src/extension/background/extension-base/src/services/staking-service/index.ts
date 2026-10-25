import { decodeAddress } from '@polkadot/util-crypto';
import { storage } from '@extension-base/stores/Storage';
import { BasicTxErrorCode, type BasicTxResponse, TransferErrorCode } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import type {
  RequestBond,
  RequestUnbond,
  RequestRebond,
  RequestWithdrawUnbonded,
  RequestSetControllerAccount,
  RequestBondExtra,
  MakeStakingRequest,
  StakingParamsResponse,
  RequestNominate,
  FWValidatorInfoFull,
  RequestSetPayee,
  StakingParams,
  StakingParamsRequest,
  MyStakingInfo,
  RewardsResponse,
  RequestPayoutRewards,
  ValidatorStatuses,
  GetPayoutsFeeRequest,
  GetNominateNetworkFeeRequest,
  getRewardsRequest,
} from '@extension-base/services/staking-service/types';
import { FPNumber, api as apiSora } from '@/sora';
import { getUtilityProps } from '@/extension/background/extension-base/src/background/handlers/utils';
import { type NetworkName } from '@/interfaces';
import { getDefaultStakingParams } from '@/helpers/staking';
import { cut, isSameString } from '@/helpers';
import { IS_EXTENSION } from '@/consts/global';
import { assertWalletAllowsRecoveryAction, isRecoveryStakingAction, isStoredWalletRecoveryOnly } from '@/util/walletRecoveryActions';
import { isCapturedSoraPairStillSelected, isLocallySignableSelectedSoraPair } from '@/defi/soraAccountBinding';
export * from '@/sora/types';

export class StakingService {
  constructor(private state: State) {}

  private async recoveryPayoutDestination(selectedAddress: string): Promise<{ payee?: string }> {
    if (!IS_EXTENSION || !isStoredWalletRecoveryOnly(this.state.keyringService.getAllAccounts(), selectedAddress)) return {};

    const address = apiSora.formatAddress(selectedAddress);
    // Only a controller with a live ledger may set the stash's destination.
    // A stash using a separate controller must retain its existing safe payee.
    if (await apiSora.staking.getStashByController(address)) return { payee: 'Stash' };

    const { payee, controller } = await apiSora.staking.getMyStakingInfo(address);
    if (payee === 'Staked') {
      throw new Error('Select the staking controller wallet to claim rewards without restaking.');
    }
    if (payee === 'Stash' || (payee === 'Controller' && controller)) return {};
    if (payee && payee !== 'None' && payee !== 'Controller') {
      try { decodeAddress(payee); return {}; } catch { /* Unknown destinations are not safe to claim. */ }
    }
    throw new Error('This staking account has no payable reward destination. Refresh staking details and check whether rewards remain claimable.');
  }

  public async getStakingParams(params: StakingParamsRequest): Promise<StakingParamsResponse> {
    const { networks } = params;

    // TODO use networks
    const promises: Promise<StakingParams>[] = networks.map(async (network) => {
      const apiProps = this.state.getSubstrateApiMap[network.toLowerCase()];
      const isReady = await apiProps?.api?.isReady;

      if (!isReady) return getDefaultStakingParams(network);

      const validators = await this.getValidators(network);
      const minBond = await this.getMinNominatorBond(validators, network);
      const myStakingInfo = await this.getMyStakingInfo(network, validators, minBond);
      const validatorsFilters = validators.filter(({ apy }) => apy !== '0');
      const apy = validatorsFilters.length
        ? validatorsFilters.reduce((result, { apy }) => result + +apy, 0) / validatorsFilters.length
        : 0;

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
    const _address = this.state.getCurrentAddress(network);
    const currentWallet = { address: _address, ethereumAddress: _address };
    const stashByController = await this.getStashByController(_address);
    const stashAddress = stashByController !== '' ? stashByController : this.state.formatAddress(currentWallet);

    const stashWallet = { address: stashAddress, ethereumAddress: stashAddress };

    const isController = stashByController !== '' && !this.state.isSameAddress(stashWallet, currentWallet);

    const address = isController ? this.state.formatAddress(stashWallet) : _address;

    const stakingInfo = await apiSora.staking.getMyStakingInfo(address);
    const { addressBook } = await storage.get(['addressBook']);
    const isControllerAndPayeeStaked = isController && stakingInfo.payee.toLowerCase() === 'staked';
    const isControllerAndPayeeStash = isController && stakingInfo.payee.toLowerCase() === 'stash';
    const isControllerAndPayeeController = isController && stakingInfo.payee.toLowerCase() === 'controller';

    const validatorsStatuses = await this.getValidatorsStatuses(address, network, stakingInfo.myValidators);

    const stashAccountName = this.state.keyringService.getAccountName(stashAddress);
    const stashBookName = addressBook[network]?.find(({ address: _address }) =>
      isSameString(_address, stashAddress)
    )?.name;
    const stashName = stashAccountName ?? stashBookName ?? stashAddress;

    const payeeAddress = isControllerAndPayeeController
      ? this.state.formatAddress(currentWallet, network)
      : isControllerAndPayeeStaked || isControllerAndPayeeStash
      ? stashAddress
      : stakingInfo.payee;

    const payeeAccountName = this.state.keyringService.getAccountName(payeeAddress);
    const payeeBookName = addressBook[network]?.find(({ address: _address }) =>
      isSameString(_address, payeeAddress)
    )?.name;
    const payeeName = payeeAccountName ?? payeeBookName ?? payeeAddress;

    const controllerAddress = stakingInfo.controller;
    const controllerAccountName = this.state.keyringService.getAccountName(controllerAddress);
    const controllerBookName = addressBook[network]?.find(({ address: _address }) =>
      isSameString(_address, controllerAddress)
    )?.name;
    const controllerName = controllerAccountName ?? controllerBookName ?? controllerAddress;

    const isOtherPayee = payeeAddress !== this.state.formatAddress(stashWallet, network);

    const isOtherController = isController
      ? false
      : controllerAddress !== this.state.formatAddress(stashWallet, network);

    const result = {
      ...stakingInfo,
      stashAddress,
      stashName,
      payeeName,
      payeeAddress,
      controllerAddress,
      controllerName,
      isController,
      isOtherPayee,
      isOtherController,
      myValidators: this.getValidatorsInformation(stakingInfo.myValidators, validators).map((info) => {
        const isActive = validatorsStatuses.validatorsActive.includes(info.address);
        const isInactive = validatorsStatuses.validatorsInactive.includes(info.address);
        const isWaiting = validatorsStatuses.validatorsWaiting.includes(info.address);
        const isOversubscribed = validatorsStatuses.validatorsOversubscribed.includes(info.address);

        const status = isActive ? 'active' : isInactive ? 'inactive' : isWaiting ? 'waiting' : 'oversubscribed ';

        return { ...info, isActive, isInactive, isWaiting, isOversubscribed, status };
      }),
    };

    const minBond = _minBond ?? (await this.getMinNominatorBond(validators, network));
    const alerts = this.getALerts(result, minBond);

    return { ...result, alerts };
  }

  public async getValidatorsStatuses(
    _address: string,
    network: NetworkName,
    myValidators: string[]
  ): Promise<ValidatorStatuses> {
    const substrateAddress = this.state.keyringService.getSubstrateAddress(_address);
    const ethereumAddress = this.state.keyringService.getEthereumAddress(_address);
    const address = this.state.formatAddress({ address: substrateAddress, ethereumAddress }, network);
    const max = this.maxNominatorRewardedPerValidator();
    const activeEra = await apiSora.staking.getCurrentEra();
    const submittedIn = (await apiSora.staking.getNominations(address))?.submittedIn;
    const electedValidators = await apiSora.staking.getElectedValidators(activeEra);

    // all nominations that are oversubscribed
    const validatorsOversubscribed = electedValidators
      .map((exposure) => {
        if (!max) return null;

        const others = exposure.others.sort((a, b) => +(b.value ?? 0) - +(a.value ?? 0));

        if (max > others.map(({ who }) => who.toString()).indexOf(address)) return null;

        return myValidators.find((address) => isSameString(address, exposure.address));
      })
      .filter((validator): validator is string => !!validator); // && !nomsChilled.includes(nominee)

    // first a blanket find of nominations not in the active set
    const allValidatorsInactive = electedValidators
      .map((exposure) => {
        if (exposure.others.some(({ who }) => isSameString(who, address))) return null;

        return myValidators.find((address) => isSameString(address, exposure.address));
      })
      .filter((validator): validator is string => !!validator);

    // waiting if validator is inactive or we have not submitted long enough ago
    const validatorsWaiting = electedValidators
      .map((exposure) => {
        const validatorAddress = myValidators.find((address) => isSameString(address, exposure.address));

        if (exposure.total === '0') return validatorAddress;

        if (allValidatorsInactive.includes(validatorAddress!) && (submittedIn ?? 0) >= +activeEra)
          return validatorAddress;

        return null;
      })
      .filter((validator): validator is string => !!validator)
      .filter((validator) => !validatorsOversubscribed.includes(validator)); // && !nomsChilled.includes(nominee)

    // filter based on all inactives
    const validatorsActive = myValidators.filter(
      (validator) => !allValidatorsInactive.includes(validator) && !validatorsOversubscribed.includes(validator) // && !nomsChilled.includes(nominee)
    );

    // inactive also contains waiting, remove those
    const validatorsInactive = allValidatorsInactive.filter(
      (validator) => !validatorsWaiting.includes(validator) && !validatorsOversubscribed.includes(validator) // && !nomsChilled.includes(nominee)
    );

    return { validatorsOversubscribed, validatorsWaiting, validatorsActive, validatorsInactive };
  }

  public async getRewards({ address, network }: getRewardsRequest): Promise<RewardsResponse> {
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
    const electedValidators = myValidators.filter(({ isActive }) => isActive);
    const waitingValidators = myValidators.filter(({ isWaiting }) => isWaiting);

    const isEmptyValidators = myValidators.length === 0;
    const isEmptyElectedValidators = electedValidators.length === 0;
    const isWaitingValidators = waitingValidators.length !== 0;

    if (isRedeem) alerts.push({ name: 'redeem', timespan: Date.now(), formName: 'showRedeemForm' });

    if (isNeedBondExtra) alerts.push({ name: 'bondMoreTokens', timespan: Date.now(), formName: 'showBondExtraForm' });

    // Если нет избранных валидаторов
    if (isEmptyValidators)
      alerts.push({ name: 'emptyValidators', timespan: Date.now(), formName: 'showYourValidatorsForm' });
    else {
      // Если нет активных валидаторов и нет валидаторов в режиме ожидания(то есть все валидаторы неактивны)
      if (isEmptyElectedValidators && !isWaitingValidators)
        alerts.push({ name: 'emptyElectedValidators', timespan: Date.now(), formName: 'showYourValidatorsForm' });
      // Если есть валидаторы в режиме ожидания
      else if (isWaitingValidators)
        alerts.push({ name: 'waitingForNextEra', timespan: Date.now(), formName: 'showYourValidatorsForm' });
    }

    return alerts;
  }

  public async getStashByController(address: string) {
    return await apiSora.staking.getStashByController(address);
  }

  public async getMinNominatorBond(validators: FWValidatorInfoFull[], networkName: NetworkName) {
    const haveFreeValidators = validators.some(({ isOversubscribed }) => !isOversubscribed);

    if (haveFreeValidators) return await apiSora.staking.getMinNominatorBond();

    const lastNominators = validators.map(({ nominators }) => +nominators[nominators.length - 1].value);
    const min = Math.min(...lastNominators);
    const precision = getUtilityProps(networkName, this.state).precision;

    return FPNumber.fromCodecValue(min + 1, precision).toNumber();
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

  public async getPayoutsFee({ payouts, network }: GetPayoutsFeeRequest) {
    const precision = getUtilityProps(network, this.state).precision;
    const selectedAddress = IS_EXTENSION ? this.state.getAccountAddress() : '';
    const destination = await this.recoveryPayoutDestination(selectedAddress);
    if (IS_EXTENSION && this.state.getAccountAddress() !== selectedAddress) {
      throw new Error('The staking account changed. Select the wallet and review the request again.');
    }
    const fee = await apiSora.staking.getPayoutNetworkFee({ payouts, ...destination });

    return FPNumber.fromCodecValue(fee, precision).toString();
  }

  public async getNominateNetworkFee({ validators, network }: GetNominateNetworkFeeRequest) {
    const precision = getUtilityProps(network, this.state).precision;

    const fee = await apiSora.staking.getNominateNetworkFee({ validators });

    return FPNumber.fromCodecValue(fee, precision).toString();
  }

  public async getBondAndNominateNetworkFee({ validators, payoutAddress, from, networkName, amount }: RequestBond) {
    const precision = getUtilityProps(networkName, this.state).precision;

    const fee = await apiSora.staking.getBondAndNominateNetworkFee({
      validators,
      controller: from,
      payee: payoutAddress,
      value: amount,
    });

    return FPNumber.fromCodecValue(fee, precision).toString();
  }

  public async makeStaking({ params, type }: MakeStakingRequest): Promise<BasicTxResponse> {
    // Staking signs with the SORA SDK's active pair, not params.from. Bind both
    // to the selected account and keep that binding across runtime readiness.
    const pair = apiSora.account?.pair;
    const assertSigningAccount = () => {
      if (!IS_EXTENSION) return;
      const selectedAddress = this.state.getAccountAddress();
      const formatAddress = (address: string) => apiSora.formatAddress(address);
      const recoveryAction = isRecoveryStakingAction(type);
      assertWalletAllowsRecoveryAction(this.state.keyringService.getAllAccounts(), selectedAddress, recoveryAction);
      assertWalletAllowsRecoveryAction(this.state.keyringService.getAllAccounts(), params.from, recoveryAction);
      if (!isCapturedSoraPairStillSelected(pair, apiSora.account?.pair, selectedAddress, formatAddress) ||
        !isLocallySignableSelectedSoraPair(pair, params.from, formatAddress)) {
        throw new Error('The staking account changed. Select the wallet and review the request again.');
      }
    };
    assertSigningAccount();
    const { networkName } = params;
    const apiProps = this.state.getSubstrateApiMap[networkName.toLowerCase()];
    const isReady = await apiProps.api?.isReady;

    if (!isReady) return { status: false };

    assertSigningAccount();
    apiSora.shouldPairBeLocked = false;

    if (type === 'bond') return this.bondAndNominate(params as RequestBond);

    if (type === 'bondExtra') return this.bondExtra(params as RequestBondExtra);

    if (type === 'unbond') return this.unbond(params as RequestUnbond);

    if (type === 'rebond') return this.rebond(params as RequestRebond);

    if (type === 'redeem') return this.withdrawUnbonded(params as RequestWithdrawUnbonded);

    if (type === 'nominate') return this.nominate(params as RequestNominate);

    if (type === 'setController') return this.setControllerAccount(params as RequestSetControllerAccount);

    if (type === 'setPayee') return this.setPayee(params as RequestSetPayee);

    if (type === 'payoutRewards') return this.payoutRewards(params as RequestPayoutRewards, assertSigningAccount);

    return {
      status: false,
      errors: [{ message: '[STAKING] unknown operation', code: BasicTxErrorCode.INVALID_PARAM }],
    };
  }

  public async bondAndNominate(params: RequestBond): Promise<BasicTxResponse> {
    const { amount, payoutAddress, from, validators } = params;

    const payee = payoutAddress === '' ? from : payoutAddress;

    try {
      await apiSora.staking.bondAndNominate({ value: amount, controller: from, payee, validators }); // Controller аккаунт по умолчанию это Stash
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

  private async payoutRewards({ payouts, from }: RequestPayoutRewards, assertSigningAccount: () => void): Promise<BasicTxResponse> {
    try {
      const destination = await this.recoveryPayoutDestination(from);
      // Resolving live ledger/payee state adds awaits; bind the actual SDK
      // signer again before constructing the atomic set-payee/claim batch.
      assertSigningAccount();
      await apiSora.staking.payout({ payouts, ...destination });
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
