<template>
    <AboveForm v-if="!showFinishForm" :fullScreen="true" header="welcome.connectMobile" @closeHandler="onClose">
      <template v-if="isQRPrep">
        <h2 class="header">{{ $t('mobileConnector.qrHeader') }}</h2>

        <QR :payload="qr" showLogo />
      </template>

      <Loader v-else />

      <PermissionDeniedPopup v-if="isWalletAlreadyExists" />
    </AboveForm>

    <div v-else class="finish-form">
      <FinishForm />

      <FButton
        size="big"
        fontSize="big"
        width="100%"
        text="common.continue"
        data-testid="continueBtn"
        @click="onContinue"
      />
    </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '@/locales/useI18n';
import PermissionDeniedPopup from '@/screens/mobile-wallet/PermissionDeniedPopup.vue';
import {
  walletConnectDappInitSession,
  walletConnectDappSubscribeSession,
  walletConnectDappCancelSession,
} from '@/extension/messaging';
import FinishForm from '@/screens/addWallet/FinishForm.vue';
import { Components } from '@/router/routes';
import { useNotify } from '@/plugins/soramitsuUI';

const router = useRouter();
const notify = useNotify();
const { t } = useI18n();
const isWalletAlreadyExists = ref(false);
const qr = ref<string | null>(null);
const showFinishForm = ref(false);

let active = true;
const attemptId = crypto.randomUUID();
let unsubscribe: (() => void) | undefined;
let terminal = false;
let subscriptionReady = false;
let mounted = true;
let cancelled = false;
let cancellation: Promise<void> | undefined;
let leaving: Promise<void> | undefined;
const cleanup = (): Promise<void> => {
  if (cancelled) return Promise.resolve();
  if (cancellation) return cancellation;
  if (active) {
    active = false;
    unsubscribe?.();
    qr.value = null;
  }
  cancellation = walletConnectDappCancelSession(attemptId)
    .then(() => { cancelled = true; })
    .finally(() => { cancellation = undefined; });
  return cancellation;
};
onBeforeUnmount(() => {
  mounted = false;
  void cleanup().catch(console.error);
});
const leave = (): Promise<void> => {
  if (leaving) return leaving;
  leaving = cleanup().then(() => {
    if (mounted) router.back();
  }).catch(() => {
    if (mounted) notify({ title: t('mobileConnector.connectionFailed').toString(), message: '', type: 'warning' });
  }).finally(() => { leaving = undefined; });
  return leaving;
};
const failed = () => {
  if (!active) return;
  notify({ title: t('mobileConnector.connectionFailed').toString(), message: '', type: 'warning' });
  void leave();
};
onMounted(async () => {
  try {
    const uri = await walletConnectDappInitSession(attemptId);
    if (!active) return;
    if (!uri) return failed();
    qr.value = uri;
    const subscription = walletConnectDappSubscribeSession(uri, ({ status, message }) => {
      if (!active || terminal) return;
      terminal = true;
      if (subscriptionReady) unsubscribe?.();
      if (status) {
        showFinishForm.value = true;
      } else if (message === 'duplicate') {
        isWalletAlreadyExists.value = true;
      } else {
        if (message === 'rejected') {
          notify({ title: t('mobileConnector.rejected').toString(), message: '', type: 'warning' });
          void leave();
        } else failed();
      }
    });
    unsubscribe = () => subscription.unsubscribe();
    await subscription.response;
    subscriptionReady = true;
    if (terminal) unsubscribe();
  } catch {
    if (!terminal) failed();
  }
});

const isQRPrep = computed(() => !isWalletAlreadyExists.value && qr.value);

const onClose = () => leave();
const onContinue = () => router.push({ name: Components.Wallet });
</script>

<style lang="scss" scoped>
.import-button {
  margin-top: 10px;
}

.error__container {
  display: flex;
  flex-flow: column;
  height: 100%;
  justify-content: space-between;
}

.permission__content {
  height: 100%;
  display: flex;
  flex-flow: column;
  justify-content: space-between;
}

.header {
  padding: 16px;
}

.loader {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
.finish-form {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  gap: 24px;

  > * {
    flex-shrink: 0;
    min-width: 0;
  }

  :deep(.finish .row) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    align-items: stretch;
  }

  :deep(.finish .button-size-medium) {
    width: 100% !important;
    min-width: 0;
  }

  :deep(.finish .logo .text),
  :deep(.finish .logo .subtext) {
    overflow-wrap: anywhere;
  }
}
</style>
