<template>
  <Fragment>
    <Tabs v-model="activeTab" :tabs="tabs" />

    <div v-if="showSubstrateAuths" class="auth-items">
      <Scroll>
        <AuthItem
          v-for="request in substrateList"
          :key="request.id"
          :authorized-accounts="request.authorizedAccounts"
          :url="request.url"
          @openUpdateAuths="openDotSamaAuthDetails"
          @remove="onDotSamaRemoveAuth"
        />
      </Scroll>
    </div>
    <div v-else-if="showWCAuths" class="auth-items">
      <Scroll>
        <WalletConnectAuthItem
          v-for="(el, index) in wcFilteredList"
          :key="index"
          :request="el"
          :token="el.topic"
          @openUpdateAuths="openWCAuthDetails"
          @remove="onWCRemoveuth"
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
import type { AuthUrlInfo } from '@extension-base/background/types';
import WalletConnectAuthItem from '@/screens/walletConnect/WalletConnectAuthItem.vue';
import AuthItem from '@/screens/extension-ui/authorize/AuthItem.vue';
import { useStore } from '@/store';
import { Components } from '@/router/routes';
import { disconnectWalletConnectConnection } from '@/extension/messaging';

const store = useStore();
const substrateList = ref<Record<string, AuthUrlInfo>>({});
const router = useRouter();

const wcFilteredList = computed<WalletConnectSessions>(() => store.getters.wcSessions);

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

const showWCAuths = computed(() => activeTab.value === 'wc' && wcFilteredList.value?.length);

onMounted(async () => {
  substrateList.value = await store.dispatch('GET_AUTHLIST');
});

const isAuthsExist = computed(() => Object.keys(substrateList.value).length);
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

  substrateList.value = await store.dispatch('GET_AUTHLIST');
};

const onWCRemoveuth = async (id: string) => {
  disconnectWalletConnectConnection(id);
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
@/extension/background/extension-base/src/background/types
