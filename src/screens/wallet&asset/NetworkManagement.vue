<template>
  <AboveForm :header="getLocale('header')" :fullScreen="true" @closeHandler="$emit('handlerClose')">
    <SearchInput v-model="filterValue" placeholder="common.searchNetwork" class="search-input" width="100%" />

    <Tabs :activeTab="activeTab" :tabs="tabs" @update:activeTab="updateActiveTab" />

    <NetworkItem
      :network="networkGroup"
      :isNetworkGroup="true"
      :isSelected="isGroupSelected"
      @onChangeNetwork="toggleNetworkType(isGroupSelected)"
    />

    <div class="container" :class="networkListClasses">
      <Scroll>
        <ul class="network__list">
          <NetworkItem
            v-for="network in filteredOptionsNetworks"
            :network="network"
            :isSelected="isNetworkSelected(network)"
            @onChangeNetwork="enableSingleNetwork(network.name, isNetworkSelected(network))"
            @onToggleFavorite="toggleFavorite(network.name)"
            :key="network.name"
          />
        </ul>
      </Scroll>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Action, Getter, Mutation } from 'vuex-class';
import NetworkItem from './NetworkItem.vue';
import type { NetworkJson } from '@extension-base/types';
import type { Tab } from '@/interfaces/ui';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountGettersTypes } from '@/store/accounts/getters';
import { ActionTypes as NetworksActionsTypes } from '@/store/networks/actions';
import { MutationTypes as AccountMutationsTypes } from '@/store/accounts/mutations';
import { isNetworkGroup } from '@/helpers/common';
import { SetFavoriteNetwork, Wallet } from '@/store/accounts/types';
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
  filterValue = '';
  activeTab: keyof Tabs = ALL_NETWORKS;
  value = '';

  tabs: Tabs = {
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
  @Prop(String) type!: keyof Tabs | string;
  @Getter(NetworksGettersTypes.allNetworks) networks!: NetworkJson[];
  @Getter(AccountGettersTypes.getSelectedNetwork) selectedNetwork!: string;
  @Getter(AccountGettersTypes.getSelectedWallet) selectedWallet!: Wallet;

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

  get filterNetworks() {
    if (this.activeTab === ALL_NETWORKS) return this.networks;

    const networks = this.networks.filter(({ favorite, rank }) => {
      if (this.activeTab === POPULAR_NETWORKS) return rank !== undefined;

      if (this.activeTab === FAVORITE_NETWORKS)
        return favorite.some((address) => address === this.selectedWallet.address);
    });

    if (this.activeTab === POPULAR_NETWORKS) {
      return networks.sort((a, b) => {
        if (a.rank === undefined || b.rank === undefined) return 0;
        if (a.rank > b.rank) return 1;

        return -1;
      });
    }

    return networks;
  }

  get filteredOptionsNetworks() {
    const filter = this.filterValue.trim().toLowerCase();

    return this.filterNetworks.filter(({ name }) => {
      return name.toLowerCase().includes(filter);
    });
  }

  getLocale(key: string): string {
    return `header.networkManagement.${key}`;
  }

  mounted() {
    if (isNetworkGroup(this.selectedNetwork)) this.activeTab = this.selectedNetwork as keyof Tabs;
  }

  isNetworkSelected({ name }: NetworkJson) {
    return this.selectedNetwork === name;
  }

  updateActiveTab(value: keyof Tabs) {
    this.activeTab = value;
  }

  toggleNetworkType(isGroupSelected: boolean) {
    if (isGroupSelected) return;

    const network = this.tabs[this.activeTab].name;

    this.setSelectedNetwork(network);

    updateCurrentNetwork(network);

    const prepNotification = this.$t(this.getLocale('groupSelected'), {
      group: this.$t(this.tabs[this.activeTab].label),
    }).toString();

    this.$notify({ title: prepNotification, message: '', type: 'success' });
  }

  enableSingleNetwork(network: string, isSelected: boolean) {
    if (isSelected) return;

    this.setSelectedNetwork(network);

    updateCurrentNetwork(network);

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
}
</script>

<style lang="scss" scoped>
.search-input {
  padding-bottom: 16px;
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
</style>
