<template>
  <AboveForm :header="getLocale('header')" :fullScreen="true" @closeHandler="handleClose">
    <div class="management">
      <SearchInput
        :value="filterValue"
        placeholder="common.searchNetwork"
        class="search-input"
        width="100%"
        data-testid="networkSearch"
        @change="changeFilterValue"
      />

      <Tooltip text="common.copied" target=".search-input" placement="bottom" />

      <Tabs :activeTab="activeTab" :tabs="tabs" @update:activeTab="updateActiveTab" />

      <div v-show="!isNetworksExists" class="network__list-no-found" data-testid="networkNoFound">
        {{ $t('header.networkManagement.notFound') }}
      </div>

      <NetworkItem
        v-show="isNetworksExists"
        :network="networkGroup"
        :isNetworkGroup="true"
        :isAvailable="true"
        :isSelected="isGroupSelected"
        @onChangeNetwork="toggleNetworkType"
      />

      <div v-show="isNetworksExists" class="container" :class="networkListClasses">
        <Scroll>
          <ul class="network__list">
            <template> </template>

            <NetworkItem
              v-for="network in filteredOptionsNetworks"
              :network="network"
              :isSelected="isNetworkSelected(network.name)"
              :key="network.name"
              :ref="network.name"
              :isAvailable="isAvailableNetwork(network.name)"
              @onChangeNetwork="enableSingleNetwork(network.name)"
              @onToggleFavorite="toggleFavorite(network.name)"
            />

            <Tooltip
              text="common.unavailableNetworkMessage"
              :maxWidth="300"
              :delay="0"
              target=".unavailable"
              :arrow="true"
              placement="top"
            />
          </ul>
        </Scroll>
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, ref, type PropType, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import NetworkItem from './NetworkItem.vue';
import type { Tab } from '@/interfaces/ui';
import { filterNetworksBySelection, isNetworkGroup } from '@/helpers/networkGroups';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { updateCurrentNetwork } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';
import { IS_POPUP } from '@/consts/globalClient';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { useNotify } from '@/plugins/soramitsuUI';

type Tabs = {
  [ALL_NETWORKS]: Tab;
  [POPULAR_NETWORKS]: Tab;
  [FAVORITE_NETWORKS]: Tab;
};

const tabsConfig: Tabs = {
  [ALL_NETWORKS]: {
    label: 'header.networkManagement.tabs.all',
    name: ALL_NETWORKS,
  },
  [POPULAR_NETWORKS]: {
    label: 'header.networkManagement.tabs.popular',
    name: POPULAR_NETWORKS,
  },
  [FAVORITE_NETWORKS]: {
    label: 'header.networkManagement.tabs.favorites',
    name: FAVORITE_NETWORKS,
  },
};

const props = defineProps({
  type: {
    type: String as PropType<keyof Tabs | string>,
    required: true,
  },
});

const { t } = useI18n();
const notify = useNotify();

const filterValue = ref('');
const activeTab = ref<keyof Tabs>(ALL_NETWORKS);

const accountsStore = useAccountsStore();
const networksStore = useNetworksStore();
const selectedAccount = computed(() => accountsStore.accounts.find(({ active }) => active));

const getLocale = (key: string) => `header.networkManagement.${key}`;

const tabs = tabsConfig;

const isGroupSelected = computed(() => accountsStore.selectedNetwork === activeTab.value);

const networkListClasses = computed(() => (IS_POPUP ? '' : 'container--fullscreen'));

const networkGroup = computed(() => ({
  name: t(`header.networkManagement.${activeTab.value}`).toString(),
  icon: 'all-networks',
}));

const filterByGroupNetworks = computed(() => {
  const grouped = filterNetworksBySelection(networksStore.networks, activeTab.value, {
    favoriteAddress: accountsStore.selectedWallet.address,
  });

  if (activeTab.value === POPULAR_NETWORKS) {
    return [...grouped].sort((a, b) => {
      if (a.rank === undefined || b.rank === undefined) return 0;

      return a.rank > b.rank ? 1 : -1;
    });
  }

  return grouped;
});

const isAvailableNetwork = (network: string) => {
  const selectedNetwork = networksStore.getNetwork(network);

  if (accountsStore.selectedWallet.isMobile) {
    if (!selectedAccount.value?.chains) return false;

    return selectedAccount.value.chains.some((chainId) => selectedNetwork.chainId.includes(chainId));
  }

  if (!accountsStore.selectedWallet.hasEthereum && BaseApi.isEthereumNetwork(network)) return false;

  return true;
};

const sortAvailableNetworks = computed(() =>
  [...filterByGroupNetworks.value].sort((a, b) => {
    const aAvailable = isAvailableNetwork(a.name);
    const bAvailable = isAvailableNetwork(b.name);

    return aAvailable === bAvailable ? 0 : aAvailable ? -1 : 1;
  })
);

const filteredOptionsNetworks = computed(() => {
  const filter = filterValue.value.trim().toLowerCase();

  return sortAvailableNetworks.value.filter(({ name }) => name.toLowerCase().includes(filter));
});

const isNetworksExists = computed(() => filteredOptionsNetworks.value.length !== 0);

const changeFilterValue = (value: string) => {
  filterValue.value = value;
};

const isNetworkSelected = (name: string) => accountsStore.selectedNetwork === name;

const updateActiveTab = (tab: Tab) => {
  activeTab.value = tab.name as keyof Tabs;
};

const toggleNetworkType = () => {
  if (isGroupSelected.value) return;

  const network = tabs[activeTab.value].name;

  accountsStore.setSelectedNetwork(network);

  const title = t(getLocale('groupSelected'), {
    group: t(tabs[activeTab.value].label),
  }).toString();

  notify({ title, message: '', type: 'success' });
};

const enableSingleNetwork = (network: string) => {
  if (isNetworkSelected(network)) return;

  accountsStore.setSelectedNetwork(network);

  const title = t(getLocale('networkSelected'), { network }).toString();

  notify({ title, message: '', type: 'success' });
};

const toggleFavorite = async (network: string) => {
  const isFavorite = await networksStore.toggleFavoriteNetwork({
    networkName: network,
    address: accountsStore.selectedWallet.address,
  });

  const title = t(getLocale(isFavorite ? 'deleteFavorite' : 'addFavorite'), { network }).toString();

  notify({ title, message: '', type: 'success' });
};

onMounted(() => {
  if (isNetworkGroup(accountsStore.selectedNetwork)) {
    activeTab.value = accountsStore.selectedNetwork as keyof Tabs;
  } else if (isNetworkGroup(props.type)) {
    activeTab.value = props.type as keyof Tabs;
  }
});

onBeforeUnmount(() => {
  updateCurrentNetwork(accountsStore.selectedNetwork);
});
</script>

<style lang="scss" scoped>
.management {
  display: flex;
  flex-direction: column;
  height: 100%;

  .search-input {
    padding-bottom: 16px;
  }
}

.button {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 5px 15px;
  height: 30px;
  background: $secondary-background-color;
  border-radius: 30px;
  font-weight: 700;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: $plain-white;
  margin: 5px 14px 0 0;
  border: none;
  cursor: pointer;

  &:hover {
    background: $default-background-color;
  }
}

.container {
  height: 350px;
  overflow-y: hidden;

  &--fullscreen {
    height: calc(100vh - 270px);
  }
}

.network__list {
  display: flex;
  flex-flow: column nowrap;
  padding: 0;
  height: 100%;
}

.network__list-no-found {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 0.875em;
  font-weight: 600;
  color: $gray-2-color;
}
</style>
