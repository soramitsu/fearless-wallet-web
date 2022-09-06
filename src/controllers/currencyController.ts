import { BN, isFunction } from '@polkadot/util';
import type { AvailableInNetworks, Balances, BalanceFP, AvailableInNetworksFP } from '@/interfaces/currencies';
import type {
  AssetJson,
  UpdateCurrencyProps,
  UpdateCurrencyBalanceProps,
  TokenPriceJson,
  KeyTokenPriceJson,
} from '@/store/networks/types';
import type { SubmittableExtrinsic } from '@polkadot/api-base/types';
import type { MainNetworkName } from '@/consts/teleport';
import type { SignerOptions } from '@polkadot/api/submittable/types';
import type { Wallet } from '@/store/accounts/types';
import BaseApi from '@/util/BaseApi';
import LocalStorageController from '@/controllers/localStorageController';
import NetworksController from '@/controllers/networksController';
import store from '@/store';
import teleportInfo from '@/consts/teleport';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import { FPNumber } from '@/util/fp';
import { getReplacedMetaTyped } from '@/util/helpers';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

const XCM_LOC = ['xcm', 'xcmPallet', 'polkadotXcm'];

export default class CurrencyController {
  private readonly lsCurrency = new LocalStorageController('currency');
  private readonly currencyVisibleStorageName = 'currency_visible';
  public transfer!: SubmittableExtrinsic<'promise'> | undefined;
  public options: Partial<SignerOptions> = {};
  public balances: Balances = {};
  public price = 0;
  public hours24Change = 0;

  constructor(
    public mainNetwork: string,
    public token: string,
    public tokensPrice: TokenPriceJson,
    public precision: number,
    public providers: string[]
  ) {
    console.info();
  }

