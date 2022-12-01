import { isFunction } from '@polkadot/util';
import { ISubmittableResult } from '@polkadot/types/types';
import { FPNumber } from '@sora-substrate/math';
import type { Balances, BalanceFP, WalletBalance, RelayChainName, WalletAddress, AccountBalance } from '@/interfaces';
import type { SubmittableExtrinsic, SignerOptions } from '@polkadot/api/submittable/types';
import type { Wallet, SetHistoryProps } from '@/store';
import type { ApiPromise } from '@polkadot/api';
import BaseApi from '@/util/BaseApi';
import LocalStorageController from '@/controllers/localStorageController';
import NetworksController from '@/controllers/networksController';
import {
  XCM_NATIVE_PALLETS,
  FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT,
  getNativeTeleportParams,
  getOrmlTeleportParams,
  isNativeNetwork,
  getOrmlOptions,
} from '@/util/teleport';
import { getReplacedMetaTyped } from '@/helpers/common';
import { getAssetOptions } from '@/util/assets';
import { BeaconSigner } from '@/extension/background/extension-base/src/background/BeaconSigner';
import store from '@/store';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { mockBalance } from '@/consts/currencies';
import { saveTimeoutCache } from '@/extension/messaging';

type TransactionStatus = 'success' | 'failed' | 'pending';

type Options = {
  transactionsOptions?: Partial<SignerOptions>;
  historyOptions?: { networkName: string; amount: string; to: string };
  api?: ApiPromise;
};

type UpdateBalance = {
  walletAddress: WalletAddress;
  network: string;
  balance: AccountBalance;
};

export default class CurrencyController {
  private readonly lsCurrency = new LocalStorageController('currency');
  private readonly visibleStorageName = 'visible';
  public extrinsic!: SubmittableExtrinsic<'promise'> | undefined;
  public options: Options = {};
  public price = 0;
  public hours24Change = 0;
  public currenciesVisible!: Record<string, Record<string, boolean>>;
  public transactionStatus?: TransactionStatus;

  constructor(
    public mainNetwork: string,
    public assetId: string,
    public asset: string,
    public providers: string[],
    public relayChain: RelayChainName,
    public balances: Balances,
    public displayName: string
  ) {
    this.currenciesVisible = this.lsCurrency.get(this.visibleStorageName).value ?? {};
  }

  public updatePrice() {
    const { price, hours24Change } = NetworksController.getAssetPrice(this.assetId);

    this.price = price ?? 0;
    this.hours24Change = hours24Change ?? 0;
  }

  private calculateCost(count: FPNumber): FPNumber {
    const FPPrice = new FPNumber(this.price);

    return count.mul(FPPrice);
  }

  private getWalletBalance(wallet: Wallet): WalletBalance[] {
    const { address, ethereumAddress } = wallet;

    const replacedAccounts = BaseApi.getReplacedAccounts(wallet);
    const replacedNetworks = replacedAccounts.reduce((result, { address: _address, meta }) => {
      const { replacedSettings } = getReplacedMetaTyped(meta);
      const replacedNetworks = replacedSettings[address] ?? replacedSettings[ethereumAddress];

      replacedNetworks.forEach((network) => (result[network] = _address));

      return result;
    }, {} as Record<string, string>);

    return this.balances.map((item) => {
      const { network, type, precision, existentialDeposit, balance } = item;
      const isEthereumNetwork = BaseApi.isEthereumNetwork(network);
      const replacedAddress = replacedNetworks[network];
      const walletBalance = replacedAddress
        ? balance[replacedAddress]
        : isEthereumNetwork
        ? balance[ethereumAddress]
        : balance[address];

      return { network, type, precision, existentialDeposit, balance: walletBalance ?? mockBalance };
    });
  }

  private countAssets(wallet: Wallet): BalanceFP {
    const walletBalance = this.getWalletBalance(wallet);

    return walletBalance.reduce((obj, { balance: { total, frozen, locked, reserved, transferable } }) => {
      return {
        total: obj.total.add(total),
        frozen: obj.frozen.add(frozen),
        locked: obj.locked.add(locked),
        reserved: obj.reserved.add(reserved),
        transferable: obj.transferable.add(transferable),
      };
    }, mockBalance);
  }

  private getTotalBalanceInNetwork(wallet: Wallet, _network: string): string {
    const walletBalance = this.getWalletBalance(wallet);
    const total = walletBalance.find(({ network }) => network === _network)?.balance.total ?? FPNumber.ZERO;

    return this.calculateCost(total).toString();
  }

