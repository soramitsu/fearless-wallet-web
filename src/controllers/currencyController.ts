import keyring from '@polkadot/ui-keyring';
import LocalStorageController from '@/controllers/localStorageController';
import NetworksController from '@/controllers/networksController';
import store from '@/store';
import teleportInfo from '@/consts/teleport';
import { BN, isFunction } from '@polkadot/util';
import { FPNumber } from '@/util/fp';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import type { AssetsJson } from '@/store/networks/types';
import type { AvailableInNetworks } from '@/interfaces/currencies';
import type { SubmittableExtrinsic } from '@polkadot/api-base/types';
import type { MainNetworkName } from '@/consts/teleport';

const XCM_LOC = ['xcm', 'xcmPallet', 'polkadotXcm'];

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
  public transfer!: SubmittableExtrinsic<'promise'> | undefined;

  constructor(
    public mainNetwork: string,
    public token: string,
    public price: number,
    public usd24HoursChange: number,
    public precision: number,
    public availableInNetworks: AvailableInNetworks[]
  ) {
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

      availableInNetworks[typedFiled] = availableInNetworks[typedFiled].div(this.decimals);
    }

    return availableInNetworks;
  }

  private _getTotalCountTokens(): FPNumber {
    return this.countTokens().total;
  }

  public addNumbers(values: number[]): number {
    return values.reduce((sum, number) => sum.add(new FPNumber(number)), new FPNumber(0)).toNumber();
  }

  public getTotalCountTokens(): number {
    return this._getTotalCountTokens().toNumber();
  }

  public getTransferableCountTokens(): number {
    return this.countTokens().transferable.toNumber();
  }

  public getTransferableCountTokensMinusFee(fee: number): number {
    const FPFee = new FPNumber(fee);
    const result = this.countTokens().transferable.sub(FPFee).toNumber();

    return result > 0 ? result : 0;
  }

  public isValidCountTokens(count: number, fee: number): boolean {
    const transferableCountTokensMinusFee = this.getTransferableCountTokensMinusFee(fee);

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

    return Math.floor(new FPNumber(amount === '' ? 0 : +amount).mul(decimals).toNumber()).toString();
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

  public createSendTransfer(to: string, networkName: string, token: string, amount: string): void {
    const precisionAmount = CurrencyController.getPrecisionValue(token, amount);
    const networks = NetworksController.getNetworks();
    const { api } = networks.find(({ name }) => name === networkName)!; // eslint-disable-line

    try {
      this.transfer = api.tx.balances.transfer(to, precisionAmount.toString());
    } catch {
      this.transfer = undefined;
    }
  }

  public async createTeleportTransfer(
    recipientId: string,
    originalNetworkName: string,
    destinationNetworkName: string,
    token: string,
    amount: string
  ): Promise<void> {
    const networks = NetworksController.getNetworks();
    const { api } = networks.find(({ name }) => name === originalNetworkName)!; // eslint-disable-line
    const m = XCM_LOC.filter((x) => api.tx[x] && isFunction(api.tx[x].limitedTeleportAssets))[0];
    const isParaTeleport = m === 'polkadotXcm';
    const precisionAmount = CurrencyController.getPrecisionValue(token, amount);
    const tx = api.tx[m].limitedTeleportAssets;
    const accountId32 = api.createType('AccountId32', recipientId).toHex();
    const recipientParaId = this.getParaId(originalNetworkName, destinationNetworkName);

    if (!recipientParaId) {
      this.transfer = undefined;

      return;
    }

    const params = getParams(isParaTeleport, recipientParaId, accountId32, new BN(precisionAmount));

    this.transfer = tx(...params);
  }

  public async getPartialFee(from: string, returnNumberType = false): Promise<number | FPNumber> {
    if (!this.transfer) return returnNumberType ? 0 : new FPNumber(0);

    const { partialFee } = await this.transfer.paymentInfo(from);
    const [fee, unit] = partialFee.toHuman().split(' ');
    const precision = unit[0] === 'm' ? 3 : unit[0] === 'µ' ? 6 : 1;
    const decimals = new FPNumber(10 ** precision);
    const result = new FPNumber(fee).div(decimals);

    return returnNumberType ? +result.toNumber().toFixed(5) : result;
  }

  public async send(from: string, amount: string): Promise<void> {
    const pair = keyring.getPair(from);

    pair.unlock();

    const unsubscribe = await this.transfer!.signAndSend(pair, ({ status }) => {
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

function getParams(isParaTeleport: boolean, recipientParaId: number, accountId32: string, amount: BN) {
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
