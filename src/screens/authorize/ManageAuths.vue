<template>
  <AboveForm header="Manage dApp access" :blur="true" :closeHandler="back">
    <SearchInput v-model="filterValue" placeholder="Search in networks" class="manage-auths__search" :isBig="true" />

    <AuthItem
      v-for="el in filteredList"
      v-bind:key="el.id"
      :request="el"
      @onRemoveAuth="removeAuth"
      @onChange="onChange"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { AuthUrlInfo } from '@polkadot/extension-base/background/handlers/State';
import AboveForm from '@/components/AboveForm.vue';
import SearchInput from '@/components/SearchInput.vue';
import AuthItem from '@/screens/authorize/AuthItem.vue';
import { Components } from '@/router/routes';

@Component({
  components: {
    AboveForm,
    AuthItem,
    SearchInput,
  },
})
export default class ManageAuths extends Vue {
  @Getter('getAuthList') authlist!: Record<string, AuthUrlInfo>;

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

  onDeleteConnection(event: Event) {
    console.info(event);
  }

  async removeAuth(id: string) {
    await this.$store.dispatch('DELETE_AUTH_CONNECTION', id);
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }
}
</script>

<style lang="scss" scoped>
.divider {
  background-color: rgba(255, 255, 255, 0.1);
  margin: 17px 0;
}

.auth-item-name {
  font-size: 16px;
}

.img-button {
  background-image: url('@/assets/trash.svg');
  background-size: 16px 16px;
  height: 16px;
  width: 16px;
}

.trash {
  cursor: pointer;
}

.manage-auths__search {
  width: 100%;
  margin-bottom: 17px;
}
</style>
