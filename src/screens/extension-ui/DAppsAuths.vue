<template>
  <Fragment v-if="isAuthsExist">
    <AuthItem
      v-for="request in list"
      :key="request.id"
      :authorizedAccounts="request.authorizedAccounts"
      :url="request.url"
      :type="type"
      @remove="removeAuth"
      @openAuthDetails="openAuthDetails"
    />
  </Fragment>
  <div v-else class="no-auths">{{ $t('authorize.noconnections') }}</div>
</template>

<script lang="ts" setup>
import { onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import type { AuthUrlInfo } from '@extension-base/background/types/types';
import AuthItem from '@/screens/extension-ui/AuthItem.vue';
import { Components } from '@/router/routes';
import { useExtensionStore } from '@/stores/extension';

const extensionStore = useExtensionStore();
const router = useRouter();
const route = useRoute();

const type = computed(() => route.params.type ?? 'substrate');

const allDappList = computed<AuthUrlInfo[]>(() => {
  const auths = extensionStore.authList;

  return Object.values(auths);
});

const hasAuthType = (item: AuthUrlInfo, authType: string): boolean => {
  if (item.accountAuthType === 'all') return true;
  if (item.accountAuthType === 'both') return authType === 'substrate' || authType === 'evm';

  return (item.accountAuthType ?? 'substrate') === authType;
};

const getAuthorizedAccounts = (item: AuthUrlInfo, authType: string): string[] => {
  if (authType === 'evm') return item.evmAuthorizedAccount === '' ? [] : [item.evmAuthorizedAccount];
  if (authType === 'solana') return item.solanaAuthorizedAccount ? [item.solanaAuthorizedAccount] : [];
  if (authType === 'iroha') return item.irohaAuthorizedAccount ? [item.irohaAuthorizedAccount] : [];

  return item.authorizedAccounts;
};

const list = computed(() => {
  const authType = String(type.value);
  const authList = allDappList.value.filter((item) => hasAuthType(item, authType));

  return authList.map((item) => ({
    ...item,
    authorizedAccounts: getAuthorizedAccounts(item, authType),
  }));
});

const isAuthsExist = computed(() => Object.keys(list.value).length);

const getAuthList = () => extensionStore.getAuthList();

onMounted(async () => getAuthList());

const openAuthDetails = (stripedUrl: string) => {
  router.push({
    name: Components.DAppDetails,
    params: {
      id: stripedUrl,
      type: type.value,
    },
  });
};

const removeAuth = async (id: string) => {
  extensionStore.deleteAuthRequests(id);

  getAuthList();
};
</script>
