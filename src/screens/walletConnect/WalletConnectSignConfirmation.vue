<template>
  <AboveForm :fullScreen="true" header="assets.transaction" @closeHandler="onReject">
    <ValidatedInput
      v-model="password"
      placeholder="addWallet.enterPassword"
      errorDescriptions="common.invalidPassword"
      :isError="isPassValid"
    />
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
import { useRouter } from 'vue-router/composables';
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import { walletConnectRequestReject, walletConnectRequestApprove } from '@/extension/messaging';
import { useStore } from '@/store';
import { TransferErrorCode, BasicTxErrorCode } from '@/extension/background/extension-base/src/background/types';
import { useNotify } from '@/plugins/soramitsuUI';
type Error = { message: TransferErrorCode.UNSUPPORTED | BasicTxErrorCode.KEYRING_ERROR };
const store = useStore();
const router = useRouter();
const notify = useNotify();

const password = ref('');
const isPassValid = ref(false);
const [request]: WalletConnectTransactionRequest[] = store.getters.wcSignList;

const address = request.params.request.params[0].from as string;

const onReject = () => walletConnectRequestReject(request.topic);

const onApprove = async () => {
  isPassValid.value = false;

  await walletConnectRequestApprove(address, password.value, request.topic).catch((error: Error) => {
    if (error.message === BasicTxErrorCode.KEYRING_ERROR) {
      isPassValid.value = true;

      return;
    }

    if (error.message === TransferErrorCode.UNSUPPORTED) {
      notify({ message: 'Unsupported network', title: 'Unsupported network', type: 'warn' });
      onReject();

      router.back();
    }
  });

  router.back();
};
</script>

<style lang="scss" scoped>
.controls {
  display: flex;
  flex-direction: row;
  gap: 10px;
}
</style>
