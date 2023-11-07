<template>
  <Fragment>
    <AboveForm v-if="!showWalletSelect" :fullScreen="true" @closeHandler="onReject">
      <div class="scroll__container">
        <Scroll>
          <div class="auth-confirmation">
            <WalletConnectHeader :title="title" :url="url" />
            <AppPermissions v-if="isSupportNetwork" />
            <div v-else class="alert">
              <Alert
                headerText="walletConnect.requiredNetworkAlert.header"
                message="walletConnect.requiredNetworkAlert.message"
                sizeText="small"
              />
            </div>

            <ContentForm v-if="isSupportNetwork" class="width-100" @click.native="toggleWalletSelectForm">
              <div class="wallet">
                <Icon icon="wallet-logo-transaction" class="wallet__logo" />

                <span class="wallet__name">{{ selectedWalletName }}</span>
                <span class="wallet__address">{{ cutAddress }}</span>

                <Icon icon="chevron-right" class="wallet__icon" />
              </div>
            </ContentForm>

            <ContentForm v-if="isSupportNetwork" class="namespaces-form" :bottomRightCorner="true">
              <div class="namespaces">
                <span>{{ $t('common.networks') }}</span>
                <div class="namespaces__icons">
                  <ExternalLogo
                    v-for="(namespace, index) in namespaces"
                    :name="namespace.icon"
                    :width="28"
                    :key="index"
                  />
                </div>
              </div>
            </ContentForm>
          </div>
        </Scroll>
      </div>
      <div class="controls">
        <FButton
          text="common.reject"
          :type="isSupportNetwork ? 'secondary' : 'primary'"
          :border="false"
          width="100%"
          @click="onReject"
        />
        <FButton v-if="isSupportNetwork" text="common.approve" width="100%" @click="onApprove" />
      </div>
    </AboveForm>
    <NotificationPopup
      v-if="showNotificationPopup"
      :headers="notificationPopupMessage"
      acceptButtonText="common.approve"
      :showAcceptButton="true"
      :showRejectButton="true"
      @handlerClose="onReject"
      @handlerAccept="onApprove"
    />
    <WalletChooseForm
      v-if="showWalletSelect"
      :selectedAddress="selectedAddress"
      @onSelect="onSelectWallet"
      @onClose="toggleWalletSelectForm"
    />
  </Fragment>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router/composables';
import { useI18n } from 'vue-i18n-composable';
import { Fragment } from 'vue-fragment';
import WalletConnectHeader from './WalletConnectHeader.vue';
import AppPermissions from './AppPermissions.vue';
import WalletChooseForm from './WalletChooseForm.vue';
import type { ChainData } from './types';
import type { WalletConnectSessionRequest } from '@extension-base/services/wallet-connect-service/types';
import type { AccountJson } from '@extension-base/background/types/types';
import { useStore } from '@/store';
import { approveWalletConnectSession, rejectWalletConnectSession } from '@/extension/messaging';
import { useNotify } from '@/plugins/soramitsuUI';
import { transformNamespaces } from '@/util/walletConnect';
import { cut } from '@/helpers';
import { Components } from '@/router/routes';
import { WALLET_CONNECT_SUPPORTED_METHODS } from '@/extension/background/extension-base/src/services/wallet-connect-service/consts';
const notificationPopupMessage = {
  subtext: 'walletConnect.unsupportedMethodsPopup',
  text: ``,
};
const showNotificationPopup = ref(false);
const router = useRouter();
const store = useStore();
const notify = useNotify();
const { t } = useI18n();
const wallets = ref<AccountJson[]>(
  (store.getters.getAccounts as AccountJson[]).filter((el) => el.ethereumAddress && !el.isMobile)
);
const selectedAddress = ref<string>(wallets.value[0].ethereumAddress);
const cutAddress = computed(() => cut(selectedAddress.value));
const selectedWalletName = computed(
  () => wallets.value.find(({ ethereumAddress }) => ethereumAddress === selectedAddress.value)?.name ?? ''
);
const request = computed<WalletConnectSessionRequest>(() => store.getters.wcConnectRequests[0]);
const id = computed(() => request.value.id);
const url = computed(() => request.value.url);
const title = computed(() => request.value.request.params.proposer.metadata.name);
const showWalletSelect = ref(false);
const isSupportAllMethods = computed(() => {
  for (const namespace of Object.values(request.value.request.params.requiredNamespaces)) {
    for (const method of namespace.methods) {
      if (!WALLET_CONNECT_SUPPORTED_METHODS.some((el) => el === method)) return false;
    }
  }

  return true;
});

