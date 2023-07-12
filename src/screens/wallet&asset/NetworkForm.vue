<template>
  <AboveForm :header="header" :fullScreen="true" :closeHandler="handlerClose">
    <SearchInput v-model="filterValue" placeholder="common.searchNetwork" class="search-input" width="100%" />

    <STabs v-model="active" type="rounded" position="top">
      <STab v-for="tab in tabs" :label="$t(tab.label)" :name="tab.name" :key="tab.name" class="button" />
    </STabs>
    <div class="container">
      <Scroll>
        <ul class="network__list">
          <NetworkItem
            :network="networkGroup"
            :isNetworkGroup="true"
            :isActive="true"
            @onToggleState="toggleNetworkType()"
          />

          <NetworkItem
            v-for="network in filterNetwork"
            :key="network.name"
            :network="network"
            :isActive="network.favorite"
            @onToggleState="toggleFavorite(network.name)"
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
  active: keyof Tabs = 'all';
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
  @Getter(NetworksGettersTypes.allNetworks) networks!: NetworkJson[];

  get networkGroup() {
    return { name: this.$t(`header.networkManagement.${this.active}`), icon: 'all-networks' };
  }

  get filterNetwork() {
    return this.networks;
  }

  get header() {
    return 'header.networkManagement.header';
  }

  getIconVisible() {
    //
  }

  toggleNetworkType() {
    toggleNetworkType(this.active);
  }

  toggleFavorite(name: string) {
    toggleFavoriteNetwork(name);
  }

  rowClasses(value: string) {
    return [
      'row',
      {
        'row-active': this.value === value,
      },
      // `padding-${this.space}`,
    ];
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
  gap: 16px;
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

.el-tabs__content {
  display: none;
}
</style>
