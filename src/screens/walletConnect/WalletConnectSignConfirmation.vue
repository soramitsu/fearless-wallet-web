<template>
  <AboveForm :fullScreen="true" :header="header" :showCloseIcon="!pending" @closeHandler="onReject">
    <div class="wc-request-content">
      <p v-if="actionError" role="alert">{{ t('addWallet.google.somethingWrong') }}</p>
      <template v-if="request">
        <div class="scroll__container">
          <Scroll>
            <div class="wc-request">
              <WalletConnectHeader :title="title" :subtext="subtext" :url="url" />

              <Hint v-if="!isSignatureRequest" class="hint" iconName="warning" :text="t('walletConnect.txHint')" />

              <WalletConnectRequestData :key="requestKey" :request="request" class="wc-request__details" />
            </div>
          </Scroll>
        </div>

        <div ref="controls" class="controls">
          <FButton
            data-testid="rejectWalletConnectSigning"
            text="common.cancel"
            size="big"
            type="secondary"
            :disabled="!!pending"
            :border="false"
            width="100%"
            @click="onReject"
          />

          <FButton
            data-testid="approveWalletConnectSigning"
            text="common.sign"
            size="big"
            :loading="pending === 'approve'"
            :disabled="!!pending || !address"
            width="100%"
            @click="onApprove"
          />
        </div>
      </template>
    </div>
  </AboveForm>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  EIP155_SIGNING_METHODS,
  SIGNATURE_METHODS,
  type WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import { evmSigningAddress } from '@extension-base/services/request-service/handlers/evmSigningContext';
import WalletConnectRequestData from './WalletConnectRequestData.vue';
import WalletConnectHeader from './WalletConnectHeader.vue';
import { useI18n } from '@/locales/useI18n';
import { walletConnectRequestReject, walletConnectRequestApprove } from '@/extension/messaging';
import { useNotify } from '@/plugins/soramitsuUI';
import { useExtensionStore } from '@/stores/extension';
import { Components } from '@/router/routes';

const extensionStore = useExtensionStore();
const router = useRouter();
const notify = useNotify();
const { t } = useI18n();
const pending = ref<'approve' | 'reject' | null>(null);
const actionError = ref(false);
const controls = ref<HTMLElement | null>(null);
const request = computed<WalletConnectTransactionRequest | undefined>(() => extensionStore.wcRequests[0]);
const requestKey = computed(() => (request.value ? JSON.stringify(request.value) : ''));
const method = computed(() => request.value?.params.request.method as EIP155_SIGNING_METHODS);
const isSignatureRequest = computed(() => SIGNATURE_METHODS.includes(method.value));
const origin = computed(() => request.value?.verifyContext?.verified?.origin ?? '');
const title = computed(() =>
  isSignatureRequest.value
    ? t('walletConnect.signRequestTitle')
    : t('walletConnect.txRequestTitle', { url: origin.value })
);
const address = computed(() => {
  try {
    return request.value ? evmSigningAddress(method.value, request.value.params.request.params) : '';
  } catch {
    return '';
  }
});
const subtext = computed(() => (isSignatureRequest.value ? 'walletConnect.signWarning' : undefined));
const url = computed(() => origin.value);
const header = computed(() =>
  method.value === EIP155_SIGNING_METHODS.PERSONAL_SIGN ? 'walletConnect.signRequestTitle' : 'common.wc'
);
let active = true;
let renderedRequestKey = '';
const focusReject = async () => {
  const key = requestKey.value;
  await nextTick();
  if (active && key === requestKey.value)
    controls.value
      ?.querySelector<HTMLButtonElement>('[data-testid="rejectWalletConnectSigning"] button')
      ?.focus({ preventScroll: true });
};
const leaveEmpty = () => {
  if (active && !request.value && router.currentRoute.value.name === Components.WalletConnectSignConfirmation)
    void router.push({ name: Components.Wallet }).catch(() => {
      if (active) actionError.value = true;
    });
};
const act = async (action: 'approve' | 'reject') => {
  const captured = request.value;
  if (
    !active ||
    !captured ||
    !captured.approvalId ||
    pending.value ||
    renderedRequestKey !== requestKey.value ||
    (action === 'approve' && !address.value)
  )
    return;
  const key = requestKey.value;
  const signer = address.value;
  const site = origin.value;
  const submits = method.value === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION;
  pending.value = action;
  actionError.value = false;
  try {
    const succeeded =
      action === 'approve'
        ? await walletConnectRequestApprove(signer, captured.approvalId)
        : await walletConnectRequestReject(captured.approvalId);
    if (!succeeded) throw new Error('WalletConnect request was not completed');
    if (action === 'approve')
      notify({
        title: t(submits ? 'signingReview.submitted' : 'signingReview.signed', { origin: site }),
        message: '',
        type: 'info',
      });
  } catch {
    if (active && key === requestKey.value) actionError.value = true;
  } finally {
    if (active) {
      pending.value = null;
      if (key !== requestKey.value) void focusReject();
    }
  }
};
const onApprove = () => act('approve');
const onReject = () => act('reject');
watch(
  requestKey,
  () => {
    actionError.value = false;
    leaveEmpty();
    void focusReject();
  },
  { flush: 'sync' }
);
watch(
  requestKey,
  (key) => {
    renderedRequestKey = key;
  },
  { flush: 'post' }
);
onMounted(() => {
  renderedRequestKey = requestKey.value;
  leaveEmpty();
  void focusReject();
});
onBeforeUnmount(() => {
  active = false;
});
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
