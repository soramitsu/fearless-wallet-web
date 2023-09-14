<template>
  <Fragment>
    <AboveForm v-if="!showWalletSelect" :fullScreen="true">
      <div class="scroll__container">
        <Scroll>
          <div class="auth-confirmation">
            <WalletConnectHeader :name="title" :url="url" />
            <AppPermissions />

            <ContentForm class="namespaces-form" :bottomRightCorner="true" @click.native="toggleWalletSelectForm">
              <div class="wallet">
                <Icon icon="wallet-logo-transaction" class="wallet__logo" />

                <span class="wallet__name">{{ selectedWalletName }}</span>
                <span class="wallet__address">{{ cutAddress }}</span>

                <Icon icon="chevron-right" class="wallet__icon" />
              </div>
            </ContentForm>
            <ContentForm class="namespaces-form" :bottomRightCorner="true">
              <div class="namespaces">
                <span>{{ $t('walletConnect.networks') }}</span>
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
        <FButton text="walletConnect.reject" type="secondary" :border="false" width="100%" @click="onReject" />
        <FButton text="walletConnect.approve" width="100%" @click="onApprove" />
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
import { computed, onMounted, ref, set } from 'vue';
import { useRouter } from 'vue-router/composables';
import { useI18n } from 'vue-i18n-composable';
import { Fragment } from 'vue-fragment';
import WalletConnectHeader from './WalletConnectHeader.vue';
import AppPermissions from './AppPermissions.vue';
import WalletChooseForm from './WalletChooseForm.vue';
import type { ChainData } from './types';
import type { WalletConnectSessionRequest } from '@extension-base/services/wallet-connect-service/types';
import type { AccountJson } from '@extension-base/background/types';
import { useStore, type WalletInfo } from '@/store';
import { approveWalletConnectSession, rejectWalletConnectSession } from '@/extension/messaging';
import { useNotify } from '@/plugins/soramitsuUI';
import { transformNamespaces } from '@/util/walletConnect';
import { cut } from '@/helpers';
const router = useRouter();
const store = useStore();
const notify = useNotify();
const selectedAddress = ref<string>(store.getters.getSelectedWallet.ethereumAddress);
const wallets = ref<AccountJson[]>(store.getters.getAccounts);
const state = ref<Record<string, WalletInfo>>({});
const cutAddress = computed(() => {
  return cut(selectedAddress.value);
});
const selectedWalletName = computed(() => {
  return wallets.value.find((el) => el.ethereumAddress === selectedAddress.value)?.name ?? '';
});
const request = computed<WalletConnectSessionRequest>(() => store.getters.wcConnectRequests[0]);
const id = computed(() => request.value.id);
const url = computed(() => request.value.url);
const title = computed(() => request.value.request.params.proposer.metadata.name);
const showWalletSelect = ref(false);

const toggleWalletSelectForm = () => {
  const prepValue = !showWalletSelect.value;
  showWalletSelect.value = prepValue;
};

const onSelectWallet = (value: string) => {
  selectedAddress.value = value;
};

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
