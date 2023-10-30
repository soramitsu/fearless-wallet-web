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
      <div>
        <div class="pass-form">
          <ValidatedInput
            v-if="isLocked"
            v-model="password"
            placeholder="common.enterAccountPass"
            errorDescriptions="common.invalidPassword"
            :showPassword="true"
            class="wc-request__input"
            :isError="isPassValid"
          />
          <Checkbox :value="isSavePass" @change="onSavePass" size="medium" :label="$t(min15Label)" />
        </div>

        <div class="controls">
          <FButton text="common.cancel" type="secondary" :border="false" width="100%" @click="onReject" />

          <FButton text="common.sign" width="100%" @click="onApprove" />
        </div>
      </div>
    </div>
  </AboveForm>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router/composables';
import {
  EIP155_SIGNING_METHODS,
  SIGNATURE_METHODS,
  WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import { TransferErrorCode, BasicTxErrorCode } from '@extension-base/background/types';
import { useI18n } from 'vue-i18n-composable';
import { isEthereumAddress } from '@polkadot/util-crypto';
import WalletConnectRequestData from './WalletConnectRequestData.vue';
import WalletConnectHeader from './WalletConnectHeader.vue';
import { walletConnectRequestReject, walletConnectRequestApprove, isSignLocked } from '@/extension/messaging';
import { useStore } from '@/store';
import { useNotify } from '@/plugins/soramitsuUI';
import ValidatedInput from '@/components/ValidatedInput.vue';
type Error = { message: TransferErrorCode.UNSUPPORTED | BasicTxErrorCode.KEYRING_ERROR };

const store = useStore();
const router = useRouter();
const notify = useNotify();
const { t } = useI18n();
const isSavePass = ref(false);
const password = ref('');
const isPassValid = ref(false);
const [request]: WalletConnectTransactionRequest[] = store.getters.wcSignList;

const method = computed(() => request.params.request.method as EIP155_SIGNING_METHODS);
const isSignatureRequest = computed(() => SIGNATURE_METHODS.includes(method.value));
const origin = request.verifyContext.verified.origin;
const title = computed<string>(() => {
  if (!isSignatureRequest.value) return t('walletConnect.txRequestTitle', { url: origin }).toString();

  return t('walletConnect.signRequestTitle').toString();
});
const address = computed<string>(() => {
  if (method.value === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION) {
    return (request.params.request.params[0].from as string).toLowerCase();
  }

  if (Array.isArray(request.params.request.params)) {
    return isEthereumAddress(request.params.request.params[0])
      ? request.params.request.params[0]
      : request.params.request.params[1];
  }

  return request.params.request.params.from as string;
});
const isLocked = ref(false);
const min15Label = computed(() => (isLocked.value ? 'assets.15min' : 'assets.15minExtend'));

const subtext = isSignatureRequest.value ? 'walletConnect.signWarning' : undefined;
const url = computed(() => request.verifyContext.verified.origin);
const header = computed(() => {
  if (method.value === EIP155_SIGNING_METHODS.PERSONAL_SIGN) return 'walletConnect.signRequestTitle';

  return 'common.wc';
});
const onSavePass = (value: boolean) => (isSavePass.value = value);

onMounted(async () => {
  const res = await isSignLocked(address.value.toLowerCase());
  isLocked.value = res.isLocked;

  if (!res.isLocked) isSavePass.value = true;
});

const onReject = () => {
  walletConnectRequestReject(request.topic);
  router.back();
};

const onError = (error: Error) => {
  if (error.message === BasicTxErrorCode.KEYRING_ERROR) {
    isPassValid.value = true;

    return;
  }

  if (error.message === TransferErrorCode.UNSUPPORTED) {
    notify({
      message: '',
      title: t('walletConnect.usupportedNetwork').toString(),
      type: 'warn',
    });
    onReject();

    router.back();
  }
};

const onApprove = async () => {
  isPassValid.value = false;
  const res = await walletConnectRequestApprove(address.value, password.value, request.topic, isSavePass.value).catch(
    onError
  );

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
  padding-left: 10px;
  padding-right: 10px;
  gap: 10px;
  flex-shrink: 0;
}
.wc-request__input {
  width: 100%;
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

.pass-form {
  display: flex;
  flex-flow: column;
  align-items: self-start;
  padding: 0 10px 0 10px;
}
</style>
