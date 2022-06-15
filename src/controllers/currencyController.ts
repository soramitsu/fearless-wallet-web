import store from '@/store';
import LocalStorageController from '@/controllers/localStorageController';
import { AvailableInNetworks } from '@/interfaces/currencies';
import { FPNumber } from '@/util/fp';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { AssetsJson } from '@/store/networks/types';
import type { ISubmittableResult } from '@polkadot/types/types';
import type { SubmittableExtrinsic } from '@polkadot/api-base/types';
import keyring from '@polkadot/ui-keyring';
import NetworksController from '@/controllers/networksController';

export interface Props {
  mainNetwork: string;
  token: string;
  price: number;
  usd24HoursChange: number;
  availableInNetworks: AvailableInNetworks[];
  precision: number;
}

interface CountTokens {
  total: FPNumber;
  frozen: FPNumber;
  locked: FPNumber;
  reserved: FPNumber;
  transferable: FPNumber;
}

export default class CurrencyController {
  private readonly lsCurrency = new LocalStorageController('currency');
  private readonly currencyVisibleStorageName: string;
  private readonly decimals: FPNumber;
  private availableInNetworks: AvailableInNetworks[];
  public transfer!: SubmittableExtrinsic<'promise', ISubmittableResult> | undefined;
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

  private countTokens(): CountTokens {
    const availableInNetworks = this.availableInNetworks.reduce(
      (obj, { balance: { total, frozen, locked, reserved, transferable } }) => {
        const FPTotal = new FPNumber(total);
        const FPFrozen = new FPNumber(frozen);
        const FPLocked = new FPNumber(locked);
        const FPReserved = new FPNumber(reserved);
        const FPTransferable = new FPNumber(transferable);

        return {
          total: obj.total.add(FPTotal),
          frozen: obj.frozen.add(FPFrozen),
          locked: obj.locked.add(FPLocked),
          reserved: obj.reserved.add(FPReserved),
          transferable: obj.transferable.add(FPTransferable),
        };
      },
      {
        total: new FPNumber(0),
        frozen: new FPNumber(0),
        locked: new FPNumber(0),
        reserved: new FPNumber(0),
        transferable: new FPNumber(0),
      }
    );

    for (const field in availableInNetworks) {
      const typedFiled = field as keyof typeof availableInNetworks;

      availableInNetworks[typedFiled] = (availableInNetworks[typedFiled] as FPNumber).div(this.decimals);
    }

    return availableInNetworks;
  }

  private _getTotalCountTokens(): FPNumber {
    return this.countTokens().total;
  }

  public getTotalCountTokens(): number {
    return this._getTotalCountTokens().toNumber();
  }

  public getTransferableCountTokens(): number {
    return this.countTokens().transferable.toNumber();
  }

  public async getTransferableCountTokensMinusFee(from: string): Promise<number> {
    const fee = (await this.getPartialFee(from)) as FPNumber;
    const result = this.countTokens().transferable.sub(fee).toNumber();

    return result > 0 ? result : 0;
  }

  public async isValidCountTokens(count: number, from: string): Promise<boolean> {
    const transferableCountTokensMinusFee = await this.getTransferableCountTokensMinusFee(from);

    return count <= transferableCountTokensMinusFee;
  }

  public getAvailableInNetworks(): AvailableInNetworks[] {
    return this.availableInNetworks.map(({ balance: { frozen, locked, reserved, total, transferable }, network }) => {
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
    });
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

  private static getDecimals(token: string): FPNumber {
    const precision = CurrencyController.getAssets(token)?.precision ?? 0;
    const decimals = new FPNumber(10 ** +precision);

    return decimals;
  }

  public static getAroundValue(token: string, value: string): number {
    const decimals = this.getDecimals(token);

    return new FPNumber(value).div(decimals).toNumber();
  }

  public static getPrecisionValue(token: string, amount: string): string {
    const decimals = this.getDecimals(token);

    return Math.floor(new FPNumber(+amount).mul(decimals).toNumber()).toString();
  }

  public createTransfer(to: string, networkName: string, token: string, amount: string): boolean {
    const precisionAmount = CurrencyController.getPrecisionValue(token, amount);
    const networks = NetworksController.getNetworks();
    const { api } = networks.find(({ name }) => name === networkName)!; // eslint-disable-line

    try {
      this.transfer = api.tx.balances.transfer(to, precisionAmount.toString());
    } catch {
      this.transfer = undefined;
    }

    return this.transfer !== undefined;
  }

  public resetTransfer(): void {
    this.transfer = undefined;
  }

  public async getPartialFee(from: string, fixed = false): Promise<number | FPNumber> {
    if (!this.transfer) return fixed ? 0 : new FPNumber(0);

    const { partialFee } = await this.transfer.paymentInfo(from);
    const [fee, unit] = partialFee.toHuman().split(' ');
    const result = new FPNumber(fee).div(new FPNumber(1000));

    return fixed ? +result.toNumber().toFixed(5) : result;
  }

  public async send(from: string, amount: string): Promise<void> {
    const pair = keyring.getPair(from);

    pair.unlock();

    const unsubscribe = await this.transfer!.signAndSend(pair, ({ status }) => {
      if (status.isInBlock) {
        console.log(`Successful transfer of ${amount} with hash ${status.asInBlock.toHex()}`);
      } else if (status.isFinalized) {
        console.log(`Transaction finalized at blockHash ${status.asFinalized}`);

        unsubscribe();

        pair.lock();
      } else {
        console.log(`Status of transfer: ${status.type}`);
      }
    });
  }
}
