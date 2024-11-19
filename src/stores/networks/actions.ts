import axios from 'axios';
import { useAccountsStore } from '../accounts';
import { type NetworksStore } from '.';
import type {
  HistoryProps,
  NetworkFavoriteProps,
  RemoveNetworkFavoriteProps,
  SetAssetsPriceProps,
  SetNetworksStatusProps,
  SetSoraFee,
} from './types';
import type { FetchHistory, ToggleFavorite } from '@/stores';
import type { AssetId, FiatJson, SoraHistoryElement } from '@/interfaces';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { History } from '@/stores/networks/types';
import { isNativeEVMNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';
import BaseApi from '@/util/BaseApi';
import { fetchHistory } from '@/subquery/fetchingHistory';
import { URLS } from '@/consts/urls';
import { getUtilityAsset } from '@/helpers/currencies';
import { toggleFavoriteNetwork } from '@/extension/messaging';
import { isSameString, isSora } from '@/helpers';
import { getFormattedHistory } from '@/helpers/history';
import { SORA_VAL_ASSET_ID, SORA_XOR_ASSET_ID } from '@/consts/sora';

type Actions = {
  fetchFiats(this: NetworksStore): Promise<void>;
  fetchHistory(this: NetworksStore, props: FetchHistory): Promise<void>;
  toggleFavoriteNetwork(this: NetworksStore, props: ToggleFavorite): Promise<boolean>;
  setNetworks(this: NetworksStore, props: SetNetworksStatusProps): void;
  setPrices(this: NetworksStore, props: SetAssetsPriceProps): void;
  setSoraFees(this: NetworksStore, props: SetSoraFee): void;
  removeFavoriteNetwork(this: NetworksStore, props: RemoveNetworkFavoriteProps): void;
  setFavoriteNetwork(this: NetworksStore, props: NetworkFavoriteProps): void;
  setHistory(this: NetworksStore, props: HistoryProps): void;
};

export const actions: Actions = {
  removeFavoriteNetwork({ networkName, index }) {
    const networkIndex = this.networks.findIndex((el) => isSameString(el.name, networkName));
    const network = this.$state.allNetworks[networkIndex];

    network.favorite.splice(index, 1);
  },

  setFavoriteNetwork({ address, networkName }) {
    const index = this.networks.findIndex((el) => isSameString(el.name, networkName));
    const network = this.$state.allNetworks[index];

    network.favorite.push(address);
  },

  setHistory({ history, networkName, walletAddress, assetId, serviceType }) {
    const saveHistory = (assetId: AssetId, history: History) => {
      const { nodes, pageInfo } = getFormattedHistory(history, serviceType);
      const { startCursor: startCursorProp, endCursor: endCursorProp } = pageInfo;
      const oldHistory = this.history[assetId]?.[walletAddress]?.[networkName];
      const oldPageInfo = oldHistory?.pageInfo;
      const oldStartCursor = oldPageInfo?.startCursor;

      const historyForAssetId = {
        ...(this.history[assetId] ?? []),
        [walletAddress]: {
          ...(this.history[assetId]?.[walletAddress] ?? []),
          [networkName]: {
            timestamp: Date.now(),
            nodes,
            pageInfo: {
              startCursor: oldStartCursor ?? startCursorProp,
              endCursor: endCursorProp,
            },
          },
        },
      };

      this.history = { ...this.history, [assetId]: historyForAssetId };
    };

    if (serviceType === 'sora') {
      const typedHistory = history as SoraHistoryElement[];
      const historyAssets = typedHistory.reduce((result, item) => {
        const baseAssetId = item.data?.baseAssetId ?? item.data?.assetId;

        const networkJson = this.networks.find(({ name }) => isSora(name));
        const asset = networkJson?.assets.find(({ currencyId }) => currencyId === baseAssetId);
        const id = item.method === 'rewarded' ? SORA_VAL_ASSET_ID : asset?.id ?? SORA_XOR_ASSET_ID;

        if (result[id] === undefined) result[id] = [];

        result[id].push({
          ...item,
          success: item.execution.success,
        });

        return result;
      }, {} as Record<string, SoraHistoryElement[]>);

      Object.entries(historyAssets).forEach(([id, history]) => saveHistory(id, history));
    } else saveHistory(assetId, history);
  },

  async fetchFiats() {
    if (this.fiats.length === 0) {
      const { data: fiats } = await axios.get<FiatJson[]>(URLS.FIATS);

      this.fiats = fiats;
    }
  },

  async fetchHistory({ networkName, assetId, address }) {
    const { externalApi } = this.getNetwork(networkName);

    if (!externalApi?.history) return;

    const accountsStore = useAccountsStore();

    const wallet = address ? { address, ethereumAddress: address } : accountsStore.selectedWallet;
    const formattedAddress = BaseApi.formatAddress(wallet, networkName);

    const { type, url: historyUrl } = externalApi.history;
    const url = isSora(networkName) ? externalApi.staking!.url : historyUrl; // TODO remove

    const isNativeEvm = isNativeEVMNetwork(networkName);
    const balances: TokenGroup[] = accountsStore.balances ?? [];

    const asset = isNativeEvm
      ? balances.find(({ balances }) => balances.some((asset) => asset.id === assetId))
      : getUtilityAsset(balances, networkName);

    if (!asset) return;

    const utilityId = isNativeEvm
      ? asset.balances.find(
          ({ name, isUtility }) => name && name.toLowerCase() === networkName.toLowerCase() && isUtility
        )?.id
      : asset?.groupId;

    const isUtility = isNativeEvm ? utilityId !== undefined : assetId === utilityId;

    // сейчас эндпоинт истории парсит только историю утилити токена
    // TODO: когда появится история других токенов отрефаткорить данную логику
    if (!isSora(networkName)) if (!isUtility && type !== 'etherscan') return;

    const searchedAsset = asset.balances.find(({ name }) => name.toLowerCase() === networkName.toLowerCase());

    if (!searchedAsset) return;

    const history = await fetchHistory(url, formattedAddress, type, networkName, searchedAsset.id, isUtility);

    if (history)
      this.setHistory({
        networkName: networkName.toLowerCase(),
        walletAddress: BaseApi.formatAddress(wallet),
        history,
        assetId,
        serviceType: type,
      });
  },

  async toggleFavoriteNetwork({ address, networkName }) {
    const index = this.networks.findIndex(({ name }) => name === networkName);
    const network = this.networks[index];
    const favoriteIndex = network.favorite.findIndex((el) => el === address);
    const isFavorite = favoriteIndex !== -1;

    if (isFavorite) this.removeFavoriteNetwork({ index: favoriteIndex, networkName });
    else this.setFavoriteNetwork({ address, networkName });

    toggleFavoriteNetwork(networkName);

    return isFavorite;
  },

  setNetworks({ networks }) {
    this.allNetworks = networks;
  },

  setPrices(price) {
    this.assetsPrice = { ...price };
  },

  setSoraFees({ fees }) {
    if (Object.values(fees).every((value) => value === '0')) return;

    this.soraFees = fees;
  },
};
