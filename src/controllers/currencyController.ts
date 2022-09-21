import { isFunction } from '@polkadot/util';
import type {
  AvailableInNetworks,
  Balances,
  BalanceFP,
  AvailableInNetworksFP,
  TypeAsset,
} from '@/interfaces/currencies';
import type { TokenPriceJson, KeysTokenPriceJson } from '@/interfaces/tokens';
import type { SubmittableExtrinsic, SignerOptions } from '@polkadot/api/submittable/types';
import type { RelayChainName } from '@/consts/teleport';
import type { Wallet } from '@/store/accounts/types';
import BaseApi from '@/util/BaseApi';
import LocalStorageController from '@/controllers/localStorageController';
import NetworksController from '@/controllers/networksController';
import { XCM_LOC, teleportInfo } from '@/consts/teleport';
import { ETHEREUM_NETWORKS } from '@/consts/networks';
import { FPNumber } from '@/util/fp';
import { getReplacedMetaTyped } from '@/helpers/common';
import { getParams } from '@/helpers/currencies';

type NetworkProps = {
  label: string;
  value: string;
  precision: number;
  type: TypeAsset;
};

export default class CurrencyController {
  private readonly lsCurrency = new LocalStorageController('currency');
  private readonly currencyVisibleStorageName = 'currency_visible';
  public transfer!: SubmittableExtrinsic<'promise'> | undefined;
  public options: Partial<SignerOptions> = {};
  public balances: Balances = {};
  public price = 0;
  public hours24Change = 0;
  public displayName!: string;

  constructor(
    public mainNetwork: string,
    public tokenId: string,
    public token: string,
    displayName: string | undefined,
    public tokensPrice: TokenPriceJson,
    public providers: string[],
    public relayChain: RelayChainName
  ) {
    this.displayName = displayName ?? token;
  }

  public updatePrice(selectedFiat: string) {
    const hours24ChangeField = `${selectedFiat}_24h_change` as KeysTokenPriceJson;

    this.price = this.tokensPrice[selectedFiat as KeysTokenPriceJson] ?? 0;
    this.hours24Change = this.tokensPrice[hours24ChangeField] ?? 0;
  }

  private getCurrenciesVisible(): Record<string, boolean> {
    const currencyVisible = this.lsCurrency.get(this.currencyVisibleStorageName);

    return currencyVisible.value ?? {};
  }

  private calculateCost(count: FPNumber): FPNumber {
    const FPPrice = new FPNumber(this.price);

    return count.mul(FPPrice);
  }

  private getAvailableInNetworksIncludingReplacedAccounts(wallet: Wallet): AvailableInNetworksFP[] {
    const { address, ethereumAddress } = wallet;
    const availableInNetworks = this.balances[address] ?? this.balances[ethereumAddress] ?? [];

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
        const { balance: replacedBalance } = replacedAvailableInNetworks.find( // eslint-disable-line
          ({ network: _network }) => _network === network
        )!;

        balance = replacedBalance;
      }

