<template>
  <Fragment>
    <SelectAuthAccount :selectAll="selectAll" :accounts="state" @onSelectAll="onSelectAll" @onSelect="onSelect" />

    <div class="controls">
      <FButton text="walletConnect.reject" type="secondary" :border="false" width="100%" @click="onReject" />
      <FButton text="walletConnect.approve" width="100%" @click="onApprove" />
    </div>
  </Fragment>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { WalletConnectSessionRequest } from '@/extension/background/extension-base/src/services/wallet-connect-service/types';
import SelectAuthAccount from '@/screens/extension-ui/authorize/SelectAuthAccount.vue';

import { WalletInfo, useStore } from '@/store';
import {
  approveWalletConnectSession,
  approveWalletConnectNotSupport,
  rejectWalletConnectSession,
  rejectWalletConnectNotSupport,
} from '@/extension/messaging';
import { AccountJson } from '@/extension/background/extension-base/src/background/types/types';
const store = useStore();
const state = ref<WalletInfo[]>([]);
const selectAll = ref(true);
const requests = computed<WalletConnectSessionRequest[]>(() => store.getters.wcConnectRequests);
const id = computed(() => (requests.value.length ? requests.value[0].id : ''));
const isSupported = true;

onMounted(() => {
  state.value.push(
    ...(store.getters.getAccounts as AccountJson[])
      .filter(({ ethereumAddress }) => ethereumAddress !== '')
      .map(({ name, ethereumAddress, isMobile }) => {
        return {
          name,
          address: ethereumAddress,
          isMobile: !!isMobile,
          active: true,
        };
      })
  );
});
const selectedAccounts = computed(() => state.value.map((el) => el.address));

const onSelect = () => {};

const onSelectAll = () => {};

const onApprove = () => {
  isSupported
    ? approveWalletConnectSession({ accounts: selectedAccounts.value, id: id.value })
    : approveWalletConnectNotSupport({ id: id.value });
};

const onReject = () => {
  isSupported ? rejectWalletConnectSession({ id: id.value }) : rejectWalletConnectNotSupport({ id: id.value });
};
</script>

<style lang="scss" scoped>
.controls {
  display: flex;
  flex-direction: row;
  gap: 10px;
}
</style>
