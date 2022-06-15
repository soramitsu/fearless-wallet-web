import store from '@/store';
import LocalStorageController from '@/controllers/localStorageController';
import { AvailableInNetworks } from '@/interfaces/currencies';
import { FPNumber } from '@/util/fp';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { AssetsJson } from '@/store/networks/types';

export interface Props {
  mainNetwork: string;
  token: string;
  price: number;
  usd24HoursChange: number;
  availableInNetworks: AvailableInNetworks[];
  precision: number;
}

export default class CurrencyController {
  private readonly lsCurrency = new LocalStorageController('currency');
  private readonly currencyVisibleStorageName: string;
  private readonly decimals: FPNumber;
  private availableInNetworks: AvailableInNetworks[];
  public mainNetwork: string;
  public token: string;
  public price: number;
  public usd24HoursChange: number;
  public precision: number;

  constructor({ mainNetwork, token, price, usd24HoursChange, availableInNetworks, precision }: Props) {
    this.mainNetwork = mainNetwork;
    this.token = token;
    this.price = price;
    this.usd24HoursChange = usd24HoursChange;
    this.availableInNetworks = availableInNetworks;
    this.precision = precision;
    this.decimals = this.getDecimals();
    this.currencyVisibleStorageName = `visible-${token}`;
  }

  private calculateCost(count: FPNumber): FPNumber {
    const FPPrice = new FPNumber(this.price);

    return count.mul(FPPrice);
  }

  private getDecimals(): FPNumber {
    return new FPNumber(10 ** this.precision);
  }

  private _getTotalCountTokens(): FPNumber {
    return this.availableInNetworks
      .reduce((sum, { balance: { total } }) => {
        const FPBalance = new FPNumber(total);

        sum = sum.add(FPBalance);

        return sum;
      }, new FPNumber(0))
      .div(this.decimals);
  }

  public getAvailableInNetworks(): AvailableInNetworks[] {
    const updatedAvailableInNetworks: AvailableInNetworks[] = this.availableInNetworks.map(
      ({ balance: { frozen, locked, reserved, total, transferable }, network }) => {
        return {
          network,
          balance: {
            frozen: new FPNumber(frozen).div(this.decimals).toString(),
            locked: new FPNumber(locked).div(this.decimals).toString(),
            reserved: new FPNumber(reserved).div(this.decimals).toString(),
            total: new FPNumber(total).div(this.decimals).toString(),
            transferable: new FPNumber(transferable).div(this.decimals).toString(),
          },
        };
      }
    );

    return updatedAvailableInNetworks;
  }

  public getTotalCountTokens(): number {
    return this._getTotalCountTokens().toNumber();
  }

  public getAllFields(): Props {
    return {
      token: this.token,
      mainNetwork: this.mainNetwork,
      availableInNetworks: this.availableInNetworks,
      price: this.price,
      usd24HoursChange: this.usd24HoursChange,
      precision: this.precision,
    };
  }

  public getTotalBalance(): number {
    const countTokens = this._getTotalCountTokens();
    const cost = this.calculateCost(countTokens);

    return cost.toNumber();
  }

  public getCostOfTokens(count: number): number {
    return this.calculateCost(new FPNumber(count)).toNumber();
  }

  public getBalanceInNetwork(_network: string): number {
    const total = this.availableInNetworks.find(({ network }) => network === _network)?.balance.total ?? 0;

    return this.calculateCost(new FPNumber(total)).div(this.decimals).toNumber();
  }

  public getCountsTokensByPrice(cost: number): number {
    const FPCost = new FPNumber(cost);
    const price = new FPNumber(this.price);

    return FPCost.div(price).toNumber();
  }

  public getCurrencyVisible(): boolean {
    const lsVisible = this.lsCurrency.get(this.currencyVisibleStorageName);

    return lsVisible.value ?? true;
  }

  public setCurrencyVisible(value: boolean): void {
    this.lsCurrency.set(this.currencyVisibleStorageName, value, {}, { saveDateCreated: false });
  }

  private static getAssets(token: string): AssetsJson {
    const assets: AssetsJson[] = store.getters[NetworksGettersTypes.getAssetsInfo];

    return assets.find(({ id }) => id === token)!;
  }

  public static getPrecisionValue(token: string, value: string): number {
    const precision = CurrencyController.getAssets(token)?.precision ?? 0;
    const decimals = new FPNumber(10 ** +precision);

    return new FPNumber(value).div(decimals).toNumber();
  }
}
