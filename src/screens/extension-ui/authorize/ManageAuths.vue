<template>
  <AboveForm
    :header="header"
    :showBackIcon="showUpdateAuths"
    :blur="true"
    :closeHandler="handlerClose"
    :handlerBack="updateUrl.bind(null, '')"
  >
    <UpdateAuths v-if="showUpdateAuths" :url="url" @updateUrl="updateUrl" />

    <template v-else>
      <SearchInput v-model="filterValue" placeholder="common.searchNetwork" width="100%" />

      <div class="auth-items">
        <Scroll>
          <AuthItem v-for="el in requests" v-bind:key="el.id" :request="el" @openUpdateAuths="updateUrl" />
        </Scroll>
      </div>
    </template>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import { AuthUrlInfo } from '@extension-base/background/types';
import UpdateAuths from './UpdateAuths.vue';
import { AsyncFn } from '@/interfaces';
import AuthItem from '@/screens/extension-ui/authorize/AuthItem.vue';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';

@Component({
  components: {
    AuthItem,
    UpdateAuths,
  },
})
export default class ManageAuths extends Vue {
  filterValue = '';
  url = '';

  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(ExtensionGettersTypes.authList) authlist!: Record<string, AuthUrlInfo>;
  @Action(ExtensionActionTypes.GET_AUTHLIST) getAuthList!: AsyncFn<void>;

  get showUpdateAuths() {
    return this.url !== '';
  }

  get header() {
    if (this.showUpdateAuths) return { text: 'authorize.accountsConnected', localeProps: { url: this.url } };

    return 'common.manageDApp';
  }

  get requests() {
    const filter = this.filterValue.trim().toLowerCase();
    const filtered = Object.entries(this.authlist).filter(([, { origin }]) => origin.toLowerCase().includes(filter));

    return Object.fromEntries(filtered);
  }

  mounted() {
    this.getAuthList();
  }

  updateUrl(url = '') {
    this.url = url;
  }
}
</script>

<style lang="scss" scoped>
.auth-items {
  height: calc(100% - 60px);
}
</style>
