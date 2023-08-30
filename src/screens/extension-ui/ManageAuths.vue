<template>
  <Fragment>
    <SearchInput v-model="filterValue" placeholder="common.searchNetwork" class="search-input" width="100%" />

    <Tabs v-model="activeTab" :tabs="tabs" />

    <div v-if="showSubstrateAuths" class="auth-items">
      <Scroll>
        <AuthItem
          v-for="request in filteredList"
          :key="request.id"
          :request="request"
          @openUpdateAuths="openDotSamaAuthDetails"
          @remove="onDotSamaRemoveAuth"
        />
      </Scroll>
    </div>
    <div v-else-if="showWCAuths" class="auth-items">
      <Scroll>
        <WCAuthItem
          v-for="(el, index) in wcFilteredList"
          :key="index"
          :request="el"
          @openUpdateAuths="openWCAuthDetails"
        />
      </Scroll>
    </div>
    <div v-else>NO AUTHS</div>
  </Fragment>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router/composables';
import type { WalletConnectSessions } from '@extension-base/services/wallet-connect-service/types';
import type { AuthUrlInfo } from '@extension-base/background/types/types';
import WCAuthItem from '@/screens/walletConnect/WCAuthItem.vue';
import AuthItem from '@/screens/extension-ui/authorize/AuthItem.vue';
import { useStore } from '@/store';
import { Components } from '@/router/routes';

const store = useStore();
const filterValue = ref('');
const router = useRouter();

const wcFilteredList = ref<WalletConnectSessions>(store.getters.wcSessions);

const activeTab = ref<'substrate' | 'wc'>('substrate');
const tabs = {
  substrate: {
    label: 'authorize.substrate',
    name: 'substrate',
  },
  wc: {
    label: 'authorize.wc',
    name: 'wc',
  },
};

const showWCAuths = computed(() => activeTab.value === 'wc' && wcFilteredList);

const filteredList = ref<Record<string, AuthUrlInfo>>({});

const filteredData = async () => {
  const list = await store.dispatch('GET_AUTHLIST');

  if (filterValue.value === '') return list;

  const entries = Object.entries<AuthUrlInfo>(list);
  const filtered = entries.filter(([, { origin }]) => origin.includes(filterValue.value));

  filteredList.value = Object.fromEntries(filtered);
};

onMounted(async () => {
  filteredList.value = await filteredData();
});

const isAuthsExist = computed(() => Object.keys(filteredList.value).length);
const showSubstrateAuths = computed(() => activeTab.value === 'substrate' && isAuthsExist.value);

const openDotSamaAuthDetails = (index: string) => {
  router.push({
    name: Components.UpdateAuths,
    params: {
      index,
    },
  });
};

const openWCAuthDetails = (index: string) => {
  router.push({
    name: Components.UpdateAuths,
    params: {
      index,
    },
  });
};

const onDotSamaRemoveAuth = async (id: string) => {
  store.dispatch('DELETE_AUTH_CONNECTION', id);
  filteredList.value = await filteredData();
};
</script>

<style lang="scss" scoped>
.search-input {
  margin-bottom: 16px;
}

.auth-items {
  height: calc(100% - 60px);
}
</style>
