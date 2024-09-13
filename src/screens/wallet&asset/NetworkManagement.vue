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
import { Action, Getter, Mutation } from 'vuex-class';
import { type AccountJson } from '@extension-base/background/types/types';
import NetworkItem from './NetworkItem.vue';
import type { NetworkJson } from '@extension-base/types';
import type { Tab } from '@/interfaces/ui';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountGettersTypes } from '@/store/accounts/getters';
import { ActionTypes as NetworksActionsTypes } from '@/store/networks/actions';
import { MutationTypes as AccountMutationsTypes } from '@/store/accounts/mutations';
import { isNetworkGroup } from '@/helpers/common';
import { type SetFavoriteNetwork, type Wallet } from '@/store/accounts/types';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { updateCurrentNetwork } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';

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

  filterValue = '';
  activeTab: keyof Tabs = ALL_NETWORKS;
  value = '';

  @Prop(String) type!: keyof Tabs | string;
  @Getter(NetworksGettersTypes.allNetworks) allNetworks!: NetworkJson[];
  @Getter(AccountGettersTypes.selectedNetwork) selectedNetwork!: string;
  @Getter(AccountGettersTypes.selectedWallet) selectedWallet!: Wallet;
  @Getter(AccountGettersTypes.getAccounts) accounts!: AccountJson[];
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: (value: string) => NetworkJson;
  @Action(NetworksActionsTypes.TOGGLE_FAVORITE_NETWORK) setFavorite!: (props: SetFavoriteNetwork) => Promise<boolean>;
  @Mutation(AccountMutationsTypes.SET_SELECTED_NETWORK) setSelectedNetwork!: (network: string) => void;

  get isGroupSelected() {
    return this.selectedNetwork === this.activeTab;
  }

  get networkListClasses() {
    return BaseApi.useIsPopup() ? '' : 'container--fullscreen';
  }

  get networkGroup() {
    return { name: this.$t(`header.networkManagement.${this.activeTab}`), icon: 'all-networks' };
  }

  get filterByGroupNetworks() {
    if (this.activeTab === ALL_NETWORKS) return this.allNetworks;

    if (this.activeTab === POPULAR_NETWORKS) {
      return this.allNetworks
        .filter(({ rank }) => rank !== undefined)
        .sort((a, b) => {
          if (a.rank === undefined || b.rank === undefined) return 0;

          return a.rank > b.rank ? 1 : -1;
        });
    }

    return this.allNetworks.filter(({ favorite }) =>
      favorite.some((address) => address === this.selectedWallet.address)
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

  changeFilterValue(value: string) {
    this.filterValue = value;
  }

  getLocale(key: string): string {
    return `header.networkManagement.${key}`;
  }

  async mounted() {
    if (isNetworkGroup(this.selectedNetwork)) this.activeTab = this.selectedNetwork as keyof Tabs;
  }

  get selectedAccount() {
    return this.accounts.find((el) => el.address === this.selectedWallet.address);
  }

  isAvailableNetwork(network: string): boolean {
    const selectedNetwork = this.getNetwork(network);

    if (this.selectedWallet.isMobile) {
      if (!this.selectedAccount) return false;

      if (!this.selectedAccount.chains) return false;

      const available = this.selectedAccount.chains.some((el) => selectedNetwork.chainId.includes(el));

      return available;
    }

    if (this.selectedWallet.ethereumAddress === '' && BaseApi.isEthereumNetwork(network)) return false;

    return true;
  }

  isNetworkSelected(name: string) {
    return this.selectedNetwork === name;
  }

  updateActiveTab(value: keyof Tabs) {
    this.activeTab = value;
  }

  toggleNetworkType() {
    if (this.isGroupSelected) return;

    const network = this.tabs[this.activeTab].name;

    this.setSelectedNetwork(network);

    const prepNotification = this.$t(this.getLocale('groupSelected'), {
      group: this.$t(this.tabs[this.activeTab].label),
    }).toString();

    this.$notify({ title: prepNotification, message: '', type: 'success' });
  }

  enableSingleNetwork(network: string) {
    const isSelected = this.isNetworkSelected(network);

    if (isSelected) return;

    this.setSelectedNetwork(network);

    const prepNotification = this.$t(this.getLocale('networkSelected'), { network }).toString();

    this.$notify({ title: prepNotification, message: '', type: 'success' });
  }

  async toggleFavorite(network: string) {
    const isFavorite = await this.setFavorite({ networkName: network, address: this.selectedWallet.address });

    const t = this.getLocale(isFavorite ? 'deleteFavorite' : 'addFavorite');
    const prepNotification = this.$t(t, { network });

    this.$notify({
      title: prepNotification as string,
      message: '',
      type: 'success',
    });
  }

  beforeDestroy() {
    updateCurrentNetwork(this.selectedNetwork);
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
  font-size: 12px;
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
  font-size: 14px;
  font-weight: 600;
  color: $gray-2-color;
}
</style>
