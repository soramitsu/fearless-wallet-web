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
            :value="password"
            placeholder="accounts.passwordApp"
            errorDescriptions="common.invalidPassword"
            :showPassword="true"
            class="wc-request__input"
            :isError="state.isPassValid"
            @change="changePassword"
          />
          <Checkbox :value="state.isSavePass" @change="onSavePass" size="medium" :label="$t(min15Label)" />
        </div>

        <div class="controls">
          <FButton
            text="common.cancel"
            type="secondary"
            :disabled="state.isSigning"
            :border="false"
            width="100%"
            @click="onReject"
          />

          <FButton
            text="common.sign"
            :loading="state.isSigning"
            :disabled="state.isSigning"
            width="100%"
            @click="onApprove"
          />
        </div>
      </div>
    </div>
  </AboveForm>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, reactive } from 'vue';
import { useRouter } from 'vue-router/composables';
import {
  EIP155_SIGNING_METHODS,
  SIGNATURE_METHODS,
  type WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import { TransferErrorCode, BasicTxErrorCode } from '@extension-base/background/types/types';
import { useI18n } from 'vue-i18n-composable';
import { isEthereumAddress } from '@polkadot/util-crypto';
import WalletConnectRequestData from './WalletConnectRequestData.vue';
import WalletConnectHeader from './WalletConnectHeader.vue';
import { walletConnectRequestReject, walletConnectRequestApprove, isSignLocked } from '@/extension/messaging';
import { useStore } from '@/store';
import { useNotify } from '@/plugins/soramitsuUI';
import ValidatedInput from '@/components/ValidatedInput.vue';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';

type Error = { message: TransferErrorCode.UNSUPPORTED | BasicTxErrorCode.KEYRING_ERROR };

const store = useStore();
const router = useRouter();
const notify = useNotify();
const { t } = useI18n();
const state = reactive({
  isSavePass: false,
  isSigning: false,
  isPassValid: false,
});
const password = ref('');

const requests = computed<WalletConnectTransactionRequest[]>(() => store.getters[ExtensionGettersTypes.wcSignList]);
const request = computed<WalletConnectTransactionRequest>(() => requests.value[0]);

watch(requests, () => {
  if (!requests.value.length) router.back();
});

const method = computed(() => request.value.params.request.method as EIP155_SIGNING_METHODS);
const isSignatureRequest = computed(() => SIGNATURE_METHODS.includes(method.value));
const origin = request.value.verifyContext.verified.origin;
const title = computed<string>(() => {
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

const isLocked = ref(false);
const min15Label = computed(() => (isLocked.value ? 'assets.15min' : 'assets.15minExtend'));

const subtext = isSignatureRequest.value ? 'walletConnect.signWarning' : undefined;
const url = computed(() => request.value.verifyContext.verified.origin);
const header = computed(() => {
  if (method.value === EIP155_SIGNING_METHODS.PERSONAL_SIGN) return 'walletConnect.signRequestTitle';

  return 'common.wc';
});
const onSavePass = (value: boolean) => (state.isSavePass = value);

onMounted(async () => {
  const res = await isSignLocked(address.value);
  isLocked.value = res.isLocked;

  if (!res.isLocked) state.isSavePass = true;
});

const onReject = () => {
  walletConnectRequestReject(request.value.topic);
  router.back();
};

const onError = (error: Error) => {
  if (error.message === BasicTxErrorCode.KEYRING_ERROR) {
    state.isPassValid = true;
    state.isSigning = false;

    return;
  }

  if (error.message === TransferErrorCode.UNSUPPORTED) {
    notify({
      message: '',
      title: t('walletConnect.usupportedNetwork').toString(),
      type: 'warning',
    });
  } else {
    notify({
      message: '',
      title: t('addWallet.google.somethingWrong').toString(),
      type: 'warning',
    });
  }

  onReject();

  router.back();
};

const changePassword = (value: string) => {
  password.value = value;
};

const onApprove = async () => {
  state.isPassValid = false;
  state.isSigning = true;

  await walletConnectRequestApprove(
    address.value.toLowerCase(),
    password.value,
    request.value.topic,
    state.isSavePass
  ).catch(onError);
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
