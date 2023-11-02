<template>
  <Fragment v-if="wcFilteredList?.length">
    <WalletConnectAuthItem
      v-for="(el, index) in wcFilteredList"
      :key="index"
      :request="el"
      :token="el.topic"
      @openUpdateAuths="openWCAuthDetails"
    />
  </Fragment>
  <div v-else class="no-auths">{{ $t('authorize.noconnections') }}</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router/composables';
import { WalletConnectSessions } from '@/extension/background/extension-base/src/services/wallet-connect-service/types';
import WalletConnectAuthItem from '@/screens/walletConnect/WalletConnectAuthItem.vue';
import { useStore } from '@/store';
import { Components } from '@/router/routes';

const store = useStore();
const router = useRouter();
const wcFilteredList = computed<WalletConnectSessions>(() => store.getters.wcSessions);

const openWCAuthDetails = (index: string) => {
  router.push({
    name: Components.UpdateAuths,
    params: {
      index,
    },
  });
};
</script>