const toggleWalletSelectForm = () => {
  showWalletSelect.value = !showWalletSelect.value;
};

const onSelectWallet = (value: string) => {
  selectedAddress.value = value;
};

const namespaces = computed<ChainData[]>(() => {
  if (!request.value) return [];

  const requiredNamespaces = request.value.request.params.requiredNamespaces;
  const optionalNamespaces = request.value.request.params.optionalNamespaces;
  const transformedRequiredNamespaces = transformNamespaces(requiredNamespaces, true);
  if (transformedRequiredNamespaces.length === 0) return [];
  const transformedOptionalNamespaces = transformNamespaces(optionalNamespaces, false);
  const result = [...transformedRequiredNamespaces, ...transformedOptionalNamespaces];
  const arrSet = new Map();

  result.forEach((el) => {
    if (arrSet.has(el.name)) return;
    arrSet.set(el.name, el);
  });

  return Array.from(arrSet.values()) as unknown as ChainData[];
});

const isSupportNetwork = computed(() => namespaces.value.length !== 0);

const onApprove = async () => {
  if (!isSupportAllMethods.value && !showNotificationPopup.value) {
    showNotificationPopup.value = true;

    return;
  }

  const { message, title, status } = await approveWalletConnectSession({
    accounts: [selectedAddress.value],
    id: id.value,
  });

  notify({
    message: t(message).toString(),
    title: t(title).toString(),
    type: status ? 'success' : 'warning',
  });

  router.push(Components.Wallet);
};

const onReject = () => {
  rejectWalletConnectSession({ id: id.value });

  router.back();
};
</script>

<style lang="scss" scoped>
.wallet {
  display: grid;
  grid-template-columns: 24px max-content 3fr;
  grid-template-rows: 1fr;
  grid-template-areas:
    'logo name chevron'
    'logo address chevron';
  place-items: center;
  width: 100%;
  padding: 16px;
  column-gap: 10px;
  cursor: pointer;

  &__name {
    grid-area: name;
    font-size: 16px;
    color: $default-white;
    line-height: 22px;
    place-self: start;
  }

  &__address {
    grid-area: address;
    color: $gray-color;
    font-size: 12px;
    line-height: 16px;
    place-self: flex-start;
  }
  &__logo {
    grid-area: logo;
    width: 24px;
    height: 24px;
  }

  &__icon {
    grid-area: chevron;
    place-self: center flex-end;
    width: 18px;
    height: 18px;
  }
}
.controls {
  display: flex;
  flex-direction: row;
  gap: 10px;
  width: 100%;
}
.scroll__container {
  height: 460px;
  overflow-y: hidden;
}
.auth-confirmation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-direction: column;
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

  &__icons {
    display: flex;
    flex-flow: row nowrap;
    gap: 7px;
  }
}
.warning-container {
  display: flex;
  align-items: center;
  flex-direction: column;
  padding-top: 20px;
  padding-bottom: 20px;
  gap: 10px;
}
.warning--orange {
  color: $simple-orange-color;
}
.warning-text {
  max-width: 400px;
  color: $gray-color;
}
.icon {
  width: 64px;
  height: 64px;
}
.width-100 {
  width: 100%;
}
.alert {
  width: 500px;
}
</style>
