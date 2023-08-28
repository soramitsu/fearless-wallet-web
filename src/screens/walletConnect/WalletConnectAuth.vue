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
import { computed, onMounted, ref, set } from 'vue';
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
const state = ref<Record<string, WalletInfo>>({});
const selectAll = ref(true);
const id = computed(() => (store.getters.wcConnectRequests.length ? store.getters.wcConnectRequests[0].id : ''));
const isSupported = true;

onMounted(() => {
  (store.getters.getAccounts as AccountJson[])
    .filter(({ ethereumAddress }) => ethereumAddress !== '')
    .forEach(({ name, ethereumAddress, isMobile }) => {
      set(state, name, {
        name,
        address: ethereumAddress,
        isMobile: !!isMobile,
        active: true,
      });
    });
});
const selectedAccounts = computed(() => Object.values(state.value).map((el) => el.address));

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
