import { APIItemState } from '@extension-base/api/types/networks';
import { FPNumber } from '@sora-substrate/util';
import axios from 'axios';
import { DEFAULT_PRICES } from '../prices-service';
import { type ResponseBalanceRequest } from '../../background/types/types';
import type { NetworkName } from '@/interfaces';
import type State from '@extension-base/background/handlers/State';
import { getJettonAssetId, isSameString } from '@/helpers';
import { URLS } from '@/consts/urls';

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

      const tonBalance = await this.fetchUtilityAsset(address, networkKey, precision);

      this.state.balanceService.setBalanceItem(
        networkName,
        {
          state: APIItemState.READY,
          precision,
          relayChain: networkName.toLowerCase(),
          symbol,
          id: tonId,
          total: tonBalance,
          transferable: tonBalance,
        },
        address
      );

      const jettonsBalance = await this.fetchJettonsAsset(address, networkKey);

      jettonsBalance.forEach(({ balance, image, name, precision, symbol, assetId, walletAddress }) => {
        this.state.balanceService.setBalanceItem(
          networkName,
          {
            state: APIItemState.READY,
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
          balance: tonBalance,
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

  async fetchUtilityAsset(address: string, networkName: NetworkName, precision: number) {
    try {
      const api = this.state.getTonApiMap[networkName];

      const { walletContract } = this.state.keyringService.tonKeyring.accountSubject.value[address];

      const account = await api.api?.accounts.getAccount(walletContract.address);

      const { balance } = account;

      const balanceFP = FPNumber.fromCodecValue(balance, precision);

      console.info(`[TON] TON ${address}: `, balanceFP.toString());

      return balanceFP.toString();
    } catch (error) {
      console.error('[TON][fetchUtilityAsset] Error', error);

      return '0';
    }
  }

  async fetchJettonsAsset(address: string, networkName: NetworkName) {
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
        };
      });

      this.state.pricesService.setPriceValue(prices);

      return prepareBalances;
    } catch (error) {
      console.error('[TON][fetchJettonsAsset] Error', error);

      return [];
    }
  }
}
