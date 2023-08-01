<template>
  <AboveForm :header="getLocale('header')" :fullScreen="true" :closeHandler="handlerClose">
    <SearchInput v-model="filterValue" placeholder="common.searchNetwork" class="search-input" width="100%" />

    <STabs v-model="activeTab" type="rounded" position="top">
      <STab v-for="{ name, label } in tabs" class="button" :label="$t(label)" :name="name" :key="name">
        <NetworkItem
          :network="networkGroup"
          :isNetworkGroup="true"
          :isSelected="isGroupSelected"
          @onToggleNetworkType="toggleNetworkType()"
        />
      </STab>
    </STabs>
    <div class="container" :class="networkListClasses">
      <Scroll>
        <ul class="network__list">
          <NetworkItem
            v-for="network in filteredOptionsNetworks"
            :network="network"
            :isSelected="isNetworkSelected(network)"
            @onToggleNetworkType="enableSingleNetwork(network.name)"
            @onToggleState="toggleFavorite(network.name)"
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
import { STab, STabs } from '@soramitsu/soramitsu-js-ui';
import NetworkItem from './NetworkItem.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountGettersTypes } from '@/store/accounts/getters';
import { ActionTypes as NetworksActionsTypes } from '@/store/networks/actions';
import { MutationTypes as AccountMutationsTypes } from '@/store/accounts/mutations';

import { NetworkJson } from '@/extension/background/extension-base/src/types';
import { SetFavoriteNetwork, Wallet } from '@/store/accounts/types';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { updateCurrentAccountNetwork } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';
type Tab = {
  label: string;
  name: string;
};

type Tabs = {
  [ALL_NETWORKS]: Tab;
  [POPULAR_NETWORKS]: Tab;
  [FAVORITE_NETWORKS]: Tab;
};

@Component({
  components: {
    STab,
    STabs,
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
  @Prop(Function) handlerClose!: VoidFunction;
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

  isNetworkSelected({ name }: NetworkJson) {
    return this.selectedNetwork === name;
  }

  toggleNetworkType() {
    const network = this.tabs[this.activeTab].name;
    this.setSelectedNetwork(network);

    updateCurrentAccountNetwork(network);

    const prepNotification = this.$t(this.getLocale('groupSelected'), {
      group: this.$t(this.tabs[this.activeTab].label),
    });

    this.$notify({ title: prepNotification as string, message: '', type: 'success' });
  }

  enableSingleNetwork(network: string) {
    this.setSelectedNetwork(network);
    updateCurrentAccountNetwork(network);
    const prepNotification = this.$t(this.getLocale('networkSelected'), { network });

    this.$notify({ title: prepNotification as string, message: '', type: 'success' });
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
}
.container--fullscreen {
  height: calc(100vh - 270px);
}

.network__list {
  display: flex;
  flex-flow: column nowrap;
  padding: 0;
  height: 100%;
}
</style>

<style lang="scss">
.el-tabs__nav {
  background: #111111 !important;
  color: $default-white !important;
  gap: 14px;
}

.el-tabs__nav-wrap {
  background: #111111 !important;
}

.el-tabs__item {
  text-transform: uppercase;
}

.el-tabs__item.is-active {
  border-radius: 30px !important;
  background-color: #7700ee40 !important;
  color: #ffffff75 !important;
}

.el-tabs__item:not(.is-active) {
  border-radius: 30px !important;
  background-color: $default-background-color !important;
  color: #ffffff50 !important;
}

.el-tab-pane {
  background-color: #111111 !important;
  height: 100% !important;
  width: 100% !important;
  border-radius: 0 !important;
}
.el-tab-pane.button {
  padding: 0;
  display: block;
  text-transform: none;
}
</style>
