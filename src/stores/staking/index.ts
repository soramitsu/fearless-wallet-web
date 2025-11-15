import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { NetworkJson } from '@extension-base/types';
import type { FWValidatorInfoFull, StakingParams } from '@extension-base/services/staking-service/types';
import {
  type GetStakingHistory,
  type GetStakingNetwork,
  type GetStakingParamsProps,
  type GetStakingNetworkProps,
  type NetworkParams,
  type SetAllStakingItems,
  type SetMyStakingInfo,
  type GenericStakingHistory,
  type SoraStakingHistory,
  type EquilibriumStakingHistory,
  type StakingInsights,
  type ApyHistoryPoint,
  type ValidatorStats,
} from '@/stores/staking/types';
import { getStakingParams as fetchStakingParams, getMyStakingInfo as fetchMyStakingInfo } from '@/extension/messaging';
import { SEC1 } from '@/consts/time';
import { isSameString, isSora } from '@/helpers';
import { getDefaultStakingParams } from '@/helpers/staking';
import { SORA_ICON, SORA_NETWORK_NAME, SORA_UTILITY_ASSET, SORA_XOR_ASSET_ID, SORA_VAL_ASSET_ID } from '@/consts/sora';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';
import { createNormalizedNetworkNameSet, normalizeNetworkName } from '@/helpers/networkGroups';
import {
  isSoraHistoryElement,
  type SoraHistoryElement,
  type SubqueryHistory,
  type HistoryElement,
  type HistoryServiceType,
} from '@/interfaces';

type StakingNetworkState = NetworkParams;
type ApyHistoryMap = Record<string, ApyHistoryPoint[]>;

const APY_HISTORY_STORAGE_KEY = 'staking:apyHistory';
const APY_HISTORY_LIMIT = 14;
const MIN_SAMPLE_INTERVAL = SEC1 * 60; // one minute between samples per network

const createDefaultInsights = (): StakingInsights => ({
  apyTrend: [],
  dayChange: 0,
  validatorStats: {
    active: 0,
    inactive: 0,
    waiting: 0,
    oversubscribed: 0,
  },
});

const sanitizeHistory = (entries: unknown): ApyHistoryPoint[] => {
  if (!Array.isArray(entries)) return [];

  return entries
    .filter(
      (entry): entry is ApyHistoryPoint =>
        !!entry &&
        typeof (entry as ApyHistoryPoint).timestamp === 'number' &&
        typeof (entry as ApyHistoryPoint).value === 'number'
    )
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-APY_HISTORY_LIMIT);
};

const readStoredApyHistory = (): ApyHistoryMap => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(APY_HISTORY_STORAGE_KEY);

    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return Object.fromEntries(Object.entries(parsed).map(([network, entries]) => [network, sanitizeHistory(entries)]));
  } catch {
    return {};
  }
};

const persistApyHistory = (history: ApyHistoryMap) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;

  try {
    window.localStorage.setItem(APY_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* noop */
  }
};

const buildValidatorStats = (validators: FWValidatorInfoFull[] = []): ValidatorStats => ({
  active: validators.filter(({ isActive }) => isActive).length,
  inactive: validators.filter(({ isInactive }) => isInactive).length,
  waiting: validators.filter(({ isWaiting }) => isWaiting).length,
  oversubscribed: validators.filter(({ isOversubscribed }) => isOversubscribed).length,
});

const roundDelta = (value: number) => Math.round(value * 100) / 100;

const createHistoryWithSample = (
  historyMap: ApyHistoryMap,
  network: string,
  apy: number
): { map: ApyHistoryMap; history: ApyHistoryPoint[] } => {
  if (!network) return { map: historyMap, history: historyMap[network] ?? [] };

  const normalizedNetwork = network.trim();
  const history = historyMap[normalizedNetwork] ?? [];
  const now = Date.now();
  const last = history[history.length - 1];
  const sanitizedValue = Number.isFinite(apy) ? Number(apy) : 0;

  if (last && now - last.timestamp < MIN_SAMPLE_INTERVAL && Math.abs(last.value - sanitizedValue) < 0.01) {
    return { map: historyMap, history };
  }

  const nextHistory = [...history, { timestamp: now, value: sanitizedValue }].slice(-APY_HISTORY_LIMIT);

  return {
    map: { ...historyMap, [normalizedNetwork]: nextHistory },
    history: nextHistory,
  };
};

const calculateDayChange = (history: ApyHistoryPoint[]): number => {
  if (history.length < 2) return 0;

  const latest = history[history.length - 1];
  const previous = history[history.length - 2];

  return roundDelta(latest.value - previous.value);
};

