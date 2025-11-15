<template>
  <header class="header">
    <div ref="walletNameRef" class="header-part header-part-left" @click="toggleSelectWalletPopupVisible">
      <div class="logo-container">
        <CircleButton
          v-if="showBackIcon"
          backgroundColor="light-black"
          iconName="chevron-left"
          data-testid="backBtn"
          @click.stop="back"
        />

        <Logo v-else :showWalletLogo="true" size="mini" />
      </div>

      <div class="wallet-name">
        <div class="name" @click.stop="toggleSelectWalletPopupVisible">
          <span class="wallet-title" data-testid="walletNameHeader">{{ name }}</span>
          <Icon v-if="isMobile" icon="mobile" className="mobile" />
          <Rotate :isActive="syncedShowSelectWalletPopup">
            <SIcon name="chevron-bottom-16" />
          </Rotate>
        </div>

        <div v-if="isAddressExists" class="copy-address" data-testid="copyAddress" @click.stop="copyAddress">
          <span>{{ cutAddress }}</span>

          <Icon icon="copy" className="copy" />

          <Tooltip text="common.copied" target=".copy-address" placement="top-end" trigger="click" />
        </div>
      </div>

      <Tooltip text="header.walletManagement" target=".header-part-left" placement="right" />
    </div>

    <div class="header-part header-part-right">
      <CircleButton
        v-if="isPopup"
        iconName="expand"
        backgroundColor="light-black"
        tooltipText="common.fullScreen"
        target=".expand"
        placement="bottom"
        @click="openFullScreen"
      />

      <NetworkManagementButton
        class="background-ellipse network-management"
        :isGroupIcon="isGroup"
        :icon="selectedNetworkIcon"
        :selectedNetwork="networkManagementButtonText"
        :isDisable="isDisableNetworkManagementButton"
        data-testid="selectNetwork"
        @onToggle="toggleSelectNetworkPopupVisible"
      />

      <div v-if="isPopup" class="background-ellipse connection" @click="toggleConnectionPopup">
        <Loading v-if="!extensionStore.tabStatus" :width="16" />

        <template v-else>
          <div class="connect" :class="statusConnectedClasses"></div>
        </template>
      </div>

      <ConnectionPopup
        v-if="showConnectionPopup"
        :tabStatus="extensionStore.tabStatus"
        @handlerClose="toggleConnectionPopup"
      />

      <Tooltip text="header.connectionStatus" target=".connection" placement="top" />
      <Tooltip :text="accountsStore.selectedNetwork" target=".network-management" placement="top" />

      <CircleButton
        ref="settingsButtonRef"
        iconName="settings"
        size="big"
        backgroundColor="none"
        placement="left"
        target=".settings"
        tooltipText="header.settingsAndManagement"
        data-testid="settings"
        @click="toggleSettingsVisible"
      />

      <NetworkManagement
        v-if="showSelectNetworkPopup"
        :type="accountsStore.selectedNetwork"
        @handlerClose="toggleSelectNetworkPopupVisible"
      />
    </div>
  </header>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { ComponentPublicInstance } from 'vue';
import type { TokenGroup } from '@extension-base/background/types/types';
import NetworkManagementButton from '@/screens/main/NetworkManagementButton.vue';
import NetworkManagement from '@/screens/wallet&asset/NetworkManagement.vue';
import { Components } from '@/router/routes';
import BaseApi from '@/util/BaseApi';
import { windowOpen } from '@/extension/messaging';
import ConnectionPopup from '@/screens/main/ConnectionPopup.vue';
import { isNetworkGroup } from '@/helpers/networkGroups';
import { cut, setClipboard } from '@/helpers';
import { IS_POPUP } from '@/consts/globalClient';
import { useExtensionStore } from '@/stores/extension';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

defineOptions({
  name: 'MainHeader',
});

const networksStore = useNetworksStore();
const extensionStore = useExtensionStore();
const accountsStore = useAccountsStore();
const router = useRouter();
const route = useRoute();

const props = defineProps<{
  highlightSettingsIcon: boolean;
  showSelectWalletPopup: boolean;
}>();

const emit = defineEmits<{
  'update:showSelectWalletPopup': [value: boolean];
  toggleSettingsVisible: [];
}>();

const isPopup = IS_POPUP;
const allNetworksIcon = 'all-networks';

const showConnectionPopup = ref(false);
const showSelectNetworkPopup = ref(false);

const walletNameRef = ref<HTMLElement | null>(null);
const settingsButtonRef = ref<ComponentPublicInstance | HTMLElement | null>(null);

const syncedShowSelectWalletPopup = computed({
  get: () => props.showSelectWalletPopup,
  set: (value: boolean) => emit('update:showSelectWalletPopup', value),
});

const showBackIcon = computed(() => route.name === Components.AssetNetworks || route.name === Components.AssetHistory);

const isGroup = computed(() => isNetworkGroup(accountsStore.selectedNetwork));

const isAddressExists = computed(() => {
  if (accountsStore.selectedWallet.isTon) return true;
  if (isGroup.value) return route.name === Components.AssetHistory;

  return true;
});

const selectedAssetId = computed(() => (route.params.assetId as string) ?? '');

const currentCurrency = computed<TokenGroup | undefined>(() =>
  accountsStore.balances.find(
    ({ groupId, balances }) =>
      groupId === selectedAssetId.value || balances.some((el) => el.id === selectedAssetId.value)
  )
);

