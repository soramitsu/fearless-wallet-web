import { useAccountsStore } from '../accounts';
import { type NetworksStore } from '.';
import type {
  FetchTonHistory,
  HistoryProps,
  NetworkFavoriteProps,
  RemoveNetworkFavoriteProps,
  SetNetworksStatusProps,
  SetSoraFee,
} from './types';
import type { FetchHistory, ToggleFavorite } from '@/stores';
import type { BasePriceJson, TokenGroup } from '@extension-base/background/types/types';
import type { History } from '@/stores/networks/types';
import { WalletEcosystem, type AssetId, type SoraHistoryElement, type TonEventTokens } from '@/interfaces';
import { isNativeEVMNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';
import BaseApi from '@/util/BaseApi';
import { fetchHistory } from '@/history/fetchingHistory';
import { getUtilityAsset } from '@/helpers/currencies';
import { toggleFavoriteNetwork, getHistory } from '@/extension/messaging';
import { isSameString, isSora, isTonNetwork } from '@/helpers';
import { getFormattedHistory } from '@/helpers/history';
import { SORA_VAL_ASSET_ID, SORA_XOR_ASSET_ID } from '@/consts/sora';
import { getFiats } from '@/extension/messaging/price';
import { UNIVERSAL_WALLET_INDEXERS, UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';

type Actions = {
  getFiats(this: NetworksStore): Promise<void>;
  fetchHistory(this: NetworksStore, props: FetchHistory): Promise<void>;
  fetchTonNetwork(this: NetworksStore, props: FetchTonHistory): Promise<void>;
  toggleFavoriteNetwork(this: NetworksStore, props: ToggleFavorite): Promise<boolean>;
  setNetworks(this: NetworksStore, props: SetNetworksStatusProps): void;
  setPrices(this: NetworksStore, props: BasePriceJson): void;
  setSoraFees(this: NetworksStore, props: SetSoraFee): void;
  removeFavoriteNetwork(this: NetworksStore, props: RemoveNetworkFavoriteProps): void;
  setFavoriteNetwork(this: NetworksStore, props: NetworkFavoriteProps): void;
  setHistory(this: NetworksStore, props: HistoryProps): void;
};

function getBitcoinHistoryUrl(networkName: string, chainId?: string): string {
  const descriptor = `${networkName} ${chainId ?? ''}`.toLowerCase();

  return descriptor.includes('testnet')
    ? UNIVERSAL_WALLET_INDEXERS.bitcoin.testnet
    : UNIVERSAL_WALLET_INDEXERS.bitcoin.mainnet;
}

function getIrohaHistoryUrl(networkName: string, chainId?: string): string {
  const descriptor = `${networkName} ${chainId ?? ''}`.toLowerCase();

  if (descriptor.includes('nexus')) return UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.toriiBaseUrl ?? '';

  return UNIVERSAL_WALLET_IROHA_NETWORKS.taira.toriiBaseUrl;
}

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
        ...(this.history[assetId] ?? {}),
        [walletAddress]: {
          ...(this.history[assetId]?.[walletAddress] ?? {}),
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

  async getFiats() {
    if (this.fiats.length === 0) {
      const fiats = await getFiats();

      this.fiats = fiats;
    }
  },

  async fetchTonNetwork({ address, networkName }) {
    const history = await getHistory(address, networkName);

    Object.entries(history as TonEventTokens).forEach(([key, value]) =>
      this.setHistory({
        networkName: networkName.toLowerCase(),
        walletAddress: address,
        history: value,
        assetId: key,
        serviceType: 'ton',
      })
    );
  },

  async fetchHistory({ networkName, assetId, address }) {
    if (!networkName) return;

    const accountsStore = useAccountsStore();
    const wallet = address
      ? {
          address,
          bitcoinAddress: address,
          bitcoinTestnetAddress: address,
          ethereumAddress: address,
          irohaAddress: address,
          solanaAddress: address,
        }
      : accountsStore.selectedWallet;

    if (isTonNetwork(networkName)) return this.fetchTonNetwork({ address: wallet.address, networkName });

    const network = this.getNetwork(networkName);
    const { externalApi } = network;
    const isSolanaNetwork = isSameString(network.ecosystem, WalletEcosystem.Solana);
    const isBitcoinNetwork = isSameString(network.ecosystem, WalletEcosystem.Bitcoin);
    const isIrohaNetwork = isSameString(network.ecosystem, WalletEcosystem.Iroha);
    const isUniversalIndexerNetwork = isSolanaNetwork || isBitcoinNetwork || isIrohaNetwork;

    if (!externalApi?.history && !isUniversalIndexerNetwork) return;

    const formattedAddress = isSolanaNetwork
      ? (address ?? wallet.solanaAddress)
      : isBitcoinNetwork
        ? (address ?? BaseApi.formatAddress(wallet, networkName))
        : isIrohaNetwork
          ? (address ?? wallet.irohaAddress)
        : BaseApi.formatAddress(wallet, networkName);

    if (!formattedAddress) return;

    const { type, url: historyUrl } = externalApi?.history ?? {
      type: isBitcoinNetwork ? ('bitcoin' as const) : isIrohaNetwork ? ('iroha' as const) : ('solana' as const),
      url: isBitcoinNetwork
        ? getBitcoinHistoryUrl(network.name, network.chainId)
        : isIrohaNetwork
          ? getIrohaHistoryUrl(network.name, network.chainId)
          : UNIVERSAL_WALLET_INDEXERS.solana,
    };
    const url = isSora(networkName) ? externalApi.staking!.url : historyUrl; // TODO remove

    const isNativeEvm = isNativeEVMNetwork(networkName);
    const balances = (accountsStore.balances ?? []) as unknown as TokenGroup[];

    const asset = isUniversalIndexerNetwork
      ? balances.find(
          ({ balances, groupId }) =>
            groupId === assetId || balances.some(({ id, name }) => id === assetId && isSameString(name, networkName))
        )
      : isNativeEvm
        ? balances.find(({ balances }) => balances.some((asset) => asset.id === assetId))
        : getUtilityAsset(balances, networkName);

    if (!asset) return;

    const utilityId = isUniversalIndexerNetwork
      ? asset.balances.find(({ name, isUtility }) => isSameString(name, networkName) && isUtility)?.id
      : isNativeEvm
        ? asset.balances.find(({ name, isUtility }) => isSameString(name, networkName) && isUtility)?.id
        : asset?.groupId;

    const isUtility = isNativeEvm ? utilityId !== undefined : assetId === utilityId;

    // сейчас эндпоинт истории парсит только историю утилити токена
    // TODO: когда появится история других токенов отрефаткорить данную логику
    if (!isSora(networkName))
      if (!isUtility && type !== 'etherscan' && type !== 'solana' && type !== 'bitcoin' && type !== 'iroha') return;

    const searchedAsset = asset.balances.find(({ name }) => isSameString(name, networkName));

    if (!searchedAsset) return;

    const history = await fetchHistory(url, formattedAddress, type, networkName, searchedAsset.id, isUtility);

    if (history) {
      this.setHistory({
        networkName: networkName.toLowerCase(),
        walletAddress: BaseApi.formatAddress(wallet),
        history: history as History,
        assetId,
        serviceType: type,
      });
    }
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
