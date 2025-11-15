import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { NetworkJson } from '@extension-base/types';
import type { BasePriceJson, TokenGroup } from '@extension-base/background/types/types';
import type {
  FetchHistory,
  GetAssetPrice,
  GetActiveNodesByNetwork,
  GetNetwork,
  GetNetworkGenesisHash,
  GetHistory as GetHistoryGetter,
  HistoryProps,
  NetworkFavoriteProps,
  RemoveNetworkFavoriteProps,
  SetNetworksStatusProps,
  SetSoraFee,
  ToggleFavorite,
} from './types';
import type { NormalizedNetworkName } from '@/interfaces/networks';
import type { SubqueryHistory } from '@/interfaces/history';
import {
  WalletEcosystem,
  type SoraFees,
  type FiatJson,
  type AssetId,
  type History as StoredHistory,
} from '@/interfaces';
import { useAccountsStore } from '@/stores/accounts';
import { useStakingStore } from '@/stores/staking';
import { normalizeNetworkName, filterNetworksBySelection } from '@/helpers/networkGroups';
import { isSameString } from '@/helpers';
import BaseApi from '@/util/BaseApi';
import { fetchAssetHistory } from '@/extension/messaging/history';
import { toggleFavoriteNetwork } from '@/extension/messaging';
import { getFiats } from '@/extension/messaging/price';
import { buildHistoryFetchRequest, getHistoryEndpoint } from '@/history/fetchingHistory';

const historyRequestCache = new Map<string, Promise<void>>();

const buildHistoryCacheKey = (networkName: string, assetId: string, address: string): string =>
  `${normalizeNetworkName(networkName)}::${assetId}::${address.toLowerCase()}`;

