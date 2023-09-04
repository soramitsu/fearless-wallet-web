<template>
  <div class="controls">
    <FButton text="walletConnect.reject" type="secondary" :border="false" width="100%" @click="onReject" />
  </div>
</template>

<script setup lang="ts">
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import { walletConnectRequestReject } from '@/extension/messaging';

import { useStore } from '@/store';
const store = useStore();

const [request]: WalletConnectTransactionRequest[] = store.getters.wcSignList;

const onReject = () => {
  walletConnectRequestReject(request.topic);
};
</script>

<style lang="scss" scoped>
.controls {
  display: flex;
  flex-direction: row;
  gap: 10px;
}
</style>
