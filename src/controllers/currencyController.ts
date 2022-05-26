import store from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { AssetsJson } from '@/store/networks/types';
import { Currency, AvailableInNetworks } from '@/interfaces/currencies';
import { FPNumber } from '@/util/fp';
import LocalStorageController from '@/controllers/localStorageController';

export interface CurrencyInfo extends Currency {
  totalCountTokens: number;
  totalBalance: number;
}

export default class CurrencyController {
  private readonly lsCurrency = new LocalStorageController('currency');
  private readonly currencyVisibleStorageName;
  private currency;

  constructor(currency: Currency) {
    this.currency = currency;
    this.currencyVisibleStorageName = `visible-${currency.token}`;
  }

  private calculateCost(count: FPNumber): FPNumber {
    const { price } = this.currency;
    const FPPrice = new FPNumber(price);

    return count.mul(FPPrice);
  }

  private getAssets(token: string): AssetsJson {
    const assets: AssetsJson[] = store.getters[NetworksGettersTypes.getAssetsInfo];

    return assets.find(({ id }) => id === token)!;
  }

  private getCountTokens(): FPNumber {
    return this.currency.availableInNetworks.reduce((sum, { balance: { total } }) => {
      const FPBalance = new FPNumber(total);

      sum = sum.add(FPBalance);

      return sum;
    }, new FPNumber(0));
  }

  private getTotalBalance(): FPNumber {
    const countTokens = this.getCountTokens();

    return this.calculateCost(countTokens);
  }

  private getDecimals(): FPNumber {
    const { token } = this.currency;
    const precision = this.getAssets(token)?.precision;

    return new FPNumber(10 ** +precision);
  }

  public getCurrencyInfo(): CurrencyInfo {
    const { availableInNetworks } = this.currency;
    const decimals = this.getDecimals();
    const updatedAvailableInNetworks: AvailableInNetworks[] = availableInNetworks.map(
      ({ balance: { frozen, locked, reserved, total, transferable }, network }) => {
        return {
          network,
          balance: {
            frozen: new FPNumber(frozen).div(decimals).toString(),
            locked: new FPNumber(locked).div(decimals).toString(),
            reserved: new FPNumber(reserved).div(decimals).toString(),
            total: new FPNumber(total).div(decimals).toString(),
            transferable: new FPNumber(transferable).div(decimals).toString(),
          },
        };
      }
    );

    const totalCountTokens = this.getCountTokens().div(decimals).toNumber(12);
    const totalBalance = this.getTotalBalance().div(decimals).toNumber(12);

    return { ...this.currency, availableInNetworks: updatedAvailableInNetworks, totalCountTokens, totalBalance };
  }

  public getCostOfTokens(count: number): number {
    const FPCount = new FPNumber(count);

    return this.calculateCost(FPCount).toNumber();
  }

  public getBalanceInNetwork(_network: string): number {
    const total = this.getCurrencyInfo().availableInNetworks.find(({ network }) => network === _network)!.balance.total;

    return this.calculateCost(new FPNumber(total)).toNumber();
  }

  public getCountsTokensByPrice(cost: number): number {
    const FPCost = new FPNumber(cost);
    const price = new FPNumber(this.currency.price);

    return FPCost.div(price).toNumber();
  }

  public getCurrencyVisible(): boolean {
    const lsVisible = this.lsCurrency.get(this.currencyVisibleStorageName);

    return lsVisible.value ?? true;
  }

  public setCurrencyVisible(value: boolean): void {
    this.lsCurrency.set(this.currencyVisibleStorageName, value, {}, { saveDateCreated: false });
  }
}