const isDisableNetworkManagementButton = computed(() => networksStore.networks.length <= 1);

const { t } = useI18n();

const networkManagementButtonText = computed(() => {
  if (isGroup.value) {
    if (route.name === Components.AssetHistory) {
      return networksStore.getNetwork(route.params.selectedNetwork as string)?.name ?? '';
    }

    return t(`header.networkManagement.${accountsStore.selectedNetwork}`);
  }

  return accountsStore.selectedNetwork;
});

const selectedNetworkIcon = computed(() => {
  if (isGroup.value) return allNetworksIcon;

  if (route.name === Components.AssetHistory) {
    const asset = currentCurrency.value?.balances.find((el) => el.id === selectedAssetId.value);

    if (!asset) return '';

    return networksStore.getNetwork(asset.name)?.icon ?? '';
  }

  return networksStore.getNetwork(accountsStore.selectedNetwork)?.icon ?? allNetworksIcon;
});

const address = computed(() => {
  if (!isAddressExists.value) return '';
  if (accountsStore.selectedWallet.address === '') return '';

  const selectedNetwork = isGroup.value ? (route.params.selectedNetwork as string) : accountsStore.selectedNetwork;

  return BaseApi.formatAddress(accountsStore.selectedWallet, selectedNetwork);
});

const cutAddress = computed(() => cut(address.value, 5));

const name = computed(() => accountsStore.selectedWallet.name);

const statusConnectedClasses = computed(() =>
  !extensionStore.tabStatus || !extensionStore.tabStatus.isAuthorize ? 'fail-connect' : 'success-connect'
);

const isMobile = computed(() => Boolean(accountsStore.selectedWallet.isMobile));

const resolveSettingsElement = () => {
  const refValue = settingsButtonRef.value;
  if (!refValue) return null;

  if (refValue instanceof HTMLElement) return refValue;

  return (refValue.$el ?? null) as HTMLElement | null;
};

watch(
  [syncedShowSelectWalletPopup, walletNameRef],
  ([value]) => {
    if (!walletNameRef.value) return;

    walletNameRef.value.style.zIndex = value ? '200' : '0';
  },
  { immediate: true }
);

watch(
  [() => props.highlightSettingsIcon, settingsButtonRef],
  ([value]) => {
    const element = resolveSettingsElement();

    if (!element) return;

    element.style.zIndex = value ? '300' : '0';
  },
  { immediate: true }
);

onMounted(() => {
  extensionStore.fetchTabStatus();
});

const copyAddress = () => {
  setClipboard(address.value);
};

const toggleSelectNetworkPopupVisible = () => {
  showSelectNetworkPopup.value = !showSelectNetworkPopup.value;
};

const toggleConnectionPopup = () => {
  if (!extensionStore.tabStatus) return;

  showConnectionPopup.value = !showConnectionPopup.value;
};

const back = () => {
  router.back();
};

const openFullScreen = () => {
  windowOpen('/');
  window.close();
};

const toggleSettingsVisible = () => {
  emit('toggleSettingsVisible');
};

const toggleSelectWalletPopupVisible = () => {
  syncedShowSelectWalletPopup.value = !syncedShowSelectWalletPopup.value;
};
</script>

<style lang="scss" scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: $header-height;
  min-height: $header-height;
  margin-bottom: 16px;
  gap: 2px;

  .logo-container {
    width: 48px;
    margin: auto;
  }

  i {
    color: $grayish-white;
  }

  .s-icon-arrows-arrows-diagonals-bltr-24 {
    font-size: 1.125em !important;
  }

  .header-part-right {
    gap: 4px;
    justify-content: flex-end;
    align-items: center;
  }

  .header-part-left {
    gap: 10px;

    &:hover {
      cursor: pointer;
    }
  }

  .header-part {
    display: flex;

    &:hover {
      cursor: pointer;
    }

    .wallet-name {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      flex-direction: column;

      .name {
        display: flex;
        max-width: 190px;
        font-weight: 700;
        font-size: 1.5em;
        align-items: center;
        overflow: hidden;
        text-overflow: ellipsis;
        column-gap: 6px;

        .wallet-title {
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }
      }
      .copy-address {
        display: flex;
        flex-flow: row nowrap;
        align-items: center;
        gap: 8px;
        font-size: 0.75rem;
        font-weight: 400;
        color: $default-white;
      }
    }

    .s-icon-chevron-bottom-16 {
      margin-top: 5px;
    }

    .background-ellipse {
      display: flex;
      align-items: center;
      height: 32px;
      padding: 8px;
      font-size: 0.75rem;
      line-height: 18px;
      border-radius: 20px;
      background-color: $default-background-color;
      user-select: none;
    }
  }

  .connect {
    width: 16px;
    height: 16px;
    border-radius: 50%;
  }

  .network-management {
    justify-content: space-between;
    width: 137px;
    height: 32px;
    display: flex;
    gap: 4px;
  }

  .icon--down {
    height: 9px;
    width: 9px;
  }

  .copy {
    filter: invert(0.5);
    width: 20px;
    height: 20px;
  }

  .success-connect {
    background-color: #00ee77;
  }

  .fail-connect {
    background-color: $gray-color;
  }
  .mobile {
    width: 18px;
    height: 18px;
  }
}
</style>
