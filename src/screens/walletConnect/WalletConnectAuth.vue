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
import type { AccountJson } from '@extension-base/background/types/types';
import SelectAuthAccount from '@/screens/extension-ui/authorize/SelectAuthAccount.vue';
import { WalletInfo, useStore } from '@/store';
import {
  approveWalletConnectSession,
  approveWalletConnectNotSupport,
  rejectWalletConnectSession,
  rejectWalletConnectNotSupport,
} from '@/extension/messaging';

const store = useStore();
const state = ref<Record<string, WalletInfo>>({});
const selectAll = ref(true);
const id = computed(() => (store.getters.wcConnectRequests.length ? store.getters.wcConnectRequests[0].id : ''));
const isSupported = true;

onMounted(() => {
  const accounts = store.getters.getAccounts as AccountJson[];
  accounts
    .filter(({ ethereumAddress }) => ethereumAddress !== '')
    .forEach(({ name, ethereumAddress, isMobile }) => {
      set(state.value, name, {
        name,
        address: ethereumAddress,
        isMobile: !!isMobile,
        active: true,
      });
    });
});

const selectedAccounts = computed(() => Object.values(state.value).map((el) => el.address));

function isAllSelected() {
  return Object.values(state.value).every((value) => value.active === true);
}

const onSelect = (value: boolean, name: string) => {
  state.value[name].active = value;
  selectAll.value = isAllSelected();
};

const onSelectAll = (value: boolean) => {
  Object.keys(state.value).forEach((key) => {
    set(state.value, key, {
      ...state.value[key],
      active: value,
    });
  });

  selectAll.value = value;
};

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
