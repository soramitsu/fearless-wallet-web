<template>
  <AboveForm :fullScreen="true">
    <div class="unsupported-form">
      <div class="wc-request">
        <WalletConnectHeader :title="title" :url="url" />
      </div>
      <div class="alert">
        <Alert
          headerText="walletConnect.unknownMethod"
          :message="$t('walletConnect.unsupportedMethod', { name: 'personal_sign' })"
          sizeText="small"
        />
      </div>
      <FButton text="common.reject" type="secondary" :border="false" width="100%" @click="onReject" />
    </div>
  </AboveForm>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router/composables';
import { useI18n } from 'vue-i18n-composable';
import type { WalletConnectNotSupportRequest } from '@extension-base/services/wallet-connect-service/types';
import WalletConnectHeader from '@/screens/walletConnect/WalletConnectHeader.vue';
// import { useStore } from '@/store';
import { rejectWalletConnectSession } from '@/extension/messaging';

// const store = useStore();
const router = useRouter();
const { t } = useI18n();
const [request]: WalletConnectNotSupportRequest[] = [
  {
    id: 'q242',
    url: 'https://react-app.walletconnect.com',
    isInternal: false,
    request: [
      {
        id: 1698400179552316,
        topic: '3bfa8b5cd794d5801ad0d174499ec9b3baf087381464d0733fdffb5a198b6273',
        params: {
          request: {
            method: 'eth_sendTransaction',
            params: [
              {
                from: '0x599dC6fD485E0eD55C1BCc7D8AE02EDAF7bE4f4e',
                to: '0x599dC6fD485E0eD55C1BCc7D8AE02EDAF7bE4f4e',
                data: '0x',
                nonce: '0xad',
                gasPrice: '0x18',
                gasLimit: '0x5208',
                value: '0x00',
              },
            ],
          },
          chainId: 'eip155:5',
        },
        verifyContext: {
          verified: {
            verifyUrl: 'https://verify.walletconnect.com',
            validation: 'UNKNOWN',
            origin: 'https://react-app.walletconnect.com',
          },
        },
      },
    ] as any,
  },
];

const id = computed(() => request.id);
const url = computed(() => request.url);
const title = computed<string>(() => t('walletConnect.txRequestTitle', { url: origin }).toString());

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
  font-size: 16px;
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
