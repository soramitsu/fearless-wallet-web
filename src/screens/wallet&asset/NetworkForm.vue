<template>
  <AboveForm :header="header" :fullScreen="true" :closeHandler="handlerClose">
    <SearchInput v-model="filterValue" placeholder="common.searchNetwork" class="search-input" width="100%" />

    <STabs v-model="activeTab" type="rounded" position="top">
      <STab v-for="tab in tabs" :label="$t(tab.label)" :name="tab.name" :key="tab.name" class="button">
        <NetworkItem
          :network="networkGroup"
          :isNetworkGroup="true"
          :isActive="isGroupSelected"
          @onToggleNetworkType="toggleNetworkType()"
        />
      </STab>
    </STabs>
    <div class="container">
      <Scroll>
        <ul class="network__list">
          <NetworkItem
            v-for="network in sortedNetworks"
            :key="network.name"
            :network="network"
            :isSelected="isNetworkSelected(network)"
            :isFavorite="network.favorite"
            @onToggleNetworkType="enableSingleNetwork(network.name)"
            @onToggleState="toggleFavorite(network.name, !!network.favorite)"
          />
        </ul>
      </Scroll>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { STab, STabs } from '@soramitsu/soramitsu-js-ui';
import NetworkItem from './NetworkItem.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { NetworkJson } from '@/extension/background/extension-base/src/types';
import { toggleFavoriteNetwork, toggleNetworkType } from '@/extension/messaging';
type Tab = {
  label: string;
  name: string;
};

type Tabs = {
  all: Tab;
  popular: Tab;
  favorites: Tab;
};

@Component({
  components: {
    STab,
    STabs,
    NetworkItem,
  },
})
export default class NetworkManage extends Vue {
  filterValue = '';
  activeTab: keyof Tabs = 'all';
  value = '';

  tabs: Tabs = {
    all: {
      label: 'header.networkManagement.tabs.all',
      name: 'all',
    },
    popular: {
      label: 'header.networkManagement.tabs.popular',
      name: 'popular',
    },
    favorites: {
      label: 'header.networkManagement.tabs.favorites',
      name: 'favorites',
    },
  };
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(String) type!: keyof Tabs | string;
  @Getter(NetworksGettersTypes.allNetworks) networks!: NetworkJson[];

  get isGroupSelected() {
    return this.type === this.activeTab;
  }

  get networkGroup() {
    return { name: this.$t(`header.networkManagement.${this.activeTab}`), icon: 'all-networks' };
  }

  get filterNetwork() {
    if (this.activeTab === 'all') return this.networks;

    return this.networks.filter((network) => {
      if (this.activeTab === 'popular') return network.popular;
      if (this.activeTab === 'favorites') return network.favorite;
    });
  }

  get sortedNetworks() {
    return this.filterNetwork.sort((a, b) => {
      if (a.active) return 1;

      return 0;
    });
  }

  isNetworkSelected(network: NetworkJson) {
    return this.type === network.name && network.active;
  }

  get header() {
    return 'header.networkManagement.header';
  }

  async toggleNetworkType() {
    await toggleNetworkType(this.activeTab);

    const prepNotification = this.$t(`header.networkManagement.groupSelected`, {
      group: this.$t(this.tabs[this.activeTab].label),
    });

    this.$notify({ title: prepNotification as string, message: '', type: 'success' });
  }

  async enableSingleNetwork(network: string) {
    await toggleNetworkType(network);

    const prepNotification = this.$t(`header.networkManagement.networkSelected`, { network });

    this.$notify({ title: prepNotification as string, message: '', type: 'success' });
  }

  async toggleFavorite(network: string, isFavorite: boolean) {
    await toggleFavoriteNetwork(network);
    const t = `header.networkManagement.${isFavorite ? 'deleteFavorite' : 'addFavorite'}`;
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
  height: 400px;
  overflow-y: hidden;
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