export const useNetworksStore = defineStore('networks', () => {
  const allNetworks = ref<NetworkJson[]>([]);
  const assetsPrice = ref<BasePriceJson>({
    tokenPriceChange: {},
    tokenPriceMap: {},
  });
  const fiats = ref<FiatJson[]>([]);
  const history = ref<StoredHistory>({});
  const soraFees = ref<SoraFees | null>(null);

  const networks = computed<NetworkJson[]>(() => {
    const accountsStore = useAccountsStore();

    if (accountsStore.selectedWallet.isTon)
      return allNetworks.value.filter(({ ecosystem }) => isSameString(ecosystem, WalletEcosystem.Ton));

    const substrateAndEvmNetworks = allNetworks.value.filter(
      ({ ecosystem }) => !isSameString(ecosystem, WalletEcosystem.Ton)
    );
    const substrateNetworks = substrateAndEvmNetworks.filter(({ ecosystem }) =>
      isSameString(ecosystem, WalletEcosystem.Substrate)
    );

    return accountsStore.selectedWallet.hasEthereum ? substrateAndEvmNetworks : substrateNetworks;
  });

  const activeNetworkForSelectedWallet = computed<NetworkJson[]>(() => {
    const accountsStore = useAccountsStore();
    const selectedWallet = accountsStore.selectedWallet;
    const selectedNetwork = accountsStore.selectedNetwork;
    const activeNetworks = allNetworks.value.filter(({ active }) => active);

    return filterNetworksBySelection(activeNetworks, selectedNetwork, {
      favoriteAddress: selectedWallet.address,
    });
  });

  const favoriteNetworksNames = computed(() =>
    allNetworks.value.filter(({ favorite }) => favorite.length).map(({ name, favorite }) => ({ name, favorite }))
  );

  const getNetwork = computed<GetNetwork>(
    () => (networkNameOrChainId: string) =>
      allNetworks.value.find(
        ({ name, chainId }) => isSameString(name, networkNameOrChainId) || isSameString(chainId, networkNameOrChainId)
      )!
  );

  const getNetworkGenesisHash = computed<GetNetworkGenesisHash>(() => (networkName: string) => {
    const network = allNetworks.value.find(({ name }) => name === networkName)!;

    return `0x${network.chainId}`;
  });

  const getAssetPrice = computed<GetAssetPrice>(() => (priceId: string) => {
    if (!assetsPrice.value.tokenPriceMap[priceId]) return { price: 0, priceChange: 0, isExist: false };

    const price = assetsPrice.value.tokenPriceMap[priceId];
    const priceChange = assetsPrice.value.tokenPriceChange[priceId] / 100;

    return { price, priceChange, isExist: true };
  });

  const getHistory = computed<GetHistoryGetter>(() => (assetId: string, networkName: string, address?: string) => {
    const accountsStore = useAccountsStore();
    const wallet = accountsStore.selectedWallet;
    const formattedAddress = address ? BaseApi.formatAddress({ address, ethereumAddress: address }) : wallet.address;
    const normalizedNetworkName = normalizeNetworkName(networkName);

    return history.value[assetId]?.[formattedAddress]?.[normalizedNetworkName];
  });

  const getActiveNodesByNetwork = computed<GetActiveNodesByNetwork>(() => (networkName: string) => {
    const normalizedTarget = normalizeNetworkName(networkName);
    const { currentProvider, nodes } = allNetworks.value.find(
      (network) => normalizeNetworkName(network.name) === normalizedTarget
    )!;
    const activeNode = nodes.find((node) => node.url === currentProvider);

    return activeNode ?? nodes[0];
  });

  const removeFavoriteNetwork = ({ networkName, index }: RemoveNetworkFavoriteProps) => {
    const target = allNetworks.value.find((network) => isSameString(network.name, networkName));

    if (!target) return;

    target.favorite.splice(index, 1);
  };

  const setFavoriteNetwork = ({ address, networkName }: NetworkFavoriteProps) => {
    const target = allNetworks.value.find((network) => isSameString(network.name, networkName));

    if (!target) return;

    target.favorite.push(address);
  };

  const setHistory = ({ historyItems, networkName, walletAddress }: HistoryProps) => {
    const saveHistory = (id: AssetId, historyPayload: SubqueryHistory) => {
      const { nodes, pageInfo } = historyPayload;
      const { startCursor: startCursorProp, endCursor: endCursorProp } = pageInfo;
      const previousHistoryForAsset = history.value[id] ?? {};
      const previousHistoryForWallet = previousHistoryForAsset[walletAddress] ?? {};
      const previousStartCursor = previousHistoryForWallet[networkName]?.pageInfo.startCursor;
      const nextHistoryForWallet = {
        ...previousHistoryForWallet,
        [networkName]: {
          timestamp: Date.now(),
          nodes,
          pageInfo: {
            startCursor: previousStartCursor ?? startCursorProp,
            endCursor: endCursorProp,
          },
        },
      };

      history.value = {
        ...history.value,
        [id]: {
          ...previousHistoryForAsset,
          [walletAddress]: nextHistoryForWallet,
        },
      };
    };

    historyItems.forEach(({ assetId, history: historyPayload }) => {
      saveHistory(assetId, historyPayload);
    });
  };

  const getFiatsAction = async () => {
    if (fiats.value.length > 0) return;

    fiats.value = await getFiats();
  };

  const fetchHistoryAction = async ({ networkName, assetId, address }: FetchHistory) => {
    if (!networkName) return;

    const accountsStore = useAccountsStore();
    const wallet = address ? { address, ethereumAddress: address } : accountsStore.selectedWallet;
    const network = getNetwork.value(networkName);
    const endpoint = getHistoryEndpoint(network);

    if (!endpoint) return;

    const cacheAssetId = endpoint.type === 'sora' ? '__sora__' : assetId;
    const cacheKey = buildHistoryCacheKey(networkName, cacheAssetId, wallet.address);
    const inFlight = historyRequestCache.get(cacheKey);

    if (inFlight) {
      await inFlight;

      return;
    }

    const requestPromise = (async () => {
      const formattedAddress = BaseApi.formatAddress(wallet, networkName);
      const balances: TokenGroup[] = accountsStore.balances ?? [];

      const requestPayload = buildHistoryFetchRequest({
        network,
        assetId,
        balances,
        endpoint,
        wallet: {
          raw: wallet.address,
          formatted: formattedAddress,
        },
      });

      if (!requestPayload) return;

      const historyResult = await fetchAssetHistory(requestPayload);

      if (!historyResult || historyResult.length === 0) return;

      const normalizedNetworkName = normalizeNetworkName(networkName) as NormalizedNetworkName;

      setHistory({
        networkName: normalizedNetworkName,
        walletAddress: BaseApi.formatAddress(wallet),
        historyItems: historyResult,
      });
    })();

    historyRequestCache.set(cacheKey, requestPromise);

    try {
      await requestPromise;
    } finally {
      if (historyRequestCache.get(cacheKey) === requestPromise) historyRequestCache.delete(cacheKey);
    }
  };

  const toggleFavoriteNetworkAction = async ({ address, networkName }: ToggleFavorite) => {
    const target = allNetworks.value.find(({ name }) => name === networkName);

    if (!target) return false;

    const favoriteIndex = target.favorite.findIndex((value) => value === address);
    const isFavorite = favoriteIndex !== -1;

    if (isFavorite) removeFavoriteNetwork({ networkName, index: favoriteIndex });
    else setFavoriteNetwork({ address, networkName });

    toggleFavoriteNetwork(networkName);

    return isFavorite;
  };

  const setNetworks = ({ networks: nextNetworks }: SetNetworksStatusProps) => {
    allNetworks.value = nextNetworks;

    const stakingStore = useStakingStore();
    stakingStore.syncStakingNetworks(nextNetworks);
  };

  const setPrices = (price: BasePriceJson) => {
    assetsPrice.value = { ...price };
  };

  const setSoraFees = ({ fees }: SetSoraFee) => {
    if (Object.values(fees).every((value) => value === '0')) return;

    soraFees.value = fees;
  };

  return {
    // state
    allNetworks,
    assetsPrice,
    fiats,
    history,
    soraFees,
    // getters
    networks,
    activeNetworkForSelectedWallet,
    favoriteNetworksNames,
    getNetwork,
    getNetworkGenesisHash,
    getAssetPrice,
    getHistory,
    getActiveNodesByNetwork,
    // actions
    getFiats: getFiatsAction,
    fetchHistory: fetchHistoryAction,
    toggleFavoriteNetwork: toggleFavoriteNetworkAction,
    setNetworks,
    setPrices,
    setSoraFees,
    removeFavoriteNetwork,
    setFavoriteNetwork,
    setHistory,
  };
});

export type NetworksStore = ReturnType<typeof useNetworksStore>;
