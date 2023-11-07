<template>
  <AboveForm :fullScreen="true" :header="header" @closeHandler="close">
    <template v-if="isQRPrep">
      <h2 class="header">{{ $t('mobileConnector.qrHeader') }}</h2>

      <QR :payload="qr" />
    </template>

    <div v-show="isLoading && !isActiveAccountExists" class="loader">
      <Loader />
    </div>

    <PermissionRequestPopup
      v-if="connectionStatus"
      :status="connectionStatus"
      :requestResponse="requestResponse"
      :requestInfo="requestInfo"
    />
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router/composables';
import PermissionRequestPopup from '@/screens/mobileConnect/PermissionRequestPopup.vue';
import { walletConnectDappInitSession } from '@/extension/messaging';
const router = useRouter();

const requestInfo: null = null;
const requestResponse: null = null;
const isLoading = false;
const isPaired = false;
const isPermissionsGranted = false;
const isWalletAlreadyExists = false;
const isActiveAccountExists = false;
const isPossibleConnectionProblem = false;
const permissionRequestDenied = false;
const qr = ref<string | null>(null);

onMounted(async () => {
  const res = await walletConnectDappInitSession((data) => {
    if (data) qr.value = data;
    else qr.value = null;
  });

  if (res) qr.value = res;
});

const connectionStatus = computed(() => {
  if (isActiveAccountExists) return 'active_account_exists';
  if (isPossibleConnectionProblem && !isPermissionsGranted) return 'reset_form';
  if (isPermissionsGranted) return 'success';
  if (isWalletAlreadyExists) return 'wallet_exists';
  if (permissionRequestDenied) return 'failed';

  return false;
});

const isQRPrep = computed(() => !connectionStatus.value && qr && !isLoading);

const close = () => router.back();

const isPermissionRequestResolved = computed(
  () => connectionStatus.value === 'success' || connectionStatus.value === 'failed'
);

const header = computed(() => {
  if (isPaired && !isPermissionRequestResolved.value) return 'mobileConnector.requesting';

  if (isPermissionRequestResolved.value) return '';

  return 'welcome.connectMobile';
});
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
</style>
