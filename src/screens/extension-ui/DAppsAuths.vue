<template>
  <Fragment v-if="isAuthsExist">
    <AuthItem
      v-for="request in substrateList"
      :key="request.id"
      :authorized-accounts="request.authorizedAccounts"
      :url="request.url"
      @openUpdateAuths="openAuthDetails"
      @remove="removeAuth"
    />
  </Fragment>
  <div v-else class="no-auths">{{ $t('authorize.noconnections') }}</div>
</template>

<script lang="ts" setup>
import { onMounted, computed } from 'vue';
import { useRouter } from 'vue-router/composables';
import type { AuthUrlInfo } from '@extension-base/background/types/types';
import AuthItem from '@/screens/extension-ui/authorize/AuthItem.vue';
import { useStore } from '@/store';
import { Components } from '@/router/routes';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';

const store = useStore();
const router = useRouter();

const substrateList = computed<AuthUrlInfo[]>(() => {
  const auths: AuthUrlInfo = store.getters[ExtensionGettersTypes.authList];

  return Object.values(auths);
});

const isAuthsExist = computed(() => Object.keys(substrateList.value).length);

const getAuthList = () => store.dispatch('GET_AUTHLIST');

onMounted(async () => getAuthList());

const openAuthDetails = (index: string) => {
  router.push({
    name: Components.UpdateAuths,
    params: {
      index,
    },
  });
};

const removeAuth = async (id: string) => {
  store.dispatch('DELETE_AUTH_CONNECTION', id);

  getAuthList();
};
</script>
