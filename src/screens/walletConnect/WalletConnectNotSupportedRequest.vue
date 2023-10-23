<template>
  <AboveForm :fullScreen="true">
    <div class="form">
      <WalletConnectHeader :name="title" :url="url" />

      <ContentForm class="namespaces-form" :bottomRightCorner="true">
        <div class="namespaces">
          <span>{{ $t('common.networks') }}</span>
          <div class="namespaces__icons">{{ $t('walletConnect.noNetworkSupport') }}</div>
        </div>
      </ContentForm>
      <FButton text="walletConnect.reject" type="secondary" :border="false" width="100%" @click="onReject" />
    </div>
  </AboveForm>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router/composables';
import type { WalletConnectNotSupportRequest } from '@extension-base/services/wallet-connect-service/types';
import WalletConnectHeader from '@/screens/walletConnect/WalletConnectHeader.vue';
import { useStore } from '@/store';
import { rejectWalletConnectSession } from '@/extension/messaging';

const store = useStore();
const router = useRouter();

const [request]: WalletConnectNotSupportRequest[] = store.getters.wcNotSupportedRequests;

const id = computed(() => request.id);
const url = computed(() => request.url);
const title = computed(() => request.request.verifyContext.verified.origin);

const onReject = () => {
  rejectWalletConnectSession({ id: id.value });

  router.back();
};
</script>

<style lang="scss" scoped>
.form {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.controls {
  display: flex;
  flex-direction: row;
  gap: 10px;
}

.namespaces-form {
  width: 100%;
}
.namespaces {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  width: 100%;
  font-size: 16px;
  font-weight: 400;
  color: $default-white;
}
</style>
