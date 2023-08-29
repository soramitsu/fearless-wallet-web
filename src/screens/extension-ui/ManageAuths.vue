<template>
  <Fragment>
    <SearchInput v-model="filterValue" placeholder="common.searchNetwork" class="search-input" width="100%" />

    <Tabs v-model="activeTab" :tabs="tabs" />

    <div v-if="showSubstrateAuths" class="auth-items">
      <Scroll>
        <AuthItem v-for="request in filteredList" :key="request.id" :request="request" @openUpdateAuths="updateUrl" />
      </Scroll>
    </div>
    <div v-else-if="showWCAuths" class="auth-items">
      <Scroll>
        <WCAuthItem v-for="(el, index) in wcFilteredList" :key="index" :request="el" @openUpdateAuths="updateUrl" />
      </Scroll>
    </div>
  </Fragment>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type { WalletConnectSessions } from '@extension-base/services/wallet-connect-service/types';
import type { AuthUrlInfo } from '@extension-base/background/types/types';
import WCAuthItem from '@/screens/walletConnect/WCAuthItem.vue';
import AuthItem from '@/screens/extension-ui/authorize/AuthItem.vue';
import { useStore } from '@/store';

const store = useStore();
const filterValue = ref('');

const emit = defineEmits(['updateUrl']);
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

onMounted(async () => {
  filteredList.value = await filteredData();
});

const filteredData = async () => {
  const list = await store.dispatch('GET_AUTHLIST');

  if (filterValue.value === '') return list;

  const entries = Object.entries<AuthUrlInfo>(list);
  const filtered = entries.filter(([, { origin }]) => origin.includes(filterValue.value));

  filteredList.value = Object.fromEntries(filtered);
};

watch(store.getters.authList, filteredData);

const isAuthsExist = computed(() => Object.keys(filteredList).length);
const showSubstrateAuths = computed(() => activeTab.value === 'substrate' && isAuthsExist);

const updateUrl = (value: string) => {
  emit('updateUrl', value);
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
