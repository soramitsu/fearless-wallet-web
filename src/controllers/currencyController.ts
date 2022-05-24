import { Currency } from '@/interfaces/currencies';
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

  private getCountTokens(): number {
    return this.currency.availableInNetworks
      .reduce((sum, { balance: { total } }) => {
        const FPBalance = new FPNumber(total);

        sum = sum.add(FPBalance);

        return sum;
      }, new FPNumber(0))
      .toNumber();
  }

  private getTotalBalance(): FPNumber {
    const countTokens = this.getCountTokens();

    return this.calculateCost(countTokens);
  }

  public getCurrencyInfo(): CurrencyInfo {
    const { token } = this.currency;

    // TODO: fix
    const decimals = token === 'kilt' ? 1e15 : token === 'qtz' ? 1e18 : 1e12;

    const totalCountTokens = this.getCountTokens() / decimals;
    const totalBalance = this.getTotalBalance().toNumber() / decimals;

    return { ...this.currency, totalCountTokens, totalBalance };
  }

  public getCostOfTokens(count: number): number {
    return this.calculateCost(count).toNumber();
  }

  public getCountsTokensByPrice(cost: number): number {
    const FPcost = new FPNumber(cost);
    const price = new FPNumber(this.currency.price);

    return FPcost.div(price).toNumber();
  }

  private calculateCost(count: number): FPNumber {
    const price = new FPNumber(this.currency.price);

    return new FPNumber(count).mul(price);
  }

  public getCurrencyVisible(): boolean {
    const lsVisible = this.lsCurrency.get(this.currencyVisibleStorageName);

    return lsVisible.value ?? true;
  }

  public setCurrencyVisible(value: boolean): void {
    this.lsCurrency.set(this.currencyVisibleStorageName, value, {}, { saveDateCreated: false });
  }
}
