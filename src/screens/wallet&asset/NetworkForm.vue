<template>
  <AboveForm
    :header="header"
    :showBackIcon="showUpdateAuths"
    :fullScreen="true"
    :closeHandler="handlerClose"
    :handlerBack="updateUrl.bind(null, '')"
  >
    <SearchInput v-model="filterValue" placeholder="common.searchNetwork" class="search-input" width="100%" />

    <STabs v-model="active" type="rounded" class="network-nav" position="top">
      <STab :label="$t('common.all')" name="all" class="button" />
      <STab :label="$t('common.popular')" name="popular" class="button" />
      <STab :label="$t('common.favorites')" name="favorite" class="button" />
    </STabs>

    <div v-for="({ name, icon }, index) in filterNetwork" :key="name" :class="rowClasses(value)" @click="toggle()">
      <div class="description">
        <template>
          <Icon v-if="index === 0" :icon="icon" className="img" />

          <ExternalLogo v-else :name="icon" class="img" />
        </template>

        {{ name }}
      </div>

      <SIcon name="basic-check-mark-24" v-show="getIconVisible()" />
      <Icon v-if="index !== 0" icon="star" iconColor="purple" className="img" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Watch, Prop } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import { STab, STabs } from '@soramitsu/soramitsu-js-ui';
import { AuthUrlInfo } from '@/extension/background/extension-base/src/background/types/types';
import { AsyncFn, Networks } from '@/interfaces';
import AuthItem from '@/screens/extension-ui/authorize/AuthItem.vue';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
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
      label: 'common.all',
      name: 'all',
    },
    popular: {
      label: 'common.popular',
      name: 'popular',
    },
    favorites: {
      label: 'common.favorites',
      name: 'favorites',
    },
  };
  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(ExtensionGettersTypes.authList) authlist!: Record<string, AuthUrlInfo>;
  @Action(ExtensionActionTypes.GET_AUTHLIST) getAuthList!: AsyncFn;
  @Getter(NetworksGettersTypes.allNetworks) networks!: Networks;

  get showUpdateAuths() {
    return this.url !== '';
  }

  get filterNetwork() {
    const prepFirst = { name: this.$t(this.tabs[this.active].label), icon: 'all-networks' };

    return [prepFirst, ...this.networks];
  }

  get header() {
    if (this.showUpdateAuths) return { text: 'authorize.accountsConnected', localeProps: { url: this.url } };

    return 'common.manageDApp';
  }

  async mounted() {
    await this.getAuthList();

    this.filteredList = this.authlist;
  }

  @Watch('filterValue')
  filter(value: string) {
    this.filteredList = this.filteredData(value);
  }

  getIconVisible() {
    //
  }

  filteredData(value: string) {
    const filtered = Object.entries<AuthUrlInfo>(this.authlist).filter(([, { origin }]) => {
      return origin.includes(value);
    });

    return Object.fromEntries(filtered);
  }

  updateUrl(url = '') {
    this.url = url;
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
.network-nav {
  display: flex;
}
</style>