  private getTotalCountAssetsByNetwork(wallet: Wallet, _network: string): string {
    const walletBalance = this.getWalletBalance(wallet);
    const balance = walletBalance.find(({ network }) => network === _network)?.balance;

    return balance?.total.toString() ?? '';
  }

  public getBalanceInNetwork(wallet: Wallet, _network: string) {
    const walletBalance = this.getWalletBalance(wallet);
    const { frozen, locked, reserved, total, transferable } = walletBalance.find(
      ({ network }) => network === _network
    )!.balance;

    return {
      frozen: {
        value: frozen.toString(),
        fiat: this.calculateCost(frozen).toString(),
      },
      locked: {
        value: locked.toString(),
        fiat: this.calculateCost(locked).toString(),
      },
      reserved: {
        value: reserved.toString(),
        fiat: this.calculateCost(reserved).toString(),
      },
      total: {
        value: total.toString(),
        fiat: this.calculateCost(total).toString(),
      },
      transferable: {
        value: transferable.toString(),
        fiat: this.calculateCost(transferable).toString(),
      },
    };
  }

  public getTransactionAddress(wallet: Wallet, network: string): string {
    const { address, ethereumAddress } = wallet;
    const replacedAccount = BaseApi.getReplacedAccountByNetwork(wallet, network);

    if (replacedAccount) {
      const { address } = replacedAccount;

      return address;
    }

    return BaseApi.isEthereumNetwork(network) ? ethereumAddress : address;
  }

  public updateCurrencyBalance({ walletAddress, network, balance }: UpdateBalance): void {
    const { frozen, locked, reserved, total, transferable } = balance;
    const oldBalances = [...this.balances];
    const indexNetwork = oldBalances.findIndex(({ network: _network }) => _network === network);
    const balancesForNetwork = oldBalances[indexNetwork];

    const newBalance = {
      frozen: FPNumber.fromCodecValue(frozen, balancesForNetwork.precision),
      locked: FPNumber.fromCodecValue(locked, balancesForNetwork.precision),
      reserved: FPNumber.fromCodecValue(reserved, balancesForNetwork.precision),
      total: FPNumber.fromCodecValue(total, balancesForNetwork.precision),
      transferable: FPNumber.fromCodecValue(transferable, balancesForNetwork.precision),
    };

    balancesForNetwork.balance[walletAddress] = newBalance;

    this.balances.splice(indexNetwork, 1, balancesForNetwork);
  }

  public getTotalCountAssets(wallet: Wallet, network?: string): string {
    if (network && network !== 'all') {
      return this.getTotalCountAssetsByNetwork(wallet, network);
    }

    return this.countAssets(wallet).total.toString();
  }

  public getTransferableCountAssets(networkProp: string, wallet: Wallet): string {
    const walletBalance = this.getWalletBalance(wallet);
    const balance = walletBalance.find(({ network }) => network === networkProp)?.balance;

    if (!balance) return '';

    return balance.transferable.toString();
  }

  public getTransferableCountAssetsMinusFee(fee: string, _network: string, wallet: Wallet): FPNumber {
    const walletBalance = this.getWalletBalance(wallet);
    const {
      precision,
      balance: { transferable },
      type,
    } = walletBalance.find(({ network }) => network === _network)!;
    const FPFee = new FPNumber(fee, precision);
    const result = type === 'native' ? transferable.sub(FPFee) : transferable; // for ORML assets fee sub from utility asset

    return FPNumber.lt(result, FPNumber.ZERO) ? FPNumber.ZERO : result;
  }

  public validateCountAssets(count: string, fee: string, network: string, wallet: Wallet): boolean {
    const transferableCountAssetsMinusFee = this.getTransferableCountAssetsMinusFee(fee, network, wallet);

    return FPNumber.lte(new FPNumber(count), transferableCountAssetsMinusFee);
  }

  public getNetworkList(): Balances {
    return this.balances;
  }

  public isUtility(_network: string): boolean {
    return this.balances.find(({ network }) => network === _network)?.type === 'native';
  }

  public getNetworksWithBalance(wallet: Wallet): WalletBalance[] {
    return this.getWalletBalance(wallet).filter(({ balance: { total } }) => !FPNumber.isEqualTo(total, FPNumber.ZERO));
  }

  public getTotalBalance(wallet: Wallet, network?: string): string {
    if (network && network !== 'all') {
      return this.getTotalBalanceInNetwork(wallet, network);
    }

    const countAssets = this.countAssets(wallet).total;
    const cost = this.calculateCost(countAssets);

    return cost.toString();
  }

  public getCostOfAssets(count: string): string {
    return this.calculateCost(new FPNumber(count)).toString();
  }

