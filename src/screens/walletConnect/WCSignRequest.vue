<template>
  <AboveForm :fullScreen="true" header="assets.transaction" @closeHandler="onReject">
    <FInput v-model="password" />
    <div>
      {{ 'Data' }}
    </div>
    <div class="controls">
      <FButton text="walletConnect.reject" type="secondary" :border="false" width="100%" @click="onReject" />
      <FButton text="walletConnect.approve" width="100%" @click="onApprove" />
    </div>
  </AboveForm>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import { walletConnectRequestReject, walletConnectRequestApprove } from '@/extension/messaging';
import { useStore } from '@/store';

const store = useStore();

const password = ref('');
const [request]: WalletConnectTransactionRequest[] = store.getters.wcSignList;

const address = request.params.request.params[0].from as string;

const onApprove = () => {
  walletConnectRequestApprove(address, password.value, request.topic);
};

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
