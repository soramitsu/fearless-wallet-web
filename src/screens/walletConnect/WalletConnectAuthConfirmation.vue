<template>
  <AboveForm :fullScreen="true">
    <Scroll>
      <div class="auth-confirmation">
        <WalletConnectHeader :name="title" :url="url" />
        <AppPermissions />
        <ContentForm class="namespaces-form">
          <div class="namespaces">
            <span>{{ $t('walletConnect.networks') }}</span>
            <div class="namespaces__icons">
              <ExternalLogo v-for="(namespace, index) in namespaces" :name="namespace.icon" :width="28" :key="index" />
            </div>
          </div>
        </ContentForm>
        <ContentForm class="namespaces-form">
          <div class="namespaces">
            <span>{{ $t('walletConnect.networks') }}</span>
            <div class="namespaces__icons">
              <ExternalLogo v-for="(namespace, index) in namespaces" :name="namespace.icon" :width="28" :key="index" />
            </div>
          </div>
        </ContentForm>
      </div>
    </Scroll>
    <div class="controls">
      <FButton text="walletConnect.reject" type="secondary" :border="false" width="100%" @click="onReject" />
      <FButton text="walletConnect.approve" width="100%" @click="onApprove" />
    </div>
  </AboveForm>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, set } from 'vue';
import { useRouter } from 'vue-router/composables';
import { useI18n } from 'vue-i18n-composable';
import WalletConnectHeader from './WalletConnectHeader.vue';
import AppPermissions from './AppPermissions.vue';
import type { ChainData } from './types';
import type { WalletConnectSessionRequest } from '@extension-base/services/wallet-connect-service/types';
import type { AccountJson } from '@extension-base/background/types';
import { useStore, type WalletInfo } from '@/store';
import { approveWalletConnectSession, rejectWalletConnectSession } from '@/extension/messaging';
import { useNotify } from '@/plugins/soramitsuUI';
import { transformNamespaces } from '@/util/walletConnect';

const router = useRouter();
const store = useStore();
const notify = useNotify();

const state = ref<Record<string, WalletInfo>>({});

const request = computed<WalletConnectSessionRequest>(() => store.getters.wcConnectRequests[0]);
const id = computed(() => request.value.id);
const url = computed(() => request.value.url);
const title = computed(() => request.value.request.params.proposer.metadata.name);

onMounted(() => {
  const accounts = store.getters.getAccounts as AccountJson[];
  accounts
    .filter(({ ethereumAddress, isMobile }) => ethereumAddress !== '' && !isMobile)
    .forEach(({ name, ethereumAddress }, index) => {
      set(state.value, name, {
        name,
        address: ethereumAddress,
        active: index === 0,
      });
    });
});

const namespaces = computed<ChainData[]>(() => {
  if (!request.value) return [];

  const requiredNamespaces = request.value.request.params.requiredNamespaces;
  const optionalNamespaces = request.value.request.params.optionalNamespaces;

  const transformedRequiredNamespaces = transformNamespaces(requiredNamespaces);
  const transformedOptionalNamespaces = transformNamespaces(optionalNamespaces);

  return [...transformedRequiredNamespaces, ...transformedOptionalNamespaces];
});

const selectedAccounts = computed(() => Object.values(state.value).map((el) => el.address));

// const onSelect = (value: boolean, name: string) => {
//   state.value[name].active = value;

//   Object.keys(state.value).forEach((key) => {
//     if (key !== name) state.value[key].active = false;
//   });
// };

const { t } = useI18n();

const onApprove = async () => {
  const result = await approveWalletConnectSession({ accounts: selectedAccounts.value, id: id.value });

  if (!result)
    notify({
      message: t('walletConnect.notifications.sessionExpired.message').toString(),
      title: t('walletConnect.notifications.sessionExpired.title').toString(),
      type: 'warn',
    });

  router.back();
};

const onReject = () => {
  rejectWalletConnectSession({ id: id.value });

  router.back();
};
</script>

<style lang="scss" scoped>
.controls {
  display: flex;
  flex-direction: row;
  gap: 10px;
  width: 100%;
}

.auth-confirmation {
  display: flex;
  align-items: center;
  height: 400px;
  justify-content: space-between;
  flex-direction: column;
  gap: 5px;
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

  &__icons {
    display: flex;
    flex-flow: row nowrap;
    gap: 7px;
  }
}
</style>
