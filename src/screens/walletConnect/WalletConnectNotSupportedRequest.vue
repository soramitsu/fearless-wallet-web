<template>
  <AboveForm :fullScreen="true">
    <div class="unsupported-form">
      <div class="wc-request">
        <WalletConnectHeader :title="title" :url="url" />
      </div>
      <div class="alert">
        <Alert
          headerText="walletConnect.unknownMethod"
          :message="$t('walletConnect.unsupportedMethod', { name: method })"
          sizeText="small"
        />
      </div>
      <FButton text="common.reject" type="secondary" :border="false" width="100%" @click="onReject" />
    </div>
  </AboveForm>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '@/locales/useI18n';
import WalletConnectHeader from '@/screens/walletConnect/WalletConnectHeader.vue';
import { rejectWalletConnectSession } from '@/extension/messaging';
import { useExtensionStore } from '@/stores/extension';

const extensionStore = useExtensionStore();
const router = useRouter();
const { t } = useI18n();

const request = extensionStore.wcNotSupportedRequests[0];

const id = computed(() => request.id);
const url = computed(() => request.url);
const title = computed<string>(() => t('walletConnect.txRequestTitle', { url: origin }).toString());
const method = request.request.params.request.method;

const onReject = () => {
  rejectWalletConnectSession({ id: id.value });

  router.back();
};
</script>

<style lang="scss" scoped>
.unsupported-form {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  gap: 10px;
  word-break: break-word;
}

.controls {
  display: flex;
  flex-direction: row;
  gap: 10px;
}

.namespaces-form {
  width: 100%;
}
.alert {
  width: 500px;
}
.namespaces {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  width: 100%;
  font-size: 1em;
  font-weight: 400;
  color: $default-white;
}

.wc-request {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-direction: column;
  padding-left: 10px;
  padding-right: 10px;
}
</style>
