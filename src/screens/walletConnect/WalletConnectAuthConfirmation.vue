<template>
  <Fragment>
    <AboveForm v-if="!showWalletSelect" :fullScreen="true" @closeHandler="onReject">
      <div class="scroll__container">
        <Scroll>
          <div class="auth-confirmation">
            <WalletConnectHeader :name="title" :url="url" />
            <AppPermissions />

            <ContentForm
              v-if="isSupportNetwork"
              class="namespaces-form"
              :bottomRightCorner="true"
              @click.native="toggleWalletSelectForm"
            >
              <div class="wallet">
                <Icon icon="wallet-logo-transaction" class="wallet__logo" />

                <span class="wallet__name">{{ selectedWalletName }}</span>
                <span class="wallet__address">{{ cutAddress }}</span>

                <Icon icon="chevron-right" class="wallet__icon" />
              </div>
            </ContentForm>

            <ContentForm class="namespaces-form" :bottomRightCorner="true">
              <div class="namespaces">
                <span>{{ $t('common.networks') }}</span>
                <div class="namespaces__icons">
                  <div v-if="!isSupportNetwork">{{ $t('walletConnect.noNetworkSupport') }}</div>
                  <template v-else>
                    <ExternalLogo
                      v-for="(namespace, index) in namespaces"
                      :name="namespace.icon"
                      :width="28"
                      :key="index"
                    />
                  </template>
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
import type { AccountJson } from '@extension-base/background/types';
import { useStore } from '@/store';
import { approveWalletConnectSession, rejectWalletConnectSession } from '@/extension/messaging';
import { useNotify } from '@/plugins/soramitsuUI';
import { transformNamespaces } from '@/util/walletConnect';
import { cut } from '@/helpers';
import { Components } from '@/router/routes';

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
  const transformedRequiredNamespaces = transformNamespaces(requiredNamespaces);
  const transformedOptionalNamespaces = transformNamespaces(optionalNamespaces);

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
  const { message, title } = await approveWalletConnectSession({
    accounts: [selectedAddress.value],
    id: id.value,
  });

  notify({
    message: t(message).toString(),
    title: t(title).toString(),
    type: 'warn',
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
  padding: 6px;
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
</style>