const createDefaultNetworkParams = (stakingNetwork: Partial<NetworkParams>): StakingNetworkState => {
  const network = stakingNetwork.network ?? '';

  const defaults = getDefaultStakingParams({
    network,
    asset: stakingNetwork.asset ?? '',
    assetId: stakingNetwork.assetId ?? '',
    icon: stakingNetwork.icon ?? '',
    color: stakingNetwork.color ?? '',
    priceId: stakingNetwork.priceId ?? '',
    transferableAmount: stakingNetwork.transferableAmount ?? '0',
  });

  return {
    ...defaults,
    ...stakingNetwork,
    transferableAmount: stakingNetwork.transferableAmount ?? defaults.transferableAmount,
    insights: stakingNetwork.insights ?? createDefaultInsights(),
    loading: true,
  };
};

const STAKING_ITEMS: Partial<NetworkParams>[] = [
  {
    network: SORA_NETWORK_NAME,
    asset: SORA_UTILITY_ASSET,
    assetId: SORA_XOR_ASSET_ID,
    icon: SORA_ICON,
    priceId: SORA_UTILITY_ASSET,
    type: 'regular',
  },
];

export const useStakingStore = defineStore('staking', () => {
  const allStakingNetworks = ref<StakingNetworkState[]>(
    STAKING_ITEMS.map((params) => createDefaultNetworkParams(params))
  );
  const apyHistoryMap = ref<ApyHistoryMap>(readStoredApyHistory());

  const recordApySample = (network: string, apy: number): ApyHistoryPoint[] => {
    const { map, history } = createHistoryWithSample(apyHistoryMap.value, network, apy);

    if (map !== apyHistoryMap.value) {
      apyHistoryMap.value = map;
    }

    return history;
  };

  const buildInsights = (params: StakingParams): StakingInsights => {
    const apyTrend = recordApySample(params.network, params.apy);

    return {
      apyTrend,
      dayChange: calculateDayChange(apyTrend),
      validatorStats: buildValidatorStats(params.validators),
    };
  };

  watch(
    apyHistoryMap,
    (value: ApyHistoryMap) => {
      persistApyHistory(value);
    },
    { deep: true }
  );

  const allStakingItems = computed<NetworkParams[]>(() => {
    const accountsStore = useAccountsStore();
    const networksStore = useNetworksStore();

    const selectedWallet = accountsStore.selectedWallet;
    const selectedNetwork = accountsStore.selectedNetwork;
    const networks = networksStore.networks;

    const allowedNetworkNames = createNormalizedNetworkNameSet(networks, selectedNetwork, {
      favoriteAddress: selectedWallet.address,
    });

    return allStakingNetworks.value
      .filter(({ network }) => {
        if (!network) return false;

        return allowedNetworkNames.has(normalizeNetworkName(network));
      })
      .map((params) => ({ ...params }));
  });

  const stakingItems = computed<NetworkParams[]>(() =>
    allStakingItems.value.filter(({ totalStake }) => totalStake === '0')
  );

  const myStakingItems = computed<NetworkParams[]>(() =>
    allStakingItems.value.filter(({ totalStake }) => totalStake !== '0')
  );

  const getStakingNetwork = computed<GetStakingNetwork>(() => {
    return (networkName: string) => {
      return allStakingItems.value.find(({ network }) => isSameString(network, networkName))!;
    };
  });

  const getStakingHistory = computed<GetStakingHistory>(() => {
    return (networkName: string, assetId: string, stashAddress?: string, payeeAddress?: string) => {
      const networksStore = useNetworksStore();

      const history: SubqueryHistory = networksStore.getHistory(assetId, networkName, stashAddress);
      const networkJson = networksStore.getNetwork(networkName);
      const historyType = networkJson.externalApi?.history?.type as HistoryServiceType | undefined;

      if (isSora(networkName)) {
        const stakingXor = (history?.nodes ?? [])
          .filter(isSoraHistoryElement)
          .filter(({ module }) => module === 'staking');

        const historyVal: SubqueryHistory = networksStore.getHistory(SORA_VAL_ASSET_ID, networkName, payeeAddress);
        const stakingVal = (historyVal?.nodes ?? [])
          .filter(isSoraHistoryElement)
          .filter(({ module }) => module === 'staking');

        const entries: SoraHistoryElement[] = [...stakingXor, ...stakingVal].sort(
          ({ timestamp: timestamp1 }, { timestamp: timestamp2 }) => +timestamp2 - +timestamp1
        );

        const soraHistory: SoraStakingHistory = { kind: 'sora', entries };

        return soraHistory;
      }

      const historyEntries: HistoryElement[] = Array.isArray(history)
        ? (history as unknown as HistoryElement[])
        : (history?.nodes ?? []).filter((node): node is HistoryElement => !!node);

      const typeLabel = historyType?.toLowerCase() ?? '';

      if (typeLabel.includes('equilibrium')) {
        const equilibriumHistory: EquilibriumStakingHistory = {
          kind: 'equilibrium',
          serviceType: historyType,
          entries: historyEntries,
        };

        return equilibriumHistory;
      }

      const genericHistory: GenericStakingHistory = {
        kind: 'generic',
        serviceType: historyType,
        entries: historyEntries,
      };

      return genericHistory;
    };
  });

  const updateMyStakingInfo = ({ network, stakingInfo }: SetMyStakingInfo) => {
    const index = allStakingNetworks.value.findIndex(({ network: existingNetwork }) =>
      isSameString(existingNetwork, network)
    );

    if (index === -1) return;

    const next = [...allStakingNetworks.value];

    next.splice(index, 1, {
      ...next[index],
      ...stakingInfo,
    });

    allStakingNetworks.value = next;
  };

  const updateStakingParams = (stakingParams: SetAllStakingItems) => {
    const next = allStakingNetworks.value.map((networkParams, index) => {
      const params = stakingParams[index] as StakingParams | undefined;

      if (!params) return networkParams;

      return {
        ...networkParams,
        ...params,
        insights: buildInsights(params),
        loading: false,
      };
    });

    allStakingNetworks.value = next;
  };

  const clearStakingParams = () => {
    allStakingNetworks.value = allStakingNetworks.value.map((item) => ({
      ...item,
      loading: true,
    }));
  };

  const getStakingParamsAction = async (props: GetStakingParamsProps = { delay: 0 }) => {
    clearStakingParams();

    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        const networks = allStakingNetworks.value.map(({ network }) => network);
        const stakingParams = await fetchStakingParams({ networks });

        updateStakingParams(stakingParams);

        resolve();
      }, props.delay);
    });
  };

  const getMyStakingInfoAction = ({ network }: GetStakingNetworkProps) => {
    setTimeout(async () => {
      const stakingInfo = await fetchMyStakingInfo({ network });

      updateMyStakingInfo({ network, stakingInfo });
    }, SEC1 * 10);
  };

  const storeApi = {
    // state
    allStakingNetworks,
    // getters
    allStakingItems,
    stakingItems,
    myStakingItems,
    getStakingNetwork,
    getStakingHistory,
    // actions
    getStakingParams: getStakingParamsAction,
    getMyStakingInfo: getMyStakingInfoAction,
    updateMyStakingInfo,
    updateStakingParams,
    clearStakingParams,
    getApyHistory(networkName: string) {
      return apyHistoryMap.value[networkName] ?? [];
    },
    syncStakingNetworks(networks: NetworkJson[]) {
      const stakingNetworks = networks.filter((network) => {
        const stakingApi = network.externalApi?.staking;

        if (!stakingApi?.type) return false;

        return stakingApi.type.startsWith('staking');
      });

      if (stakingNetworks.length === 0) return;

      const previousNames = allStakingNetworks.value.map(({ network }) => network);
      const previousNameSet = new Set(previousNames);

      const nextStakingItems = stakingNetworks
        .map<StakingNetworkState | null>((network) => {
          const stakingAsset =
            network.assets.find((asset) => asset.staking) ?? network.assets.find((asset) => asset.isUtility);

          if (!stakingAsset) return null;

          const assetSymbol = stakingAsset.symbol ?? stakingAsset.name ?? network.name;
          const assetId = stakingAsset.id ?? stakingAsset.currencyId ?? stakingAsset.symbol ?? network.name;
          const icon = stakingAsset.icon ?? network.icon;
          const color = stakingAsset.color ?? '';
          const priceId = stakingAsset.priceId ?? assetSymbol.toLowerCase();
          const existing = allStakingNetworks.value.find(({ network: name }) => isSameString(name, network.name));

          if (existing) {
            return {
              ...existing,
              network: network.name,
              asset: assetSymbol,
              assetId,
              icon,
              color,
              priceId,
              type: existing.type ?? 'regular',
            };
          }

          return createDefaultNetworkParams({
            network: network.name,
            asset: assetSymbol,
            assetId,
            icon,
            color,
            priceId,
            type: 'regular',
          });
        })
        .filter((item): item is StakingNetworkState => item !== null);

      if (nextStakingItems.length === 0) return;

      allStakingNetworks.value = nextStakingItems;

      const nextNames = nextStakingItems.map(({ network }) => network);
      const hasNewNetwork =
        nextNames.length !== previousNames.length || nextNames.some((network) => !previousNameSet.has(network));

      if (hasNewNetwork) void this.getStakingParams();
    },
  };

  return storeApi;
});

export type StakingStore = ReturnType<typeof useStakingStore>;
