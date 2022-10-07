<template>
  <AboveForm header="Manage dApp access" :blur="true" :closeHandler="back">
    <SearchInput v-model="filterValue" placeholder="Search in networks" class="manage-auths__search" width="100%" />

    <AuthItem
      v-for="el in filteredList"
      v-bind:key="el.id"
      :request="el"
      @onRemoveAuth="removeAuth"
      @updateAuths="updateAuthorizedAccount"
      @onChange="onChange"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { AuthUrlInfo } from '@extension-base/background/types';
import AboveForm from '@/components/AboveForm.vue';
import SearchInput from '@/components/SearchInput.vue';
import AuthItem from '@/screens/authorize/AuthItem.vue';
import { Components } from '@/router/routes';
import { GettersTypes as AuthGettersTypes } from '@/store/auth/getters';

@Component({
  components: {
    AboveForm,
    AuthItem,
    SearchInput,
  },
})
export default class ManageAuths extends Vue {
  @Getter(AuthGettersTypes.getAuthList) authlist!: Record<string, AuthUrlInfo>;

  filterValue = '';
  filteredList: Record<string, AuthUrlInfo> = {};

  async beforeCreate() {
    await this.$store.dispatch('GET_AUTHLIST');
    this.filteredList = this.authlist;
  }

  @Watch('filterValue')
  filter(value: string) {
    this.filteredData(value);
  }

  onChange(id: string) {
    this.$store.dispatch('UPDATE_AUTH_CONNECTION', id);
  }

  filteredData(value: string) {
    const filtered = Object.entries<AuthUrlInfo>(this.authlist).filter(([, info]) => {
      return info.origin.includes(value);
    });

    this.filteredList = Object.fromEntries(filtered);
  }

  updateAuthorizedAccount(url: string) {
    this.$router.push({
      name: Components.UpdateAuths,
      params: {
        url,
      },
    });
  }
  async removeAuth(url: string) {
    await this.$store.dispatch('DELETE_AUTH_CONNECTION', url);
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }
}
</script>
