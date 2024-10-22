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
import { useRouter } from 'vue-router/composables';
import type { WalletConnectSessions } from '@extension-base/services/wallet-connect-service/types';
import type { AccountJson } from '@extension-base/background/types/types';
import WalletConnectAuthItem from '@/screens/walletConnect/WalletConnectAuthItem.vue';
import { useStore } from '@/store';
import { Components } from '@/router/routes';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';

const store = useStore();
const router = useRouter();
const accounts = computed<AccountJson[]>(() => store.getters[AccountsGettersTypes.getAccounts]);
const wcFilteredList = computed<WalletConnectSessions>(() =>
  (store.getters[ExtensionGettersTypes.wcSessions] as WalletConnectSessions).filter(({ topic }) =>
    accounts.value.every(({ wcTopic }) => wcTopic !== topic)
  )
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
