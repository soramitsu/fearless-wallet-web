<template>
  <AboveForm :fullScreen="true" :header="header" @closeHandler="onReject">
    <div class="wc-request-content">
      <div class="scroll__container">
        <Scroll>
          <div class="wc-request">
            <WalletConnectHeader :name="title" :url="url" :isTx="true" />

            <WalletConnectRequestData :request="request" class="wc-request__details" />
          </div>
        </Scroll>
      </div>

      <ValidatedInput
        v-model="password"
        placeholder="addWallet.enterPassword"
        errorDescriptions="common.invalidPassword"
        :showPassword="false"
        class="wc-request__input"
        :isError="isPassValid"
      />

      <div class="controls">
        <FButton text="walletConnect.reject" type="secondary" :border="false" width="100%" @click="onReject" />

        <FButton text="walletConnect.approve" width="100%" @click="onApprove" />
      </div>
    </div>
  </AboveForm>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router/composables';
import {
  EIP155_SIGNING_METHODS,
  WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import WalletConnectRequestData from './WalletConnectRequestData.vue';
import WalletConnectHeader from './WalletConnectHeader.vue';
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

const method = computed(() => request.params.request.method as EIP155_SIGNING_METHODS);
const isSignatureRequest = computed(() => method.value === EIP155_SIGNING_METHODS.PERSONAL_SIGN);
const origin = request.verifyContext.verified.origin;
const title = computed(() => (isSignatureRequest.value ? 'Signature request' : `Request from ${origin}`));

const url = computed(() => request.verifyContext.verified.origin);
const header = computed(() => {
  if (method.value === EIP155_SIGNING_METHODS.PERSONAL_SIGN) return 'assets.signature';

  return 'assets.transaction';
});
const address = computed(() => {
  if (method.value === EIP155_SIGNING_METHODS.ETH_SIGN_TRANSACTION)
    return request.params.request.params[0].from as string;

  return request.params.request.params[1];
});

const onReject = () => walletConnectRequestReject(request.topic);

const onError = (error: Error) => {
  if (error.message === BasicTxErrorCode.KEYRING_ERROR) {
    isPassValid.value = true;

    return;
  }

  if (error.message === TransferErrorCode.UNSUPPORTED) {
    notify({ message: 'Unsupported network', title: 'Unsupported network', type: 'warn' });
    onReject();

    router.back();
  }
};

const onApprove = async () => {
  isPassValid.value = false;

  const res = await walletConnectRequestApprove(address.value, password.value, request.topic).catch(onError);

  if (res) router.back();
};
</script>

<style lang="scss" scoped>
.controls {
  display: flex;
  flex-direction: row;
  width: 100%;
  column-gap: 10px;
  padding-left: 10px;
  padding-right: 10px;
}

.wc-request {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-direction: column;
  overflow-y: hidden;
  padding-left: 10px;
  padding-right: 10px;
  gap: 10px;
}
.wc-request__input {
  width: 100%;
  height: 96px;
  padding-left: 10px;
  padding-right: 10px;
}
.wc-request__details {
  width: 100%;
}
.scroll__container {
  height: 460px;
  overflow-y: hidden;
}

.wc-request-content {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 100%;
  gap: 10px;
}
</style>
