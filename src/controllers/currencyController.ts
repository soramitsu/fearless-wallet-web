import { Currency } from '@/interfaces/currencies';
import { FPNumber } from '@/util/fp';
import LocalStorageController from '@/controllers/localStorageController';

export interface CurrencyInfo extends Currency {
  countTokens: number;
  totalBalance: number;
}

export default class CurrencyController {
  private readonly lsCurrency = new LocalStorageController('currency');
  private readonly currencyVisibleStorageName;
  private currency;

  constructor(currency: Currency) {
    this.currency = currency;
    this.currencyVisibleStorageName = `visible-${this.currency.token}`;
  }

  private getCountTokens(): FPNumber {
    return this.currency.availableInNetworks.reduce((sum, { balance }) => {
      const FPBalance = new FPNumber(balance, 12);

      sum = sum.add(FPBalance);

      return sum;
    }, new FPNumber(0, 12));
  }

  private getTotalBalance(): FPNumber {
    const price = new FPNumber(this.currency.price);

    return this.getCountTokens().mul(price);
  }

  public getCurrencyInfo(): CurrencyInfo {
    const { token } = this.currency;

    // TODO: fix
    const decimals = token === 'kilt' ? 1e15 : token === 'qtz' ? 1e18 : 1e12;

    const countTokens = this.getCountTokens().toNumber() / decimals;
    const totalBalance = this.getTotalBalance().toNumber() / decimals;

    return { ...this.currency, countTokens, totalBalance };
  }

  public getCurrencyVisible(): boolean {
    const lsVisible = this.lsCurrency.get(this.currencyVisibleStorageName);

    return lsVisible.value ?? true;
  }

  public setCurrencyVisible(value: boolean): void {
    this.lsCurrency.set(this.currencyVisibleStorageName, value, {}, { saveDateCreated: false });
  }
}
