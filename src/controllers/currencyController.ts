import { Currency } from '@/interfaces/currencies';
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

  private getCountTokens(): number {
    return this.currency.availableInNetworks.reduce((sum, { balance }) => sum + balance, 0);
  }

  private getTotalBalance(): number {
    return this.currency.price * this.getCountTokens();
  }

  public getCurrencyInfo(): CurrencyInfo {
    const { token, mainNetwork, grown, grownPercent, price, availableInNetworks } = this.currency;

    const countTokens = this.getCountTokens();
    const totalBalance = this.getTotalBalance();

    return { mainNetwork, token, grown, grownPercent, price, availableInNetworks, countTokens, totalBalance };
  }

  public getCurrencyVisible(): boolean {
    const lsVisible = this.lsCurrency.get(this.currencyVisibleStorageName);

    return lsVisible.value ?? true;
  }

  public setCurrencyVisible(value: boolean): void {
    this.lsCurrency.set(this.currencyVisibleStorageName, value, {}, { saveDateCreated: false });
  }
}
