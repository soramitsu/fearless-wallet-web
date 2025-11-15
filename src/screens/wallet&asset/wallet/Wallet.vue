<template>
  <div class="wallet">
    <header class="wallet-header">
      <WalletBalance
        class="wallet-balance"
        :balance="summaryTransferableBalance"
        :changeWalletBalance="changeWalletBalance"
        :staticWidth="false"
        @click="openFiatsPopup"
      />

      <Loading v-if="showLoadingBalance" :width="28" class="balance-loading" />
    </header>

    <ContentForm :height="contentFormHeight">
      <div class="content">
        <WalletSettings
          :activeTabName="activeTabName"
          :filterValue="filterValue"
          :showAssetsManagementForm="showAssetsManagementForm"
          :tokenGroups="filteredTokenGroups"
          @update:filterValue="updateFilterValue"
          @update:activeTabName="updateActiveTabName"
          @update:showAssetsManagementForm="toggleAssetsManagementForm"
          @toggleCurrenciesVisible="toggleCurrenciesVisible"
        />

        <router-view
          :balances="filteredTokenGroups"
          :showAssetsManagementForm="showAssetsManagementForm"
          :filterValue="filterValue"
          @toggleNetworkManagementVisible="toggleNetworkManagementVisible"
          @toggleAssetsManagementForm="toggleAssetsManagementForm"
        />
      </div>
    </ContentForm>

    <NetworkManagement
      v-if="showNetworkManagement"
      :networks="networksWithWarning"
      @closeForm="toggleNetworkManagementVisible"
      @setNetworkUnavailable="setNetworkUnavailable"
    />

    <NetworkUnavailablePopup
      v-if="showNetworkUnavailablePopup"
      :networks="networksWithWarning"
      :network="networkUnavailable"
      @closePopup="setNetworkUnavailable"
    />

    <GoogleExportPopup v-if="showGoogleExportPopup" @closePopup="closeGoogleExportPopup" />

    <Tooltip text="wallet.walletBalance" target=".wallet-balance" placement="right" />
    <Tooltip text="common.networkManagement" target=".select-network-button" placement="bottom" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onDeactivated, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { getBalanceNetworkName } from '@extension-base/api/evm/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TabWallet } from '@/interfaces';