  public getCountAssetsByPrice(cost: string): string {
    const FPCost = new FPNumber(cost);
    const price = new FPNumber(this.price);

    return FPCost.div(price).toString();
  }

  public getCurrencyVisible(address: string): boolean {
    return this.currenciesVisible?.[address]?.[this.assetId] ?? true;
  }

  public setCurrencyVisible(address: string, value: boolean): void {
    this.currenciesVisible = this.lsCurrency.get(this.visibleStorageName).value ?? {};

    if (this.currenciesVisible[address]) this.currenciesVisible[address][this.assetId] = value;
    else {
      this.currenciesVisible[address] = {};
      this.currenciesVisible[address][this.assetId] = value;
    }

    this.lsCurrency.set(this.visibleStorageName, this.currenciesVisible);
  }

  public getPrecisionValue(_amount: string, precision: number, returnFPNumber = false): string | FPNumber {
    const amount = _amount === '' ? '0' : _amount;
    const amountFP = new FPNumber(amount, precision);

    return returnFPNumber ? amountFP : amountFP.toCodecString();
  }

  public validateExistentialDeposit(wallet: Wallet, _network: string, amount: string, fee: string): boolean {
    const walletBalance = this.getWalletBalance(wallet);
    const {
      existentialDeposit,
      precision,
      balance: { transferable },
      type,
    } = walletBalance.find(({ network }) => network === _network)!;
    const { api } = NetworksController.getNetwork(_network);
    const exDeposit =
      existentialDeposit ??
      (type === 'equilibrium' ? api?.consts.eqBalances : api?.consts.balances)?.existentialDeposit.toString();

    if (exDeposit === undefined) return true;

    const amountFP = this.getPrecisionValue(amount, precision, true) as FPNumber;
    const feeFP = new FPNumber(fee, precision);
    const residualBalance = transferable.sub(amountFP).sub(feeFP);

    return FPNumber.gte(residualBalance, FPNumber.fromCodecValue(exDeposit, precision));
  }

  public createTransferExtrinsic(wallet: Wallet, to: string, amount: string, networkName: string): void {
    const {
      api,
      settings: { DefaultTip },
    } = NetworksController.getNetwork(networkName);

    if (api === undefined) return;

    const walletBalance = this.getWalletBalance(wallet) ?? [];
    const { precision, type } = walletBalance.find(({ network }) => network === networkName)!;
    const ormlOptions = getAssetOptions(this.asset, type, this.assetId);
    const precisionAmount = this.getPrecisionValue(amount, precision) as string;

    this.options = {
      transactionsOptions: { tip: DefaultTip },
      historyOptions: { networkName, amount: precisionAmount, to },
      api,
    };

    try {
      if (type === 'native') {
        this.extrinsic = api!.tx.balances.transfer(to, precisionAmount);
      } else if (type === 'equilibrium') {
        this.extrinsic = api!.tx.eqBalances.transfer(ormlOptions, to, precisionAmount);
      } else if (type === 'ormlChain') {
        this.extrinsic = api!.tx.tokens.transfer(to, ormlOptions, precisionAmount);
      } else {
        this.extrinsic = api!.tx.currencies.transfer(to, ormlOptions, precisionAmount);
      }
    } catch {
      this.extrinsic = undefined;
      this.options = {};
    }
  }

  public async createTeleportExtrinsic(
    wallet: Wallet,
    originNet: string,
    destNet: string,
    amount: string
  ): Promise<void> {
    const walletBalance = this.getWalletBalance(wallet) ?? [];
    const { precision } = walletBalance.find(({ network }) => network === originNet)!;
    const toAddress = this.getTransactionAddress(wallet, destNet);
    const precisionAmount = this.getPrecisionValue(amount, precision) as string;

    if (isNativeNetwork(originNet)) {
      // Case RelayChain -> Nonnative ParaChain (polkadot -> acala, etc; kusama -> bifrost, etc) paraId = 2000-2999, pallet = xcmPallet, module = reserveTransferAssets
      // Case RelayChain -> Native ParaChain (polkadot -> statemint; kusama -> statemine, encointer) paraId = 1000-1999, pallet = xcmPallet, module = limitedTeleportAssets
      // Case Native ParaChain -> RelayChain (statemint -> polkadot; statemine, encointer -> kusama) paraId = -1, pallet = polkadotXcm, module = limitedTeleportAssets
      // TODO: add case: Native ParaChain -> Nonnative ParaChain
      // TODO: add case: Native ParaChain -> Native ParaChain
      this.createNativeTeleportExtrinsic(originNet, destNet, toAddress, precisionAmount);

      return;
    }

    // Case Nonnative ParaChain -> Nonnative ParaChain (karura, etc -> bifrost, etc) paraId = 2000-2999
    // Case Nonnative ParaChain -> RelayChain (karura, etc -> kusama, etc; acala, etc  -> polkadot)
    this.createOrmlTeleportExtrinsic(originNet, destNet, toAddress, precisionAmount);
  }

