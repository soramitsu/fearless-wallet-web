<template>
  <AboveForm
    :header="header"
    :fullScreen="true"
    :showBackIcon="showUpdateAuths"
    :closeHandler="onClose"
    :handlerBack="onBack"
  >
    <template v-if="!showUpdateAuths">
      <SearchInput v-model="filterValue" placeholder="common.searchNetwork" class="search-input" width="100%" />

      <Tabs v-model="activeTab" :tabs="tabs" />

      <div v-if="showSubstrateAuths" class="auth-items">
        <Scroll>
          <AuthItem v-for="el in filteredList" v-bind:key="el.id" :request="el" @openUpdateAuths="updateUrl" />
        </Scroll>
      </div>
    </template>

    <UpdateAuths v-else :url="url" @updateUrl="updateUrl" />
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type { AuthUrlInfo } from '@extension-base/background/types/types';
import UpdateAuths from '@/screens/extension-ui/authorize/UpdateAuths.vue';
import AuthItem from '@/screens/extension-ui/authorize/AuthItem.vue';
import { useStore } from '@/store';

const store = useStore();
const filteredList = ref<Record<string, AuthUrlInfo>>({});
// const wcFilteredList = ref<Record<string, AuthUrlInfo>>({});
const filterValue = ref('');
const url = ref('');
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
const emits = defineEmits(['close']);

const showUpdateAuths = computed(() => url.value !== '');
const showSubstrateAuths = computed(() => activeTab.value === 'substrate');
const header = computed(() => {
  if (showUpdateAuths.value) return { text: 'authorize.accountsConnected', localeProps: { url: url.value } };

  return 'common.manageDApp';
});

onMounted(async () => {
  await store.dispatch('GET_AUTHLIST');

  filteredList.value = store.getters.authList;
});

function filteredData(value: string) {
  const filtered = Object.entries<AuthUrlInfo>(store.getters.authlist).filter(([, { origin }]) => {
    return origin.includes(value);
  });

  return Object.fromEntries(filtered);
}

watch(filterValue, (value: string) => {
  filteredList.value = filteredData(value);
});

const updateUrl = (value = '') => {
  url.value = value;
};

const onBack = () => updateUrl('');

const onClose = () => emits('close');
</script>

<style lang="scss" scoped>
.search-input {
  margin-bottom: 16px;
}

.auth-items {
  height: calc(100% - 60px);
}
</style>
