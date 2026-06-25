<template>
  <AboveForm :fullScreen="true" :header="header" @closeHandler="onReject">
    <div class="wc-request-content">
      <div class="scroll__container">
        <Scroll>
          <div class="wc-request">
            <WalletConnectHeader :title="title" :subtext="subtext" :url="url" />

            <Hint v-if="!isSignatureRequest" class="hint" iconName="warning" :text="$t('walletConnect.txHint')" />

            <WalletConnectRequestData :request="request" class="wc-request__details" />
          </div>
        </Scroll>
      </div>

      <div class="controls">
        <FButton
          text="common.cancel"
          type="secondary"
          :disabled="isSigning"
          :border="false"
          width="100%"
          @click="onReject"
        />

        <FButton text="common.sign" :loading="isSigning" :disabled="isSigning" width="100%" @click="onApprove" />
      </div>
    </div>
  </AboveForm>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  EIP155_SIGNING_METHODS,
  SIGNATURE_METHODS,
  type WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import { TransferErrorCode, BasicTxErrorCode } from '@extension-base/background/types/types';
import { isEthereumAddress } from '@polkadot/util-crypto';
import WalletConnectRequestData from './WalletConnectRequestData.vue';
import WalletConnectHeader from './WalletConnectHeader.vue';
import { useI18n } from '@/locales/useI18n';
import { walletConnectRequestReject, walletConnectRequestApprove } from '@/extension/messaging';
import { useNotify } from '@/plugins/soramitsuUI';
import { useExtensionStore } from '@/stores/extension';

type Error = { message: TransferErrorCode.UNSUPPORTED | BasicTxErrorCode.KEYRING_ERROR };

const extensionStore = useExtensionStore();

const router = useRouter();
const notify = useNotify();
const { t } = useI18n();

const isSigning = ref(false);

const requests = computed<WalletConnectTransactionRequest[]>(() => extensionStore.wcRequests);
const request = computed<WalletConnectTransactionRequest>(() => requests.value[0]);

watch(requests, () => {
  if (!requests.value.length) router.back();
});

const method = computed(() => request.value?.params.request.method as EIP155_SIGNING_METHODS);
const isSignatureRequest = computed(() => SIGNATURE_METHODS.includes(method.value));
const origin = request.value.verifyContext.verified.origin;

const title = computed(() => {
  if (!isSignatureRequest.value) return t('walletConnect.txRequestTitle', { url: origin }).toString();

  return t('walletConnect.signRequestTitle').toString();
});

const params = request.value.params.request.params;
const address = computed<string>(() => {
  if (method.value === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION) {
    return (params[0].from as string).toLowerCase();
  }

  if (Array.isArray(params)) {
    return isEthereumAddress(params[0]) ? params[0] : params[1];
  }

  return params[0].from as string;
});

const subtext = isSignatureRequest.value ? 'walletConnect.signWarning' : undefined;
const url = computed(() => request.value.verifyContext.verified.origin);
const header = computed(() =>
  method.value === EIP155_SIGNING_METHODS.PERSONAL_SIGN ? 'walletConnect.signRequestTitle' : 'common.wc'
);

const onReject = () => {
  walletConnectRequestReject(request.value.topic);
  router.back();
};

const onError = (error: Error) => {
  if (error.message === BasicTxErrorCode.KEYRING_ERROR) {
    isSigning.value = false;

    return;
  }

  const title = (
    error.message === TransferErrorCode.UNSUPPORTED
      ? t('walletConnect.usupportedNetwork')
      : t('addWallet.google.somethingWrong')
  ).toString();

  notify({
    message: '',
    title,
    type: 'warning',
  });

  onReject();

  router.back();
};

const onApprove = async () => {
  isSigning.value = true;

  await walletConnectRequestApprove(address.value.toLowerCase(), request.value.topic).catch(onError);
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
  padding-left: 10px;
  padding-right: 10px;
  gap: 10px;
  flex-shrink: 0;
}

.wc-request__details {
  width: 100%;
}

.scroll__container {
  overflow-y: hidden;
}

.hint {
  width: 470px;
}

.wc-request-content {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 100%;
  gap: 10px;
}
</style>
