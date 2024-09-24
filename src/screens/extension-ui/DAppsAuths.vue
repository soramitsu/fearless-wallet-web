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
import { useRouter, useRoute } from 'vue-router/composables';
import type { AuthUrlInfo } from '@extension-base/background/types/types';
import AuthItem from '@/screens/extension-ui/AuthItem.vue';
import { useStore } from '@/store';
import { Components } from '@/router/routes';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';

const store = useStore();
const router = useRouter();
const route = useRoute();

const type = computed(() => route.params.type ?? 'substrate');

const allDappList = computed<AuthUrlInfo[]>(() => {
  const auths: AuthUrlInfo = store.getters[ExtensionGettersTypes.authList];

  return Object.values(auths);
});

const substrateList = computed<AuthUrlInfo[]>(() => allDappList.value.filter((item) => item.accountAuthType !== 'evm'));
const evmList = computed<AuthUrlInfo[]>(() => allDappList.value.filter((item) => item.accountAuthType !== 'substrate'));
const list = computed(() => {
  const authList = type.value === 'evm' ? evmList.value : substrateList.value;

  return authList.map((item) => ({
    ...item,
    authorizedAccounts:
      type.value === 'evm'
        ? item.evmAuthorizedAccount === ''
          ? []
          : [item.evmAuthorizedAccount]
        : item.authorizedAccounts,
  }));
});

const isAuthsExist = computed(() => Object.keys(list.value).length);

const getAuthList = () => store.dispatch('GET_AUTHLIST');

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
  store.dispatch('DELETE_AUTH_CONNECTION', id);

  getAuthList();
};
</script>
