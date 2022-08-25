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
    <Fragment v-for="(el, key) in getAuth" v-bind:key="key">
      <AuthsList :requests="el" />
    </Fragment>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import Switcher from '@/components/Switcher.vue';
import { Fragment } from 'vue-fragment';
import AboveForm from '@/components/AboveForm.vue';
import SearchInput from '@/components/SearchInput.vue';
import AuthsList from '@/screens/authorize/AuthsList.vue';
import { Components } from '@/router/routes';
import store from '@/store';
import type { AuthUrlInfo } from '@polkadot/extension-base/background/handlers/State';

@Component({
  components: {
    AboveForm,
    AuthsList,
    Fragment,
    Switcher,
    SearchInput,
  },
  computed: {
    getAuth() {
      if (Object.keys(store.getters.getAuthList).length) {
        return Object.keys(store.getters.getAuthList as unknown as Record<string, AuthUrlInfo>)
          .filter((el) => {
            return store.getters.getAuthList[el].origin.includes('');
          })
          .map((el) => {
            return store.getters.getAuthList[el];
          });
      }
    },
  },
})
export default class ManageAuths extends Vue {
  filterValue = '';
  value: string[] = [];
  @Watch('filterValue')
  filter(value: string) {
    this.FilteredData(value);
  }

  FilteredData(value: string) {
    if (Object.keys(store.getters.getAuthList).length) {
      const filtered = Object.keys(store.getters.getAuthList as unknown as Record<string, AuthUrlInfo>)
        .filter((el) => {
          return store.getters.getAuthList[el].origin.includes(value);
        })
        .map((el) => {
          return store.getters.getAuthList[el];
        });

      this.value = filtered;
    }
  }

  async beforeCreate() {
    store.dispatch('GET_AUTHLIST');
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }

  onDeleteConnection(event: Event) {
    console.log(event);
  }
}
</script>

<style lang="scss" scoped>
.manage-auths__search {
  width: 100%;
  margin-bottom: 17px;
}
</style>