import WalletSettings from '@/screens/wallet&asset/wallet/WalletSettings.vue';
import { accountController } from '@/controllers/accountController';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import NetworkManagement from '@/screens/wallet&asset/wallet/NetworkManagement.vue';
import NetworkUnavailablePopup from '@/screens/wallet&asset/wallet/NetworkUnavailablePopup.vue';
import GoogleExportPopup from '@/screens/wallet&asset/wallet/GoogleExportPopup.vue';
import { ALL_NETWORKS } from '@/consts/networks';
import { defaultSortingCurrencies, filterBalanceItemsByNetwork } from '@/helpers/currencies';
import { getChangeWalletBalance, getSummaryTransferableWalletBalance } from '@/helpers/common';
import { isNetworkGroup } from '@/helpers/networkGroups';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import BaseApi from '@/util/BaseApi';
import { fetchEvmBalance } from '@/extension/messaging';
import { isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { MENU_HEIGHT } from '@/screens/main/menu.constants';
import { WalletMetadataKey } from '@/screens/wallet&asset/wallet/metadata';
import { useWalletMetadata } from '@/composables/useWalletMetadata';

defineOptions({
  name: 'Wallet',
});

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const route = useRoute();
const router = useRouter();

const emit = defineEmits<{
  openFiatsPopup: [value: boolean];
  closeSelectWalletPopup: [];
}>();

const showNetworkManagement = ref(false);
const showAssetsManagementForm = ref(false);
const networkUnavailable = ref('');
const filterValue = ref('');

const activeTabName = computed(() => route.name as TabWallet | string | undefined);

const contentFormHeight = computed(() => {
  const isTonWallet = accountsStore.selectedWallet.isTon;

  return isTonWallet ? CONTENT_FORM_HEIGHT + MENU_HEIGHT : CONTENT_FORM_HEIGHT;
});

const showNetworkUnavailablePopup = computed(() => networkUnavailable.value !== '');

const disconnectedNetworks = computed(() =>
  networksStore.networks.filter(({ networkStatus }) => networkStatus === NETWORK_STATUS.DISCONNECTED)
);

const networksWithWarning = computed(() =>
  disconnectedNetworks.value.filter(({ name }) => !accountsStore.getShowWarningNetwork(name))
);

const summaryTransferableBalance = computed(() =>
  getSummaryTransferableWalletBalance(
    accountsStore.selectedWallet.address,
    accountsStore.balances,
    networksStore.assetsPrice,
    accountsStore.selectedNetwork,
    networksStore.networks
  )
);

const changeWalletBalance = computed(() => {
  if (accountsStore.balances.length === 0) return { percent: 0, amount: 0 };

  return getChangeWalletBalance(accountsStore.balances, networksStore.assetsPrice, accountsStore.selectedNetwork, {
    networks: networksStore.networks,
    favoriteAddress: accountsStore.selectedWallet.address,
  });
});

const sortedTokenGroups = computed(() => {
  const balances = accountsStore.selectedWallet.hasEthereum
    ? accountsStore.balances
    : accountsStore.balances.filter((el) => !BaseApi.isEthereumNetwork(el.mainNetwork));

  const { address } = accountsStore.selectedWallet;

  if (address === '') return [];

  if (!accountsStore.isCustomSort(address))
    return defaultSortingCurrencies(accountsStore.balances, networksStore.assetsPrice, accountsStore.selectedNetwork);

  const sequence = accountController.getSequenceAssetsByAddress(address);

  return [...balances].sort((currency1, currency2) => {
    const index1 = sequence.indexOf(currency1.groupId);
    const index2 = sequence.indexOf(currency2.groupId);

    return index1 - index2;
  });
});

const walletMetadata = useWalletMetadata(() => ({ tokenGroups: sortedTokenGroups.value }));

provide(WalletMetadataKey, walletMetadata);

const walletNetworkSelection = computed(() => walletMetadata.value.selection);
const assetTagIndex = computed(() => walletMetadata.value.assetTags);

const showLoadingBalance = computed(() => {
  if (!isNetworkGroup(accountsStore.selectedNetwork)) {
    const networkStatus = networksStore.networks.find(
      ({ name }) => name.toLowerCase() === accountsStore.selectedNetwork.toLowerCase()
    )?.networkStatus;

    return networkStatus === NETWORK_STATUS.CONNECTING;
  }

  const isPendingExists = networksStore.networks.some(
    ({ networkStatus }) => networkStatus === NETWORK_STATUS.CONNECTING
  );

  return !navigator.onLine || isPendingExists;
});

const filteredTokenGroups = computed(() => {
  const selection = walletNetworkSelection.value;
  const isAllNetworks = isSameString(accountsStore.selectedNetwork, ALL_NETWORKS);

  const tokenGroups = accountsStore.selectedWallet.isMobile
    ? sortedTokenGroups.value.filter(({ balances }) => {
        return balances.some((balance) => {
          const account = accountsStore.accounts.find(
            ({ address }) => address === accountsStore.selectedWallet.address
          );

          const network = networksStore.getNetwork(getBalanceNetworkName(balance));

          return account?.chains?.some((el) => network.chainId.includes(el));
        });
      })
    : sortedTokenGroups.value;

  const filteredByNetwork = isAllNetworks
    ? tokenGroups
    : tokenGroups.filter(({ balances }) => balances.some((balance) => filterBalanceItemsByNetwork(balance, selection)));

  if (showAssetsManagementForm.value) return filteredByNetwork;

  const filter = filterValue.value.trim().toLowerCase();

  if (!filter) return filteredByNetwork;

  const tagsIndex = assetTagIndex.value;

  return filteredByNetwork.filter((token) => {
    if (token.symbol.toLowerCase().includes(filter)) return true;

    return tagsIndex.matches(token, filter);
  });
});

const showGoogleExportPopup = computed(
  () => typeof route.params.access_token !== 'undefined' && route.params.access_token !== 'null'
);

watch(
  networksWithWarning,
  (value) => {
    if (value.length === 0) showNetworkManagement.value = false;
  },
  { immediate: true }
);

watch(
  () => accountsStore.selectedWallet.ethereumAddress,
  (address) => {
    fetchEvmBalance(undefined, address);
  },
  { immediate: true }
);

onActivated(() => {
  fetchEvmBalance(undefined, accountsStore.selectedWallet.ethereumAddress);
});

onDeactivated(() => {
  showAssetsManagementForm.value = false;
  showNetworkManagement.value = false;
  filterValue.value = '';

  setNetworkUnavailable();
});

const openFiatsPopup = () => {
  emit('openFiatsPopup', true);
};

const closeGoogleExportPopup = () => {
  router.replace('/').catch((e) => e);

  emit('closeSelectWalletPopup');
};

const setNetworkUnavailable = (network = '') => {
  networkUnavailable.value = network;
};

const toggleNetworkManagementVisible = () => {
  showNetworkManagement.value = !showNetworkManagement.value;
};

const toggleAssetsManagementForm = (value = true) => {
  showAssetsManagementForm.value = value;
};

const toggleCurrenciesVisible = (allCurrenciesHidden: boolean) => {
  if (allCurrenciesHidden) {
    accountsStore.balances.forEach(({ groupId }) => accountsStore.setHiddenAssets({ groupId, value: true }));

    return;
  }

  const nonZeroBalanceCb = ({ transferable }: BalanceItem) => transferable && +transferable > 0;

  accountsStore.balances.forEach(({ groupId, balances }) => {
    const index = balances.findIndex(nonZeroBalanceCb);
    const isZeroBalance = index === -1;

    if (isZeroBalance) accountsStore.setHiddenAssets({ groupId, value: false });
  });

  const assetsVisibleWithBalance = accountsStore.balances.filter(({ balances, groupId }) => {
    const haveAssets = balances.findIndex(nonZeroBalanceCb) !== -1;
    const isVisibleAsset = !accountsStore.hiddenAssets.includes(groupId);

    return isVisibleAsset && haveAssets;
  });

  const assetsInvisibleWithBalance = accountsStore.balances.filter(({ balances, groupId }) => {
    const haveAssets = balances.findIndex(nonZeroBalanceCb) !== -1;
    const isHiddenAsset = accountsStore.hiddenAssets.includes(groupId);

    return isHiddenAsset && haveAssets;
  });

  const assetsInvisibleWithoutBalance = accountsStore.balances.filter(({ balances, groupId }) => {
    const notHaveAssets = balances.findIndex(nonZeroBalanceCb) === -1;
    const isHiddenAsset = accountsStore.hiddenAssets.includes(groupId);

    return isHiddenAsset && notHaveAssets;
  });

  accountsStore.setBalance({
    details: [...assetsVisibleWithBalance, ...assetsInvisibleWithBalance, ...assetsInvisibleWithoutBalance],
    reset: false,
    saveSequence: true,
  });
};

const updateFilterValue = (value: string) => {
  filterValue.value = value;
};

const updateActiveTabName = (name: TabWallet) => {
  if (activeTabName.value === name) return;

  router.push({ name });
};
</script>

<style lang="scss" scoped>
.wallet {
  display: flex;
  flex-direction: column;

  .content {
    padding: $default-padding 0 $default-padding $default-padding;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .wallet-header {
    min-height: 46px;
    display: flex;
    margin-bottom: 10px;
  }

  .balance-loading {
    margin-left: 10px;
  }

  .wallet-balance {
    font-size: 1.375em;
    line-height: 28px;
  }

  .balance-shimmers {
    display: flex;
    flex-direction: column;

    .balance-shimmer {
      margin-bottom: 5px;
    }
  }
}
</style>
