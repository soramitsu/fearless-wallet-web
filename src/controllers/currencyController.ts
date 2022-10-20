import { isFunction } from '@polkadot/util';
import { ISubmittableResult } from '@polkadot/types/types';
import type {
  AvailableInNetworks,
  Balances,
  BalanceFP,
  AvailableInNetworksFP,
  TypeAsset,
  RelayChainName,
} from '@/interfaces';
import type { SubmittableExtrinsic, SignerOptions } from '@polkadot/api/submittable/types';
import type { Wallet } from '@/store/accounts/types';
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
import { ETHEREUM_NETWORKS } from '@/consts/networks';
import { FPNumber } from '@/util/fp';
import { getReplacedMetaTyped } from '@/helpers/common';
import { getOptions } from '@/util/assets';
import { BeaconSigner } from '@/extension/background/extension-base/src/background/BeaconSigner';

type NetworkProps = {
  label: string;
  value: string;
  existentialDeposit?: string;
  precision: number;
  type: TypeAsset;
};

export default class CurrencyController {
  private readonly lsCurrency = new LocalStorageController('currency');
  private readonly visibleStorageName = 'visible';
  public extrinsic!: SubmittableExtrinsic<'promise'> | undefined;
  public options: Partial<SignerOptions> = {};
  public balances: Balances = {};
  public price = 0;
  public hours24Change = 0;
  public displayName!: string;
  public currenciesVisible!: Record<string, Record<string, boolean>>;

  constructor(
    public mainNetwork: string,
    public assetId: string,
    public asset: string,
    displayName: string | undefined,
    public providers: string[],
    public relayChain: RelayChainName
  ) {
    this.displayName = displayName ?? asset;
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

  private getAvailableInNetworksIncludingReplacedAccounts(wallet: Wallet): AvailableInNetworksFP[] {
    const { address, ethereumAddress } = wallet;
    const availableInNetworks = [...(this.balances[address] ?? []), ...(this.balances[ethereumAddress] ?? [])];

    const replacedAccounts = BaseApi.getReplacedAccounts(wallet);
    const replacedNetworks = replacedAccounts.reduce((result, { address: _address, meta }) => {
      const { replacedSettings } = getReplacedMetaTyped(meta);
      const replacedNetworks = replacedSettings[address] ?? replacedSettings[ethereumAddress];

      replacedNetworks.forEach((network) => (result[network] = _address));

      return result;
    }, {} as Record<string, string>);

    return availableInNetworks.map((item) => {
      const { network, type, precision, existentialDeposit } = item;
      let { balance } = item;

      const replacedAddress = replacedNetworks[network];
      const replacedAvailableInNetworks = this.balances[replacedAddress];

      if (replacedAvailableInNetworks) {
        const { balance: replacedBalance } = replacedAvailableInNetworks.find(
          ({ network: _network }) => _network === network
        )!;

        balance = replacedBalance;
      }

      return { network, balance, type, precision, existentialDeposit };
    });
  }

  private countAssets(wallet: Wallet): BalanceFP {
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);

    return availableInNetworks.reduce(
      (obj, { balance: { total, frozen, locked, reserved, transferable } }) => {
        return {
          total: obj.total.add(total),
          frozen: obj.frozen.add(frozen),
          locked: obj.locked.add(locked),
          reserved: obj.reserved.add(reserved),
          transferable: obj.transferable.add(transferable),
        };
      },
      {
        total: FPNumber.ZERO,
        frozen: FPNumber.ZERO,
        locked: FPNumber.ZERO,
        reserved: FPNumber.ZERO,
        transferable: FPNumber.ZERO,
      }
    );
  }

  public getTransactionAddress(wallet: Wallet, network: string): string {
    const { address, ethereumAddress } = wallet;
    const replacedAccount = BaseApi.getReplacedAccountByNetwork(wallet, network);

    if (replacedAccount) {
      const { address } = replacedAccount;

      return address;
    }

    const isEthereumNetwork = ETHEREUM_NETWORKS.includes(network);
    const addressByNetwork = isEthereumNetwork ? ethereumAddress : address;

    return addressByNetwork;
  }

