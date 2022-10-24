<template>
  <AboveForm header="Manage dApp access" :blur="true" :closeHandler="handlerClose">
    <SearchInput v-model="filterValue" placeholder="Search in networks" class="manage-auths__search" width="100%" />

    <AuthItem
      v-for="el in filteredList"
      v-bind:key="el.id"
      :request="el"
      @onRemoveAuth="removeAuth"
      @updateAuths="updateAuthorizedAccount"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Watch, Prop } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import { AuthUrlInfo } from '@extension-base/background/types';
import { TAction } from '@/interfaces';
import AboveForm from '@/components/AboveForm.vue';
import SearchInput from '@/components/SearchInput.vue';
import AuthItem from '@/screens/authorize/AuthItem.vue';
import { Components } from '@/router/routes';
import { GettersTypes as AuthGettersTypes } from '@/store/auth/getters';
import { ActionTypes as AuthActionTypes } from '@/store/auth/actions';

@Component({
  components: {
    AboveForm,
    AuthItem,
    SearchInput,
  },
})
export default class ManageAuths extends Vue {
  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(AuthGettersTypes.getAuthList) authlist!: Record<string, AuthUrlInfo>;
  @Action(AuthActionTypes.GET_AUTHLIST) getAuthList!: TAction<void>;
  @Action(AuthActionTypes.DELETE_AUTH_CONNECTION)
  deleteAuthConnection!: TAction<string>;

  filterValue = '';
  filteredList: Record<string, AuthUrlInfo> = {};
  filteredValue: any;

  async mounted() {
    await this.getAuthList();

    this.filteredList = this.authlist;
  }

  @Watch('filterValue')
  filter(value: string) {
    this.filteredList = this.filteredData(value);
  }

  filteredData(value: string) {
    const filtered = Object.entries<AuthUrlInfo>(this.authlist).filter(([, info]) => {
      return info.origin.includes(value);
    });

    return Object.fromEntries(filtered);
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
    await this.deleteAuthConnection(url);
  }
}
</script>
