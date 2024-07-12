<template>
  <Fragment v-if="isAuthsExist">
    <AuthItem
      v-for="request in substrateList"
      :key="request.id"
      :authorized-accounts="request.authorizedAccounts"
      :url="request.url"
      @openUpdateAuths="openDotSamaAuthDetails"
      @remove="onDotSamaRemoveAuth"
    />
  </Fragment>
  <div v-else class="no-auths">{{ $t('authorize.noconnections') }}</div>
</template>

<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router/composables';
import type { AuthUrlInfo } from '@extension-base/background/types/types';
import AuthItem from '@/screens/extension-ui/authorize/AuthItem.vue';
import { useStore } from '@/store';
import { Components } from '@/router/routes';

const store = useStore();
const router = useRouter();

const substrateList = ref<Record<string, AuthUrlInfo>>({});
const isAuthsExist = computed(() => Object.keys(substrateList.value).length);
onMounted(async () => {
  substrateList.value = await store.dispatch('GET_AUTHLIST');
});

const openDotSamaAuthDetails = (index: string) => {
  router.push({
    name: Components.UpdateAuths,
    params: {
      index,
    },
  });
};

const onDotSamaRemoveAuth = async (id: string) => {
  store.dispatch('DELETE_AUTH_CONNECTION', id);

  substrateList.value = await store.dispatch('GET_AUTHLIST');
};
</script>
