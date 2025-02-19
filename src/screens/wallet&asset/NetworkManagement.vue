<template>
  <AboveForm :header="getLocale('header')" :fullScreen="true" @closeHandler="$emit('handlerClose')">
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

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import NetworkItem from './NetworkItem.vue';
import type { Tab } from '@/interfaces/ui';
import { isNetworkGroup } from '@/helpers/common';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { updateCurrentNetwork } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';
import { IS_POPUP } from '@/consts/globalClient';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
type Tabs = {
  [ALL_NETWORKS]: Tab;
  [POPULAR_NETWORKS]: Tab;
  [FAVORITE_NETWORKS]: Tab;
};

@Component({
  components: {
    NetworkItem,
  },
})
export default class NetworkManagement extends Vue {
  readonly tabs: Tabs = {
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

  accountsStore = useAccountsStore();
  networksStore = useNetworksStore();
  filterValue = '';
  activeTab: keyof Tabs = ALL_NETWORKS;
  value = '';

  @Prop(String) type!: keyof Tabs | string;

  get isGroupSelected() {
    return this.accountsStore.selectedNetwork === this.activeTab;
  }

  get networkListClasses() {
    return IS_POPUP ? '' : 'container--fullscreen';
  }

  get networkGroup() {
    return { name: this.$t(`header.networkManagement.${this.activeTab}`), icon: 'all-networks' };
  }

  get filterByGroupNetworks() {
    if (this.activeTab === ALL_NETWORKS) return this.networksStore.networks;

    if (this.activeTab === POPULAR_NETWORKS) {
      return this.networksStore.networks
        .filter(({ rank }) => rank !== undefined)
        .sort((a, b) => {
          if (a.rank === undefined || b.rank === undefined) return 0;

          return a.rank > b.rank ? 1 : -1;
        });
    }

    return this.networksStore.networks.filter(({ favorite }) =>
      favorite.some((address) => address === this.accountsStore.selectedWallet.address)
    );
  }

  get sortAvailableNetworks() {
    return this.filterByGroupNetworks.sort((a, b) => {
      const aAvailable = this.isAvailableNetwork(a.name);
      const bAvailable = this.isAvailableNetwork(b.name);

      return aAvailable === bAvailable ? 0 : aAvailable === true ? -1 : 1;
    });
  }

  get filteredOptionsNetworks() {
    const filter = this.filterValue.trim().toLowerCase();

    return this.sortAvailableNetworks.filter(({ name }) => name.toLowerCase().includes(filter));
  }

  get isNetworksExists() {
    return this.filteredOptionsNetworks.length !== 0;
  }

  get selectedAccount() {
    return this.accountsStore.accounts.find(({ active }) => active);
  }

  async mounted() {
    if (isNetworkGroup(this.accountsStore.selectedNetwork))
      this.activeTab = this.accountsStore.selectedNetwork as keyof Tabs;
  }

  beforeDestroy() {
    updateCurrentNetwork(this.accountsStore.selectedNetwork);
  }

  changeFilterValue(value: string) {
    this.filterValue = value;
  }

  getLocale(key: string): string {
    return `header.networkManagement.${key}`;
  }

  isAvailableNetwork(network: string): boolean {
    const selectedNetwork = this.networksStore.getNetwork(network);

    if (this.accountsStore.selectedWallet.isMobile) {
      if (!this.selectedAccount) return false;

      if (!this.selectedAccount.chains) return false;

      const available = this.selectedAccount.chains.some((el) => selectedNetwork.chainId.includes(el));

      return available;
    }

    if (!this.accountsStore.selectedWallet.hasEthereum && BaseApi.isEthereumNetwork(network)) return false;

    return true;
  }

  isNetworkSelected(name: string) {
    return this.accountsStore.selectedNetwork === name;
  }

  updateActiveTab(tab: Tab) {
    this.activeTab = tab.name as keyof Tabs;
  }

  toggleNetworkType() {
    if (this.isGroupSelected) return;

    const network = this.tabs[this.activeTab].name;

    this.accountsStore.setSelectedNetwork(network);

    const prepNotification = this.$t(this.getLocale('groupSelected'), {
      group: this.$t(this.tabs[this.activeTab].label),
    }).toString();

    this.$notify({ title: prepNotification, message: '', type: 'success' });
  }

  enableSingleNetwork(network: string) {
    const isSelected = this.isNetworkSelected(network);

    if (isSelected) return;

    this.accountsStore.setSelectedNetwork(network);

    const prepNotification = this.$t(this.getLocale('networkSelected'), { network }).toString();

    this.$notify({ title: prepNotification, message: '', type: 'success' });
  }

  async toggleFavorite(network: string) {
    const isFavorite = await this.networksStore.toggleFavoriteNetwork({
      networkName: network,
      address: this.accountsStore.selectedWallet.address,
    });

    const t = this.getLocale(isFavorite ? 'deleteFavorite' : 'addFavorite');
    const prepNotification = this.$t(t, { network });

    this.$notify({
      title: prepNotification as string,
      message: '',
      type: 'success',
    });
  }
}
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