      return { network, balance, type, precision };
    });
  }

  private countTokens(wallet: Wallet): BalanceFP {
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

  public updateCurrency({ tokensPrice, selectedFiat }: Record<string, any>): void {
    this.tokensPrice = tokensPrice ?? this.tokensPrice;

    this.updatePrice(selectedFiat);
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

  public getTotalCountTokens(wallet: Wallet): string {
    return this.countTokens(wallet).total.toString();
  }

  public getTotalCountTokensByNetwork(wallet: Wallet, _network: string): string {
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);
    const balance = availableInNetworks.find(({ network }) => network === _network)?.balance;

    return balance?.total.toString() ?? '';
  }

  public getTransferableCountTokens(networkProp: string, wallet: Wallet): string {
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);
    const balance = availableInNetworks.find(({ network }) => network === networkProp)?.balance;

    if (!balance) return '';

    return balance.transferable.toString();
  }

  public getTransferableCountTokensMinusFee(fee: string, networkProp: string, wallet: Wallet): FPNumber {
    const FPFee = new FPNumber(fee);
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);
    const { transferable } = availableInNetworks.find(({ network }) => network === networkProp)!.balance; // eslint-disable-line
    const result = transferable.sub(FPFee);

    return FPNumber.lt(result, FPNumber.ZERO) ? FPNumber.ZERO : result;
  }

  public isValidCountTokens(count: string, fee: string, network: string, wallet: Wallet): boolean {
    const transferableCountTokensMinusFee = this.getTransferableCountTokensMinusFee(fee, network, wallet);

    return FPNumber.lte(new FPNumber(count), transferableCountTokensMinusFee);
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
    const countTokens = this.countTokens(wallet).total;
    const cost = this.calculateCost(countTokens);

    return cost.toString();
  }

  public getCostOfTokens(count: string): string {
    return this.calculateCost(new FPNumber(count)).toString();
  }

  public getBalanceInNetwork(wallet: Wallet, _network: string): string {
    const availableInNetworks = this.getAvailableInNetworksIncludingReplacedAccounts(wallet);
    const total = availableInNetworks.find(({ network }) => network === _network)?.balance.total ?? FPNumber.ZERO;

    return this.calculateCost(total).toString();
  }

  public getCountTokensByPrice(cost: string): string {
    const FPCost = new FPNumber(cost);
    const price = new FPNumber(this.price);

    return FPCost.div(price).toString();
  }

  public getCurrencyVisible(): boolean {
    const currenciesVisible = this.getCurrenciesVisible();

    return currenciesVisible[this.token] ?? true;
  }

  public setCurrencyVisible(value: boolean): void {
    const currenciesVisible = this.getCurrenciesVisible();

    currenciesVisible[this.token] = value;

    this.lsCurrency.set(this.currencyVisibleStorageName, currenciesVisible);
  }

  public getPrecisionValue(amount: string, precision: number): string {
    const value = amount === '' ? 0 : +amount;

    return new FPNumber(value, precision).toCodecString();
  }

  public getParaId(originalNetworkName: string, destinationNetworkName: string) {
    const isTeleportToMainNetwork =
      teleportInfo[destinationNetworkName as RelayChainName]?.parachains[originalNetworkName];

    return (
      teleportInfo[originalNetworkName as RelayChainName]?.parachains[destinationNetworkName]?.paraId ??
      (isTeleportToMainNetwork ? -1 : undefined)
    );

    // return !isParaTeleport
    //   ? teleportInfo[originalNetworkName as RelayChainName]?.parachains[destinationNetworkName]?.paraId
    //   : isTeleportToMainNetwork
    //   ? -1
    //   : undefined;
  }

  public createSendTransfer(to: string, networkName: string, amount: string, { precision, type }: NetworkProps): void {
    const precisionAmount = this.getPrecisionValue(amount, precision);
    const {
      api: { tx },
      settings: { DefaultTip },
    } = NetworksController.getNetwork(networkName);
    const options = { tip: DefaultTip };

    try {
      if (type === 'native') this.transfer = tx.balances.transfer(to, precisionAmount);
      else if (type === 'ormlChain') {
        const ormlChainOptions = { Token: this.token.toUpperCase() };

        this.transfer = tx.tokens.transfer(to, ormlChainOptions, precisionAmount);
      } else if (type === 'ormlAsset') {
        const ormlOptions = { Token: this.token.toUpperCase() };

        this.transfer = tx.currencies.transfer(to, ormlOptions, precisionAmount);
      } else if (type === 'equilibrium') {
        const equilibriumAsset = BaseApi.getEquilibriumAssetName(this.token);

        this.transfer = tx.eqBalances.transfer(equilibriumAsset, to, precisionAmount);
      }

      this.options = options;
    } catch {
      this.transfer = undefined;
      this.options = {};
    }
  }

  public async createTeleportTransfer(
    wallet: Wallet,
    originalNetworkName: string,
    destinationNetworkName: string,
    amount: string,
    { precision }: NetworkProps
  ): Promise<void> {
    const recipientParaId = this.getParaId(originalNetworkName, destinationNetworkName);

    if (!recipientParaId) {
      this.transfer = undefined;

      return;
    }

    const recipientId = this.getTransactionAddress(wallet, destinationNetworkName);
    const networks = NetworksController.getNetworks();
    const { api } = networks.find(({ name }) => name === originalNetworkName)!; // eslint-disable-line
    const m = XCM_LOC.filter((x) => api.tx[x] && isFunction(api.tx[x].limitedTeleportAssets))[0];
    const isParaTeleport = m === 'polkadotXcm';
    const precisionAmount = this.getPrecisionValue(amount, precision);
    const tx = api.tx[m].limitedTeleportAssets;
    const publicKey = BaseApi.decodeAddress(recipientId);
    const params = getParams(isParaTeleport, recipientParaId, publicKey, precisionAmount);

    this.transfer = tx(...params);
  }

  public async getPartialFee(from: string, { precision }: NetworkProps): Promise<string> {
    if (!this.transfer) return '0';

    const { partialFee } = await this.transfer.paymentInfo(from);
    const result = new FPNumber(partialFee as any, precision);

    return result.toString();
  }

  public async send(from: string, amount: string): Promise<void> {
    const pair = BaseApi.getPair(from);

    const unsubscribe = await this.transfer!.signAndSend(pair, this.options, ({ status }) => { //eslint-disable-line
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
  }
}