  public updateCurrencyBalance({
    walletAddress,
    network,
    balance,
    type,
    precision,
    existentialDeposit,
  }: Record<string, any>): void {
    const { frozen, locked, reserved, total, transferable } = balance;
    const oldBalances = { ...this.balances };
    let balancesForAddress = oldBalances[walletAddress];

    const newValue = {
      network,
      precision,
      existentialDeposit,
      type: type ?? 'native',
      balance: {
        frozen: FPNumber.fromCodecValue(frozen, precision),
        locked: FPNumber.fromCodecValue(locked, precision),
        reserved: FPNumber.fromCodecValue(reserved, precision),
        total: FPNumber.fromCodecValue(total, precision),
        transferable: FPNumber.fromCodecValue(transferable, precision),
      },
    };

    if (balancesForAddress) {
      const index = balancesForAddress.findIndex(({ network: _network }) => _network === network);

      if (index === -1) balancesForAddress.push(newValue);
      else balancesForAddress.splice(index, 1, newValue);
    } else balancesForAddress = [newValue];

    this.balances = { ...oldBalances, [walletAddress]: balancesForAddress };
  }

  public getTotalCountAssets(wallet: Wallet): string {
    return this.countAssets(wallet).total.toString();
  }

  public getTotalCountAssetsByNetwork(wallet: Wallet, _network: string): string {
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);
    const balance = availableInNetworks.find(({ network }) => network === _network)?.balance;

