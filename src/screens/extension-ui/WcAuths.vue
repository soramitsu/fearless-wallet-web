<template>
  <Fragment v-if="isAuthExists">
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
import { useRouter } from 'vue-router';
import WalletConnectAuthItem from '@/screens/walletConnect/WalletConnectAuthItem.vue';
import { useAccountsStore } from '@/stores/accounts';
import { Components } from '@/router/routes';
import { useExtensionStore } from '@/stores/extension';

const accountsStore = useAccountsStore();
const extensionStore = useExtensionStore();
const router = useRouter();

const accounts = computed(() => accountsStore.accounts);

const wcFilteredList = computed(() =>
  extensionStore.wcSessions.filter(({ topic }) => accounts.value.every(({ wcTopic }) => wcTopic !== topic))
);

const isAuthExists = computed(() => wcFilteredList.value?.length);

const openWCAuthDetails = (index: string) => {
  router.push({
    name: Components.DAppDetails,
    params: {
      index,
    },
  });
};
</script>
