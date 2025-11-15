import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { AccountJson, BalanceJson, TokenGroup } from '@extension-base/background/types/types';
import type {
  AutoSelectNode,
  HiddenAssets,
  SelectedNetworks,
  SelectedWallet,
  SetAccountsProps,
  SetAutoSelectNode,
  SetHiddenAsset,
} from './types';
import type { AvailableNftState, ChainNftState, NftCollection } from '@extension-base/services/nft-service/types';
import type { NetworkJson } from '@extension-base/types';
import { ALL_NETWORKS } from '@/consts/networks';
import { WalletEcosystem, type FiatJson, type NetworkFilter, type NetworkName } from '@/interfaces';
import { useNetworksStore } from '@/stores/networks';
import { accountController } from '@/controllers';

export const useAccountsStore = defineStore('accounts', () => {
  const selectedWallet = ref<SelectedWallet>({
    address: '',
    ethereumAddress: '',
    name: '',
    walletEcosystem: undefined,
    isMobile: false,
    isMasterAccount: false,
    isMasterPassword: false,
    haveEntropy: false,
    isSubstrate: false,
    isTon: false,
    hasEthereum: false,
  });
  const selectedFiat = ref<string>('usd');
  const selectedNetworks = ref<SelectedNetworks>({});
  const accounts = ref<AccountJson[]>([]);
  const balances = ref<TokenGroup[]>([]);
  const nfts = ref<ChainNftState>({});
  const availableNfts = ref<AvailableNftState>({});
  const hiddenAssetsForAllAccounts = ref<HiddenAssets>(accountController.getHiddenAssets());
  const autoSelectNode = ref<AutoSelectNode>(accountController.getAutoSelectNodesValue());
  const isCustomSorted = ref<Record<string, boolean>>(accountController.getCustomSort());
  const hiddenWarningNetworks = ref<NetworkName[]>(accountController.getHiddenWarningNetworks());
  const qr = ref<string | null>(null);
  const showPolkaswapAlert = ref<boolean>(!accountController.getAgreeSwapDisclaimer());
  const isBalanceLoading = ref<boolean>(false);

  const nftsByActiveNetworks = computed<NftCollection[]>(() => {
    const networksStore = useNetworksStore();
    const activeNetworks: NetworkJson[] = networksStore.activeNetworkForSelectedWallet;
    const result: NftCollection[] = [];

    activeNetworks.forEach(({ chainId }) => {
      const nftByChain = nfts.value[chainId];

      if (nftByChain) result.push(...Object.values(nftByChain));
    });

    return result;
  });

  const hiddenAssets = computed(() => {
    const address = selectedWallet.value.address;

    return hiddenAssetsForAllAccounts.value[address] ?? [];
  });

  const selectedNetwork = computed<NetworkFilter>(() => {
    const address = selectedWallet.value.address;

    return selectedNetworks.value[address] ?? ALL_NETWORKS;
  });

  const fiatSymbol = computed<string>(() => {
    const networksStore = useNetworksStore();
    const fiats: FiatJson[] = networksStore.fiats;
    const fiat = fiats.find(({ id }) => id === selectedFiat.value);

    return fiat?.symbol ?? '';
  });

  const getFiatId = computed<string>(() => {
    const networksStore = useNetworksStore();
    const fiats: FiatJson[] = networksStore.fiats;
    const fiat = fiats.find(({ id }) => id === selectedFiat.value);

    return fiat?.id ?? '';
  });

  const getAutoSelectNodesValueByNetwork = computed(
    () => (networkName: string) => autoSelectNode.value[networkName] ?? true
  );

  const getShowWarningNetwork = computed(
    () => (networkName: string) => hiddenWarningNetworks.value.includes(networkName)
  );

  const isCustomSortForAddress = computed(() => (address: string) => isCustomSorted.value[address] ?? false);

  const allAcountsEcosystem = computed<AccountJson[]>(() => {
    const { isSubstrate, isTon } = selectedWallet.value;

    return accounts.value.filter(
      ({ walletEcosystem }) =>
        !(
          (walletEcosystem === WalletEcosystem.Ton && isSubstrate) ||
          (walletEcosystem === WalletEcosystem.Substrate && isTon)
        )
    );
  });

  const acountsEcosystem = computed<AccountJson[]>(() => allAcountsEcosystem.value.filter(({ active }) => !active));

  const setSelectedWallet = (account?: AccountJson) => {
    if (account?.address !== selectedWallet.value.address) setIsBalanceLoading(true);

    selectedWallet.value = {
      address: account?.address ?? '',
      ethereumAddress: account?.ethereumAddress ?? '',
      walletEcosystem: account?.walletEcosystem,
      name: account?.name ?? '',
      isMobile: account?.isMobile ?? false,
      isMasterAccount: account?.isMasterAccount ?? false,
      isMasterPassword: account?.isMasterPassword ?? false,
      haveEntropy: account?.haveEntropy ?? false,
      isSubstrate: account?.walletEcosystem === WalletEcosystem.Substrate,
      isTon: account?.walletEcosystem === WalletEcosystem.Ton,
      hasEthereum: !!account?.ethereumAddress,
    };
  };

  const setAvailableNfts = (value: AvailableNftState) => {
    availableNfts.value = value;
  };

  const setBalance = ({ details, saveSequence = false }: BalanceJson) => {
    if (saveSequence) {
      const address = selectedWallet.value.address;
      const sequence = details.map(({ groupId }) => groupId);

      accountController.setSequenceAssets(sequence, address);
      accountController.setCustomSort(address);

      isCustomSorted.value = {
        ...isCustomSorted.value,
        [address]: true,
      };
    }

    balances.value = details;
  };

  const hideNetworkWarning = (network: string) => {
    accountController.setHiddenWarningNetwork(network);

    hiddenWarningNetworks.value = [...hiddenWarningNetworks.value, network];
  };

  const setNfts = (value: ChainNftState) => {
    nfts.value = value;
  };

  const setIsBalanceLoading = (value: boolean) => {
    isBalanceLoading.value = value;
  };

  const setHiddenAssets = ({ groupId, value }: SetHiddenAsset) => {
    const address = selectedWallet.value.address;
    const currentHiddenAssets = hiddenAssetsForAllAccounts.value[address] ?? [];

    if (value) {
      const index = currentHiddenAssets.findIndex((id) => id === groupId);

      if (index !== -1) {
        const nextHiddenAssets = [...currentHiddenAssets];

        nextHiddenAssets.splice(index, 1);

        hiddenAssetsForAllAccounts.value = {
          ...hiddenAssetsForAllAccounts.value,
          [address]: nextHiddenAssets,
        };
      }
    } else {
      hiddenAssetsForAllAccounts.value = {
        ...hiddenAssetsForAllAccounts.value,
        [address]: Array.from(new Set([...currentHiddenAssets, groupId])),
      };
    }

    accountController.setHiddenAssets(hiddenAssetsForAllAccounts.value);
  };

  const setSelectedFiat = (fiatName: string) => {
    selectedFiat.value = fiatName;
  };

  const setAccounts = ({ accounts: nextAccounts }: SetAccountsProps) => {
    accounts.value = nextAccounts;
  };

  const setSelectedNetwork = (network: NetworkFilter) => {
    const address = selectedWallet.value.address;

    selectedNetworks.value = { ...selectedNetworks.value, [address]: network };
  };

  const setAutoSelectNode = ({ network, value }: SetAutoSelectNode) => {
    accountController.setAutoSelectNodes(value, network);

    autoSelectNode.value = { ...autoSelectNode.value, [network]: value };
  };

  const hidePolkaswapAlert = () => {
    setTimeout(() => {
      showPolkaswapAlert.value = false;

      accountController.setAgreeSwapDisclaimer();
    }, 100);
  };

  return {
    // state
    selectedWallet,
    selectedFiat,
    selectedNetworks,
    accounts,
    balances,
    nfts,
    availableNfts,
    hiddenAssetsForAllAccounts,
    autoSelectNode,
    isCustomSorted,
    hiddenWarningNetworks,
    qr,
    showPolkaswapAlert,
    isBalanceLoading,
    // getters
    nftsByActiveNetworks,
    hiddenAssets,
    selectedNetwork,
    fiatSymbol,
    getFiatId,
    getAutoSelectNodesValueByNetwork,
    getShowWarningNetwork,
    isCustomSort: isCustomSortForAddress,
    allAcountsEcosystem,
    acountsEcosystem,
    // actions
    setSelectedWallet,
    setAvailableNfts,
    setBalance,
    hideNetworkWarning,
    setNfts,
    setIsBalanceLoading,
    setHiddenAssets,
    setSelectedFiat,
    setAccounts,
    setSelectedNetwork,
    setAutoSelectNode,
    hidePolkaswapAlert,
  };
});

export type AccountStore = ReturnType<typeof useAccountsStore>;
