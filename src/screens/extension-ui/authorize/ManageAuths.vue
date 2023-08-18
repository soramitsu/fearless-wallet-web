<template>
  <AboveForm
    :header="header"
    :fullScreen="true"
    :showBackIcon="showUpdateAuths"
    :closeHandler="handlerClose"
    :handlerBack="updateUrl.bind(null, '')"
  >
    <template v-if="!showUpdateAuths">
      <SearchInput v-model="filterValue" placeholder="common.searchNetwork" class="search-input" width="100%" />
      <STabs v-model="activeTab" type="rounded" position="top">
        <STab v-for="{ name, label } in tabs" class="button" :label="$t(label)" :name="name" :key="name">
          <div class="auth-items">
            <Scroll>
              <AuthItem v-for="el in filteredList" v-bind:key="el.id" :request="el" @openUpdateAuths="updateUrl" />
            </Scroll>
          </div>
        </STab>
      </STabs>
    </template>

    <UpdateAuths v-else :url="url" @updateUrl="updateUrl" />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Watch, Prop } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import { STab, STabs } from '@soramitsu/soramitsu-js-ui';
import UpdateAuths from './UpdateAuths.vue';
import type { AuthUrlInfo } from '@extension-base/background/types/types';
import { AsyncFn } from '@/interfaces';
import AuthItem from '@/screens/extension-ui/authorize/AuthItem.vue';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';

@Component({
  components: {
    AuthItem,
    UpdateAuths,
    STab,
    STabs,
  },
})
export default class ManageAuths extends Vue {
  filteredList: Record<string, AuthUrlInfo> = {};
  filterValue = '';
  url = '';
  activeTab = 'substrate';
  tabs = {
    substrate: {
      label: 'header.networkManagement.tabs.all',
      name: 'substrate',
    },
    wc: {
      label: 'header.networkManagement.tabs.all',
      name: 'wc',
    },
  };
  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(ExtensionGettersTypes.authList) authlist!: Record<string, AuthUrlInfo>;
  @Action(ExtensionActionTypes.GET_AUTHLIST) getAuthList!: AsyncFn;

  get showUpdateAuths() {
    return this.url !== '';
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

  filteredData(value: string) {
    const filtered = Object.entries<AuthUrlInfo>(this.authlist).filter(([, { origin }]) => {
      return origin.includes(value);
    });

    return Object.fromEntries(filtered);
  }

  updateUrl(url = '') {
    this.url = url;
  }
}
</script>

<style lang="scss" scoped>
.search-input {
  margin-bottom: 16px;
}

.auth-items {
  height: calc(100% - 60px);
}
</style>
