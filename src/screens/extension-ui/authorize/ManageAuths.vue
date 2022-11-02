<template>
  <AboveForm
    :header="header"
    :showBackIcon="showUpdateAuths"
    :blur="true"
    :closeHandler="handlerClose"
    :handlerBack="updateUrl.bind(null, '')"
  >
    <template v-if="!showUpdateAuths">
      <SearchInput v-model="filterValue" placeholder="common.searchNetwork" class="search-input" width="100%" />

      <div class="auth-items">
        <Scroll>
          <AuthItem v-for="el in filteredList" v-bind:key="el.id" :request="el" @openUpdateAuths="updateUrl" />
        </Scroll>
      </div>
    </template>

    <UpdateAuths v-else :url="url" @updateUrl="updateUrl" />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Watch, Prop } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import { AuthUrlInfo } from '@extension-base/background/types';
import UpdateAuths from './UpdateAuths.vue';
import { TAction } from '@/interfaces';
import AboveForm from '@/components/AboveForm.vue';
import SearchInput from '@/components/SearchInput.vue';
import AuthItem from '@/screens/extension-ui/authorize/AuthItem.vue';
import { GettersTypes as AuthGettersTypes } from '@/store/auth/getters';
import { ActionTypes as AuthActionTypes } from '@/store/auth/actions';
import Scroll from '@/components/Scroll.vue';

@Component({
  components: {
    Scroll,
    AuthItem,
    AboveForm,
    SearchInput,
    UpdateAuths,
  },
})
export default class ManageAuths extends Vue {
  filteredList: Record<string, AuthUrlInfo> = {};
  filterValue = '';
  url = '';

  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(AuthGettersTypes.getAuthList) authlist!: Record<string, AuthUrlInfo>;
  @Action(AuthActionTypes.GET_AUTHLIST) getAuthList!: TAction<void>;

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
