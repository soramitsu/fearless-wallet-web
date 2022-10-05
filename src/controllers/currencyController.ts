import { isFunction } from '@polkadot/util';
import type {
  AvailableInNetworks,
  Balances,
  BalanceFP,
  AvailableInNetworksFP,
  TypeAsset,
} from '@/interfaces/currencies';
import type { SubmittableExtrinsic, SignerOptions } from '@polkadot/api/submittable/types';
import type { RelayChainName } from '@/interfaces/teleport';
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

type NetworkProps = {
  label: string;
  value: string;
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

  constructor(
    public mainNetwork: string,
    public assetId: string,
    public asset: string,
    displayName: string | undefined,
    public providers: string[],
    public relayChain: RelayChainName
  ) {
    this.displayName = displayName ?? asset;
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
      const { network, type, precision } = item;
      let { balance } = item;

      const replacedAddress = replacedNetworks[network];
      const replacedAvailableInNetworks = this.balances[replacedAddress];

      if (replacedAvailableInNetworks) {
        const { balance: replacedBalance } = replacedAvailableInNetworks.find(
          ({ network: _network }) => _network === network
        )!;

        balance = replacedBalance;
      }

      return { network, balance, type, precision };
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

  public updateCurrencyBalance({ walletAddress, network, balance, type, precision }: Record<string, any>): void {
    const { frozen, locked, reserved, total, transferable } = balance;
    const oldBalances = { ...this.balances };
    let balancesForAddress = oldBalances[walletAddress];

    const newValue = {
      network,
      precision,
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

  public getTransferableCountAssetsMinusFee(fee: string, networkProp: string, wallet: Wallet): FPNumber {
    const FPFee = new FPNumber(fee);
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);
    const { transferable } = availableInNetworks.find(({ network }) => network === networkProp)!.balance;
    const result = transferable.sub(FPFee);

    return FPNumber.lt(result, FPNumber.ZERO) ? FPNumber.ZERO : result;
  }

  public isValidCountAssets(count: string, fee: string, network: string, wallet: Wallet): boolean {
    const transferableCountAssetsMinusFee = this.getTransferableCountAssetsMinusFee(fee, network, wallet);

    return FPNumber.lte(new FPNumber(count), transferableCountAssetsMinusFee);
  }

  public getAvailableInNetworks(wallet: Wallet): AvailableInNetworks[] {
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);

    return availableInNetworks.map(({ balance, network, type, precision }) => {
      const { frozen, locked, reserved, total, transferable } = balance;

      return {
        network,
        type,
        precision,
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
    const currenciesVisible = this.lsCurrency.get(this.visibleStorageName).value ?? {};

    return currenciesVisible?.[address]?.[this.displayName] ?? true;
  }

  public setCurrencyVisible(address: string, value: boolean): void {
    const currenciesVisible = this.lsCurrency.get(this.visibleStorageName).value ?? {};

    if (currenciesVisible[address]) {
      currenciesVisible[address][this.displayName] = value;
    } else {
      currenciesVisible[address] = {};
      currenciesVisible[address][this.displayName] = value;
    }

    this.lsCurrency.set(this.visibleStorageName, currenciesVisible);
  }

  public getPrecisionValue(amount: string, precision: number): string {
    const value = amount === '' ? 0 : +amount;

    return new FPNumber(value, precision).toCodecString();
  }

  public createTransferExtrinsic(
    to: string,
    networkName: string,
    amount: string,
    { precision, type }: NetworkProps
  ): void {
    const precisionAmount = this.getPrecisionValue(amount, precision);
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
    originNet: string,
    destNet: string,
    amount: string,
    { precision }: NetworkProps
  ): Promise<void> {
    const toAddress = this.getTransactionAddress(wallet, destNet);
    const precisionAmount = this.getPrecisionValue(amount, precision);

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

    const { partialFee } = await this.extrinsic.paymentInfo(from);
    const result = new FPNumber(partialFee as any, precision);

    return result.toString();
  }

  public async send(from: string, amount: string): Promise<boolean> {
    const pair = BaseApi.getPair(from);

    try {
      const unsubscribe = await this.extrinsic!.signAndSend(pair, this.options, ({ status }) => { //eslint-disable-line
        if (status.isInBlock) {
          console.info(`Successful transfer of ${amount} with hash ${status.asInBlock.toHex()}`);
        } else if (status.isFinalized) {
          console.info(`Transaction finalized at blockHash ${status.asFinalized}`);

          pair.lock();

          unsubscribe();
        } else {
          console.info(`Status of transfer: ${status.type}`);
        }
      });

      return true;
    } catch (ex) {
      console.info(`Transaction failed ${ex}`);

      return false;
    }
  }
}
