import { APIItemState } from '@extension-base/api/types/networks';
import { FPNumber } from '@sora-substrate/util';
import { DEFAULT_PRICES } from '../prices-service';
import { type ResponseBalanceRequest } from '../../background/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { NetworkName } from '@/interfaces';
import type State from '@extension-base/background/handlers/State';
import { getJettonAssetId, isSameString } from '@/helpers';

type TonBalanceResult = {
  balance: string;
  state: APIItemState;
};

type TonJettonBalanceResult = {
  balance: string;
  image: string;
  name: string;
  precision: number;
  symbol: string;
  assetId: string;
  walletAddress?: BalanceItem['walletAddress'];
  state: APIItemState;
};

export class TonBalance {
  constructor(private readonly state: State) {}

  async fetchBalance(address: string, networks: NetworkName[]): Promise<ResponseBalanceRequest[]> {
    const promises: Promise<ResponseBalanceRequest[]>[] = networks.map(async (networkKey) => {
      const {
        assets,
        name: networkName,
        icon,
      } = this.state.networkService.networksGithub.find(({ name }) => isSameString(name, networkKey))!;

      const { precision, symbol, id: tonId } = assets[0];

      const tonBalance = await this.fetchUtilityAsset(address, networkKey, precision, tonId);

      this.state.balanceService.setBalanceItem(
        networkName,
        {
          state: tonBalance.state,
          precision,
          relayChain: networkName.toLowerCase(),
          symbol,
          id: tonId,
          total: tonBalance.balance,
          transferable: tonBalance.balance,
        },
        address
      );

      const jettonsBalance = await this.fetchJettonsAsset(address, networkKey);

      jettonsBalance.forEach(({ balance, image, name, precision, symbol, assetId, walletAddress, state }) => {
        this.state.balanceService.setBalanceItem(
          networkName,
          {
            state,
            precision,
            relayChain: networkName.toLowerCase(),
            assetIcon: image,
            icon,
            id: assetId,
            name,
            symbol,
            total: balance,
            transferable: balance,
            walletAddress,
          },
          address
        );
      });

      return [
        {
          balance: tonBalance.balance,
          network: networkName,
          assetId: tonId,
        },
        ...jettonsBalance.map(({ balance, assetId }) => ({
          balance,
          network: networkName,
          assetId,
        })),
      ];
    });

    return (await Promise.all(promises)).flat();
  }

  async fetchUtilityAsset(
    address: string,
    networkName: NetworkName,
    precision: number,
    assetId: string
  ): Promise<TonBalanceResult> {
    try {
      const api = this.state.getTonApiMap[networkName];

      const { walletContract } = this.state.keyringService.tonKeyring.accountSubject.value[address];

      const account = await api.api?.accounts.getAccount(walletContract.address);

      const { balance } = account;

      const balanceFP = FPNumber.fromCodecValue(balance, precision);

      console.info(`[TON] TON ${address}: `, balanceFP.toString());

      return { balance: balanceFP.toString(), state: APIItemState.READY };
    } catch (error) {
      console.error('[TON][fetchUtilityAsset] Error', error);

      return {
        balance: this.getCachedBalance(address, networkName, assetId) ?? '0',
        state: APIItemState.ERROR,
      };
    }
  }

  async fetchJettonsAsset(address: string, networkName: NetworkName): Promise<TonJettonBalanceResult[]> {
    try {
      const api = this.state.getTonApiMap[networkName];

      const { walletContract } = this.state.keyringService.tonKeyring.accountSubject.value[address];

      const response = await api.api?.accounts.getAccountJettonsBalances(walletContract.address, {
        currencies: [this.state.pricesService.fiatSymbol],
      });

      const { balances } = response;

      const prices = DEFAULT_PRICES;

      const prepareBalances = balances.map((props) => {
        const {
          balance,
          jetton: { decimals, image, symbol, name },
          walletAddress: { address: walletAddress },
        } = props;

        const symbolLower = symbol.toLowerCase();
        const { price, diff24 } = this.state.pricesService.tonPricingService.tonParseRates(props.price!);

        prices.tokenPriceChange = { ...prices.tokenPriceChange, [symbolLower]: diff24 };
        prices.tokenPriceMap = { ...prices.tokenPriceMap, [symbolLower]: price };

        const balanceFP = FPNumber.fromCodecValue(balance, decimals);

        return {
          balance: balanceFP.toString(),
          precision: decimals,
          symbol: symbolLower,
          walletAddress,
          image,
          name,
          assetId: getJettonAssetId(name, symbolLower),
          state: APIItemState.READY,
        };
      });

      this.state.pricesService.setPriceValue(prices);

      return prepareBalances;
    } catch (error) {
      console.error('[TON][fetchJettonsAsset] Error', error);

      return this.getCachedJettonBalances(address, networkName);
    }
  }

  private getCachedBalance(address: string, networkName: NetworkName, assetId: string): string | undefined {
    const cachedBalance = this.getCachedBalanceItems(address).find(
      ({ id, mainNetwork, name, total, transferable, free }) =>
        id === assetId &&
        (isSameString(name, networkName) || isSameString(mainNetwork, networkName)) &&
        (transferable !== undefined || total !== undefined || free !== undefined)
    );

    return cachedBalance?.transferable ?? cachedBalance?.total ?? cachedBalance?.free;
  }

  private getCachedJettonBalances(address: string, networkName: NetworkName): TonJettonBalanceResult[] {
    return this.getCachedBalanceItems(address)
      .filter(({ id, mainNetwork, name, type, total, transferable, free }) => {
        if (!id || (transferable === undefined && total === undefined && free === undefined)) return false;

        const belongsToNetwork = isSameString(name, networkName) || isSameString(mainNetwork, networkName);

        return belongsToNetwork && type === 'jetton';
      })
      .map(({ assetIcon, icon, id, precision, symbol, total, transferable, free, walletAddress }) => ({
        balance: transferable ?? total ?? free ?? '0',
        image: assetIcon ?? icon,
        name: symbol,
        precision,
        symbol,
        assetId: id,
        walletAddress,
        state: APIItemState.ERROR,
      }));
  }

  private getCachedBalanceItems(address: string): BalanceItem[] {
    const accountAddress = this.state.keyringService.getSubstrateAddress?.(address) ?? address;
    const groups = this.state.balanceService.balanceMap[accountAddress] ?? this.state.balanceService.balanceMap[address] ?? [];

    return groups.flatMap(({ balances }) => balances);
  }
}
