import keyring from '@polkadot/ui-keyring';
import LocalStorageController from '@/controllers/localStorageController';
import NetworksController from '@/controllers/networksController';
import store from '@/store';
import teleportInfo from '@/consts/teleport';
import { BN, isFunction } from '@polkadot/util';
import { FPNumber } from '@/util/fp';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import type { CurrencyFields, AvailableInNetworks } from '@/interfaces/currencies';
import type { AssetsJson } from '@/store/networks/types';
import type { SubmittableExtrinsic } from '@polkadot/api-base/types';
import type { MainNetworkName } from '@/consts/teleport';
import type { SignerOptions } from '@polkadot/api/submittable/types';

const XCM_LOC = ['xcm', 'xcmPallet', 'polkadotXcm'];

interface BalanceFP {
  total: FPNumber;
  frozen: FPNumber;
  locked: FPNumber;
  reserved: FPNumber;
  transferable: FPNumber;
}

type AvailableInNetworksFP = Omit<AvailableInNetworks, 'balance'> & { balance: BalanceFP };

export default class CurrencyController {
  private readonly lsCurrency = new LocalStorageController('currency');
  private readonly currencyVisibleStorageName = 'currency_visible';
  public transfer!: SubmittableExtrinsic<'promise'> | undefined;
  public options: Partial<SignerOptions> = {};
  public availableInNetworks: AvailableInNetworksFP[];

  constructor(
    public mainNetwork: string,
    public token: string,
    public price: number,
    public usd24HoursChange: number,
    public precision: number,
    availableInNetworks: AvailableInNetworks[]
  ) {
    this.availableInNetworks = availableInNetworks.map(
      ({ network, balance: { frozen, locked, reserved, total, transferable } }) => ({
        network,
        balance: {
          frozen: FPNumber.fromCodecValue(frozen, this.precision),
          locked: FPNumber.fromCodecValue(locked, this.precision),
          reserved: FPNumber.fromCodecValue(reserved, this.precision),
          total: FPNumber.fromCodecValue(total, this.precision),
          transferable: FPNumber.fromCodecValue(transferable, this.precision),
        },
      })
    );
  }

  private getCurrenciesVisible() {
    const currencyVisible = this.lsCurrency.get(this.currencyVisibleStorageName);

    return currencyVisible.value ?? {};
  }

  private calculateCost(count: FPNumber): FPNumber {
    const FPPrice = new FPNumber(this.price);

    return count.mul(FPPrice);
  }

  private countTotalTokens(): BalanceFP {
    const availableInNetworks = this.availableInNetworks.reduce(
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

    return availableInNetworks;
  }

  public updateFields({ availableInNetworks, precision, price, usd24HoursChange, mainNetwork }: CurrencyFields): void {
    this.precision = precision;
    this.price = price;
    this.usd24HoursChange = usd24HoursChange;

    const index = this.availableInNetworks.findIndex(({ network }) => network === mainNetwork);

    const {
      network,
      balance: { frozen, locked, reserved, total, transferable },
    } = availableInNetworks[0];

    const newValue = {
      network: network,
      balance: {
        frozen: FPNumber.fromCodecValue(frozen, this.precision),
        locked: FPNumber.fromCodecValue(locked, this.precision),
        reserved: FPNumber.fromCodecValue(reserved, this.precision),
        total: FPNumber.fromCodecValue(total, this.precision),
        transferable: FPNumber.fromCodecValue(transferable, this.precision),
      },
    };

    this.availableInNetworks.splice(index, 1, newValue);
  }

  public getTotalCountTokens(): string {
    return this.countTotalTokens().total.toString();
  }

  public getTransferableCountTokens(networkProp: string): string {
    const { transferable } = this.availableInNetworks.find(({ network }) => network === networkProp)!.balance;

    return transferable.toString();
  }

  public getTransferableCountTokensMinusFee(fee: string): FPNumber {
    const FPFee = new FPNumber(fee);
    const result = this.countTotalTokens().transferable.sub(FPFee);

    return FPNumber.lt(result, FPNumber.ZERO) ? FPNumber.ZERO : result;
  }

  public isValidCountTokens(count: string, fee: string): boolean {
    const transferableCountTokensMinusFee = this.getTransferableCountTokensMinusFee(fee);

    return FPNumber.lte(new FPNumber(count), transferableCountTokensMinusFee);
  }

  public getAvailableInNetworks(): AvailableInNetworks[] {
    return this.availableInNetworks.map(({ balance: { frozen, locked, reserved, total, transferable }, network }) => {
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

  public getTotalBalance(): string {
    const countTokens = this.countTotalTokens().total;
    const cost = this.calculateCost(countTokens);

    return cost.toString();
  }

  public getCostOfTokens(count: string): string {
    return this.calculateCost(new FPNumber(count)).toString();
  }

  public getBalanceInNetwork(_network: string): string {
    const total = this.availableInNetworks.find(({ network }) => network === _network)?.balance.total ?? FPNumber.ZERO;

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

  private static getAssets(token: string): AssetsJson {
    const assets: AssetsJson[] = store.getters[NetworksGettersTypes.getAssetsInfo];

    return assets.find(({ id }) => id === token)!;
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
    recipientId: string,
    originalNetworkName: string,
    destinationNetworkName: string,
    amount: string
  ): Promise<void> {
    const networks = NetworksController.getNetworks();
    const { api } = networks.find(({ name }) => name === originalNetworkName)!; // eslint-disable-line
    const m = XCM_LOC.filter((x) => api.tx[x] && isFunction(api.tx[x].limitedTeleportAssets))[0];
    const isParaTeleport = m === 'polkadotXcm';
    const precisionAmount = CurrencyController.getPrecisionValue(this.token, amount);
    const tx = api.tx[m].limitedTeleportAssets;
    const publicKey = keyring.decodeAddress(recipientId);
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
    const pair = keyring.getPair(from);

    pair.unlock();

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
