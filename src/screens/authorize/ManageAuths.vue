<template>
  <AboveForm
    header="Manage dApp access"
    :showBackIcon="true"
    :blur="true"
    :handlerBack="back"
    :showCloseIcon="false"
    :closeHandler="back"
  >
    <SearchInput v-model="filterValue" placeholder="Search in networks" class="manage-auths__search" :isBig="true" />
    <Fragment v-for="el in filteredList" v-bind:key="el.id">
      <AuthItem :request="el" @onRemoveAuth="removeAuth" @onChange="onChange" />
    </Fragment>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import Switcher from '@/components/Switcher.vue';
import { Fragment } from 'vue-fragment';
import AboveForm from '@/components/AboveForm.vue';
import SearchInput from '@/components/SearchInput.vue';
import AuthItem from '@/screens/authorize/AuthItem.vue';
import { Components } from '@/router/routes';
import store from '@/store';
import type { AuthUrlInfo } from '@polkadot/extension-base/background/handlers/State';
import { Getter } from 'vuex-class';

@Component({
  components: {
    AboveForm,
    AuthItem,
    Fragment,
    Switcher,
    SearchInput,
  },
})
export default class ManageAuths extends Vue {
  filterValue = '';
  filteredList: Record<string, AuthUrlInfo> = {};
  @Getter('getAuthList') authlist!: Record<string, AuthUrlInfo>;

  @Watch('filterValue')
  filter(value: string) {
    this.filteredData(value);
  }

  onChange(id: string) {
    store.dispatch('UPDATE_AUTH_CONNECTION', id);
  }

  toggleAuth(url: string) {
    store.dispatch('UPDATE_AUTH_CONNECTION', url);
  }

  filteredData(value: string) {
    const filtered = Object.entries<AuthUrlInfo>(this.authlist).filter(([, info]) => {
      return info.origin.includes(value);
    });

    this.filteredList = Object.fromEntries(filtered);
  }

  async removeAuth(id: string) {
    await store.dispatch('DELETE_AUTH_CONNECTION', id);
  }

  async beforeCreate() {
    await store.dispatch('GET_AUTHLIST');
    this.filteredList = this.authlist;
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }
}
</script>

<style lang="scss" scoped>
.manage-auths__search {
  width: 100%;
  margin-bottom: 17px;
}
</style>
