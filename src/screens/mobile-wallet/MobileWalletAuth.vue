<template>
  <Fragment>
    <AboveForm v-if="!showFinishForm" :fullScreen="true" header="welcome.connectMobile" @closeHandler="onClose">
      <template v-if="isQRPrep">
        <h2 class="header">{{ $t('mobileConnector.qrHeader') }}</h2>

        <QR :payload="qr" />
      </template>

      <MobileWalletPermissionPopup v-if="connectionStatus" :status="connectionStatus" />
    </AboveForm>
    <div v-else class="finish-form">
      <FinishForm />

      <FButton size="big" fontSize="big" width="100%" text="common.continue" @click="onContinue" />
    </div>
  </Fragment>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router/composables';
import { useI18n } from 'vue-i18n-composable';
import MobileWalletPermissionPopup from '@/screens/mobile-wallet/MobileWalletPermissionPopup.vue';
import { walletConnectDappInitSession, walletConnectDappSubscribeSession } from '@/extension/messaging';
import FinishForm from '@/screens/addWallet/FinishForm.vue';
import { Components } from '@/router/routes';
import { useNotify } from '@/plugins/soramitsuUI';

const router = useRouter();
const notify = useNotify();
const { t } = useI18n();
const isWalletAlreadyExists = ref(false);
const qr = ref<string | null>(null);
const showFinishForm = ref(false);

onMounted(async () => {
  const res = await walletConnectDappInitSession();

  if (res) {
    qr.value = res;

    walletConnectDappSubscribeSession(res, ({ status, message }) => {
      if (status) showFinishForm.value = true;

      if (!status) {
        if (message === 'rejected') {
          notify({
            title: t('mobileConnector.rejected').toString(),
            message: '',
            type: 'warning',
          });

          return router.back();
        }

        if (message === 'duplicate') isWalletAlreadyExists.value = true;
      }
    });
  }
});

const connectionStatus = computed(() => {
  if (isWalletAlreadyExists.value) return 'wallet_exists';

  return false;
});

const isQRPrep = computed(() => !connectionStatus.value && qr);

const onClose = () => router.back();
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
}
</style>