  public async createNativeTeleportExtrinsic(
    originNet: string,
    destNet: string,
    toAddress: string,
    precisionAmount: string
  ): Promise<void> {
    const { api } = NetworksController.getNetwork(originNet);

    if (api === undefined) return;

    const module = isNativeNetwork(destNet) ? 'limitedTeleportAssets' : 'reserveTransferAssets';
    const pallet = XCM_NATIVE_PALLETS.find((pallet) => api!.tx[pallet] && isFunction(api!.tx[pallet][module]))!;
    const tx = api!.tx[pallet][module];
    const params = getNativeTeleportParams(destNet, toAddress, precisionAmount);

    this.extrinsic = tx(...params);
    this.options = { historyOptions: { networkName: originNet, amount: precisionAmount, to: toAddress }, api };
  }

  public async createOrmlTeleportExtrinsic(
    originNet: string,
    destNet: string,
    toAddress: string,
    precisionAmount: string
  ): Promise<void> {
    const { api } = NetworksController.getNetwork(originNet);

    if (api === undefined) return;

    const ormlOptions = getOrmlOptions(this.asset, originNet);
    const params = getOrmlTeleportParams(originNet, destNet, toAddress);

    this.extrinsic = api!.tx.xTokens.transfer(ormlOptions, precisionAmount, params, FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT);
    this.options = { historyOptions: { networkName: originNet, amount: precisionAmount, to: toAddress }, api };
  }

  public async getPartialFee(wallet: Wallet, _network: string): Promise<string> {
    if (!this.extrinsic) return '0';

    const transactionAddress = this.getTransactionAddress(wallet, _network);
    const walletBalance = this.getWalletBalance(wallet) ?? [];
    const { precision } = walletBalance.find(({ network }) => network === _network)!;

    try {
      const { partialFee } = await this.extrinsic.paymentInfo(transactionAddress);
      const result = new FPNumber(partialFee as any, precision);

      return result.toString();
    } catch {
      return '0';
    }
  }

  public async send(from: string, isMobile = false, isSavePass = false): Promise<boolean> {
    if (isSavePass) await saveTimeoutCache(from);

    const account = isMobile ? from : BaseApi.getPair(from);

    const options = {
      ...(this.options.transactionsOptions ?? {}),
      signer: isMobile ? new BeaconSigner() : undefined,
      nonce: await this.options.api?.rpc.system.accountNextIndex(from),
    };

    this.transactionStatus = 'pending';

    try {
      await this.extrinsic!.signAndSend(account, options, this.statusCallback(from));

      if (typeof account !== 'string' && !isSavePass) account.lock();
    } catch (ex) {
      this.transactionStatus = 'failed';

      this.setMockHistory(from, false);

      console.info(`Transaction failed ${ex}`);

      return false;
    }

    return true;
  }

  private statusCallback(from: string) {
    return (result: ISubmittableResult) => {
      const { status } = result;

      if (status.isInBlock) {
        console.info(`Successful transfer with hash ${status.asInBlock.toHex()}`);

        this.transactionStatus = 'success';

        this.setMockHistory(from, true);
      } else if (status.isFinalized) {
        console.info(`Transaction finalized at blockHash ${status.asFinalized}`);
      } else {
        console.info(`Status of transfer: ${status.type}`);
      }
    };
  }

  public clearSendStatus() {
    this.transactionStatus = undefined;
  }

  private async setMockHistory(from: string, success: boolean): Promise<void> {
    const { networkName, amount, to } = this.options.historyOptions!;

    const paymentInfo = await this.extrinsic!.paymentInfo(from);
    const fee = JSON.parse(paymentInfo.toString()).partialFee;

    const historyOptions: SetHistoryProps = {
      assetId: this.assetId,
      networkName,
      isPreviously: true,
      isMock: true,
      walletAddress: from,
      history: {
        nodes: [
          {
            address: '',
            id: '',
            timestamp: `${Date.now() / 1000}`,
            transfer: {
              from: BaseApi.getDisplayAddressByNetwork({ address: from, ethereumAddress: from }, networkName),
              success,
              amount,
              eventIdx: 0,
              fee,
              to,
            },
            isMock: true,
          },
        ],
        pageInfo: {
          startCursor: '',
          endCursor: '',
        },
      },
    };

    store.commit(NetworksMutationTypes.SET_HISTORY, historyOptions);

    this.options = {};
  }
}