    return balance?.total.toString() ?? '';
  }

  public getTransferableCountAssets(networkProp: string, wallet: Wallet): string {
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);
    const balance = availableInNetworks.find(({ network }) => network === networkProp)?.balance;

    if (!balance) return '';

    return balance.transferable.toString();
  }

  public getTransferableCountAssetsMinusFee(fee: string, _network: string, wallet: Wallet): FPNumber {
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);
    const {
      precision,
      balance: { transferable },
    } = availableInNetworks.find(({ network }) => network === _network)!;
    const FPFee = new FPNumber(fee, precision);
    const result = transferable.sub(FPFee);

    return FPNumber.lt(result, FPNumber.ZERO) ? FPNumber.ZERO : result;
  }

  public validateCountAssets(count: string, fee: string, network: string, wallet: Wallet): boolean {
    const transferableCountAssetsMinusFee = this.getTransferableCountAssetsMinusFee(fee, network, wallet);

    return FPNumber.lte(new FPNumber(count), transferableCountAssetsMinusFee);
  }

  public getAvailableInNetworks(wallet: Wallet): AvailableInNetworks[] {
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);

    return availableInNetworks.map(({ balance, network, type, precision, existentialDeposit }) => {
      const { frozen, locked, reserved, total, transferable } = balance;

      return {
        network,
        type,
        precision,
        existentialDeposit,
        balance: {
          frozen: frozen.toString(),
          locked: locked.toString(),
          reserved: reserved.toString(),
          total: total.toString(),
          transferable: transferable.toString(),
        },
      };
    });
  }

  public getTotalBalance(wallet: Wallet): string {
    const countAssets = this.countAssets(wallet).total;
    const cost = this.calculateCost(countAssets);

    return cost.toString();
  }

  public getCostOfAssets(count: string): string {
    return this.calculateCost(new FPNumber(count)).toString();
  }

  public getBalanceInNetwork(wallet: Wallet, _network: string): string {
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);
    const total = availableInNetworks.find(({ network }) => network === _network)?.balance.total ?? FPNumber.ZERO;

    return this.calculateCost(total).toString();
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
    if (this.currenciesVisible[address]) {
      this.currenciesVisible[address][this.assetId] = value;
    } else {
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
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);
    const {
      existentialDeposit,
      precision,
      balance: { transferable },
      type,
    } = availableInNetworks.find(({ network }) => network === _network)!;
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

  public createTransferExtrinsic(
    to: string,
    amount: string,
    { precision, type, value: networkName }: NetworkProps
  ): void {
    const precisionAmount = this.getPrecisionValue(amount, precision) as string;
    const {
      api,
      settings: { DefaultTip },
    } = NetworksController.getNetwork(networkName);
    const transferOptions = { tip: DefaultTip };
    const ormlOptions = getOptions(this.asset, type, this.assetId);

    try {
      if (type === 'native') {
        this.extrinsic = api!.tx.balances.transfer(to, precisionAmount);
      } else if (type === 'equilibrium') {
        const equilibriumAsset = BaseApi.getEquilibriumAssetName(this.asset);

        this.extrinsic = api!.tx.eqBalances.transfer(equilibriumAsset, to, precisionAmount);
      } else if (type === 'ormlChain') {
        this.extrinsic = api!.tx.tokens.transfer(to, ormlOptions, precisionAmount);
      } else {
        this.extrinsic = api!.tx.currencies.transfer(to, ormlOptions, precisionAmount);
      }

      this.options = transferOptions;
    } catch {
      this.extrinsic = undefined;
      this.options = {};
    }
  }

  public async createTeleportExtrinsic(
    wallet: Wallet,
    destNet: string,
    amount: string,
    { precision, value: originNet }: NetworkProps
  ): Promise<void> {
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
    const module = isNativeNetwork(destNet) ? 'limitedTeleportAssets' : 'reserveTransferAssets';
    const pallet = XCM_NATIVE_PALLETS.find((pallet) => api!.tx[pallet] && isFunction(api!.tx[pallet][module]))!;
    const tx = api!.tx[pallet][module];
    const params = getNativeTeleportParams(destNet, toAddress, precisionAmount);

    this.extrinsic = tx(...params);
  }

  public async createOrmlTeleportExtrinsic(
    originNet: string,
    destNet: string,
    toAddress: string,
    precisionAmount: string
  ): Promise<void> {
    const { api } = NetworksController.getNetwork(originNet);
    const ormlOptions = getOrmlOptions(this.asset, originNet);
    const params = getOrmlTeleportParams(originNet, destNet, toAddress);

    this.extrinsic = api!.tx.xTokens.transfer(ormlOptions, precisionAmount, params, FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT);
  }

  public async getPartialFee(from: string, { precision }: NetworkProps): Promise<string> {
    if (!this.extrinsic) return '0';

    try {
      const { partialFee } = await this.extrinsic.paymentInfo(from);
      const result = new FPNumber(partialFee, precision);

      return result.toString();
    } catch {
      return '0';
    }
  }

  statusCallback(result: ISubmittableResult) {
    const { status } = result;

    if (status.isInBlock) {
      console.info(`Successful transfer with hash ${status.asInBlock.toHex()}`);
    } else if (status.isFinalized) {
      console.info(`Transaction finalized at blockHash ${status.asFinalized}`);
    } else {
      console.info(`Status of transfer: ${status.type}`);
    }
  }

  public async sendRaw(from: string): Promise<boolean> {
    this.options.signer = new BeaconSigner();

    try {
      await this.extrinsic!.signAndSend(from, this.options, this.statusCallback).then(() => {
        return;
      });
    } catch (ex) {
      console.info(`Transaction failed ${ex}`);

      return false;
    }

    return true;
  }

  public async send(from: string): Promise<boolean> {
    const pair = BaseApi.getPair(from);

    try {
      await this.extrinsic!.signAndSend(pair, this.options, this.statusCallback).then(() => {
        return;
      });
    } catch (ex) {
      console.info(`Transaction failed ${ex}`);

      return false;
    }

    pair.lock();

    return true;
  }
}
