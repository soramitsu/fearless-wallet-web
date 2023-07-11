<template>
  <AboveForm :header="header" :fullScreen="true" :closeHandler="handlerClose">
    <SearchInput v-model="filterValue" placeholder="common.searchNetwork" class="search-input" width="100%" />

    <STabs v-model="active" type="rounded" position="top">
      <STab :label="$t('header.networkManagement.all')" name="all" class="button" />
      <STab :label="$t('header.networkManagement.popular')" name="popular" class="button" />
      <STab :label="$t('header.networkManagement.favorites')" name="favorite" class="button" />
    </STabs>
    <div class="container">
      <Scroll>
        <ul class="network__list">
          <li
            v-for="({ name, icon }, index) in filterNetwork"
            :key="name"
            class="network"
            :class="rowClasses(value)"
            @click="toggle()"
          >
            <Icon v-if="index === 0" :icon="icon" width="24" height="24" className="network__icon" />
            <ExternalLogo v-else :name="icon" width="24" height="24" class="img" />

            <span class="network__name">{{ name }}</span>
            <div class="network__state">
              <Icon
                v-if="index !== 0"
                icon="star"
                iconColor="purple"
                width="18"
                height="18"
                className="network__icon-state"
              />
              <Icon v-else icon="check" iconColor="purple" width="18" height="18" className="network__icon-state" />
            </div>
          </li>
        </ul>
      </Scroll>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { STab, STabs } from '@soramitsu/soramitsu-js-ui';
import { AuthUrlInfo } from '@/extension/background/extension-base/src/background/types/types';
import { Networks } from '@/interfaces';
import AuthItem from '@/screens/extension-ui/authorize/AuthItem.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

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
    AuthItem,
    STab,
    STabs,
  },
})
export default class NetworkManage extends Vue {
  filteredList: Record<string, AuthUrlInfo> = {};
  filterValue = '';
  url = '';
  active: keyof Tabs = 'all';
  value = '';

  tabs: Tabs = {
    all: {
      label: 'header.networkManagement.all',
      name: 'all',
    },
    popular: {
      label: 'header.networkManagement.popular',
      name: 'popular',
    },
    favorites: {
      label: 'header.networkManagement.favorites',
      name: 'favorites',
    },
  };
  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(NetworksGettersTypes.allNetworks) networks!: Networks;

  get showUpdateAuths() {
    return this.url !== '';
  }

  get filterNetwork() {
    const prepFirst = { name: this.$t(this.tabs[this.active].label), icon: 'all-networks' };

    return [prepFirst, ...this.networks];
  }

  get header() {
    return 'header.networkManagement.header';
  }

  getIconVisible() {
    //
  }

  toggle() {
    //
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

  .network {
    display: flex;
    flex-flow: row nowrap;
    gap: 16px;
    color: $default-white;
    font-size: 16px;
    border: solid 1px transparent;
    border-bottom-color: $default-background-color;
    padding-top: 16px;
    padding-bottom: 16px;
    justify-content: center;
    align-items: center;
    .network__name {
      white-space: nowrap;
    }
    .network__icon-state {
      width: 18px;
      height: 18px;
    }
    .network__icon {
      width: 24px;
      height: 24px;
    }
    .network__state {
      flex-grow: 3;
      width: 100%;
      display: flex;
      justify-content: flex-end;
    }
  }
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