  public updatePrice(selectedFiat: string) {
    const hours24ChangeField = `${selectedFiat}_24h_change` as KeyTokenPriceJson;

    this.price = this.tokensPrice[selectedFiat as KeyTokenPriceJson] ?? 0;
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
      const { network } = item;
      let { balance } = item;

      const replacedAddress = replacedNetworks[network];
      const replacedAvailableInNetworks = this.balances[replacedAddress];

      if (replacedAvailableInNetworks) {
        const { balance: replacedBalance } = replacedAvailableInNetworks.find( // eslint-disable-line
          ({ network: _network }) => _network === network
        )!;

        balance = replacedBalance;
      }

      return { network, balance };
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

  public updateCurrency({ precision, tokensPrice, selectedFiat }: UpdateCurrencyProps): void {
    this.precision = precision ?? this.precision;
    this.tokensPrice = tokensPrice ?? this.tokensPrice;

    this.updatePrice(selectedFiat);
  }

  public updateCurrencyBalance({ walletAddress, currency }: UpdateCurrencyBalanceProps): CurrencyController {
    const { network: networkProp, balance } = currency;
    const { frozen, locked, reserved, total, transferable } = balance;
    const oldBalances = { ...this.balances };
    let balancesForAddress = oldBalances[walletAddress];

    const newValue = {
      network: networkProp,
      balance: {
        frozen: FPNumber.fromCodecValue(frozen, this.precision),
        locked: FPNumber.fromCodecValue(locked, this.precision),
        reserved: FPNumber.fromCodecValue(reserved, this.precision),
        total: FPNumber.fromCodecValue(total, this.precision),
        transferable: FPNumber.fromCodecValue(transferable, this.precision),
      },
    };

    if (balancesForAddress) {
      const index = balancesForAddress.findIndex(({ network }) => network === networkProp);

      if (index === -1) balancesForAddress.push(newValue);
      else balancesForAddress.splice(index, 1, newValue);
    } else balancesForAddress = [newValue];

    this.balances = { ...oldBalances, [walletAddress]: balancesForAddress };

    return this;
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

    return availableInNetworks.map(({ balance: { frozen, locked, reserved, total, transferable }, network }) => {
      return {
        network,
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

  private static getAssets(token: string): AssetJson {
    const assets: AssetJson[] = store.getters[NetworksGettersTypes.getAssets];

    return assets.find(({ id }) => id === token)!; // eslint-disable-line
  }

  public static getHumanValue(token: string, value: string): string {
    const precision = +CurrencyController.getAssets(token)?.precision ?? 0;

    return FPNumber.fromCodecValue(value, precision).toString();
  }

  public static getPrecisionValue(token: string, amount: string): string {
    const precision = +CurrencyController.getAssets(token)?.precision ?? 0;
    const value = amount === '' ? 0 : +amount;

    return new FPNumber(value, precision).toCodecString();
  }

  public getParaId(originalNetworkName: string, destinationNetworkName: string) {
    const isTeleportToMainNetwork =
      teleportInfo[destinationNetworkName as MainNetworkName]?.parachains[originalNetworkName];

    return (
      teleportInfo[originalNetworkName as MainNetworkName]?.parachains[destinationNetworkName]?.paraId ??
      (isTeleportToMainNetwork ? -1 : undefined)
    );

    // return !isParaTeleport
    //   ? teleportInfo[originalNetworkName as MainNetworkName]?.parachains[destinationNetworkName]?.paraId
    //   : isTeleportToMainNetwork
    //   ? -1
    //   : undefined;
  }

  public createSendTransfer(to: string, networkName: string, amount: string): void {
    const precisionAmount = CurrencyController.getPrecisionValue(this.token, amount);
    const networks = NetworksController.getNetworks();
    const { api, settings: { DefaultTip } } = networks.find(({ name }) => name === networkName)!; // eslint-disable-line
    const options = { tip: DefaultTip };

    try {
      this.transfer = api.tx.balances.transfer(to, precisionAmount);
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
    amount: string
  ): Promise<void> {
    const recipientId = this.getTransactionAddress(wallet, destinationNetworkName);
    const networks = NetworksController.getNetworks();
    const { api } = networks.find(({ name }) => name === originalNetworkName)!; // eslint-disable-line
    const m = XCM_LOC.filter((x) => api.tx[x] && isFunction(api.tx[x].limitedTeleportAssets))[0];
    const isParaTeleport = m === 'polkadotXcm';
    const precisionAmount = CurrencyController.getPrecisionValue(this.token, amount);
    const tx = api.tx[m].limitedTeleportAssets;
    const publicKey = BaseApi.decodeAddress(recipientId);
    const recipientParaId = this.getParaId(originalNetworkName, destinationNetworkName);

    if (!recipientParaId) {
      this.transfer = undefined;

      return;
    }

    const params = getParams(isParaTeleport, recipientParaId, publicKey, new BN(precisionAmount));

    this.transfer = tx(...params);
  }

  public async getPartialFee(from: string): Promise<string> {
    if (!this.transfer) return '0';

    const { partialFee } = await this.transfer.paymentInfo(from);
    const result = new FPNumber(partialFee, this.precision);

    return result.toString();
  }

  public async send(from: string, amount: string): Promise<void> {
    const pair = BaseApi.getPair(from);

    const unsubscribe = await this.transfer!.signAndSend(pair, this.options, ({ status }) => {
      if (status.isInBlock) {
        console.info(`Successful transfer of ${amount} with hash ${status.asInBlock.toHex()}`);
      } else if (status.isFinalized) {
        console.info(`Transaction finalized at blockHash ${status.asFinalized}`);

        unsubscribe();

        pair.lock();
      } else {
        console.info(`Status of transfer: ${status.type}`);
      }
    });
  }
}

function getParams(isParaTeleport: boolean, recipientParaId: number, accountId32: string | Uint8Array, amount: BN) {
  return [
    {
      V1: isParaTeleport
        ? {
            interior: 'Here',
            parents: 1,
          }
        : {
            interior: {
              X1: {
                ParaChain: recipientParaId,
              },
            },
            parents: 0,
          },
    },
    {
      V1: {
        interior: {
          X1: {
            AccountId32: {
              id: accountId32,
              network: 'Any',
            },
          },
        },
        parents: 0,
      },
    },
    {
      V1: [
        {
          fun: {
            Fungible: amount,
          },
          id: {
            Concrete: {
              interior: 'Here',
              parents: isParaTeleport ? 1 : 0,
            },
          },
        },
      ],
    },
    0,
    { Unlimited: null },
  ];
}
