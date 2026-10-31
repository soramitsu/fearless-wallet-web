<template>
  <header class="header">
    <div class="header-part header-part-left" :ref="walletNameRef">
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
        <button type="button" class="name" :aria-label="`${$t('header.walletManagement')}: ${name}`" :aria-expanded="syncedShowSelectWalletPopup" @click.stop="toggleSelectWalletPopupVisible">
          <span class="wallet-title" data-testid="walletNameHeader">{{ name }}</span>
          <Icon v-if="isMobile" icon="mobile" className="mobile" />
          <Rotate :isActive="syncedShowSelectWalletPopup">
            <Icon icon="down" width="12px" height="10px" />
          </Rotate>
        </button>

        <button v-if="isAddressExists" type="button" class="copy-address" :aria-label="$t('common.copyToClipboard')" data-testid="copyAddress" @click.stop="copyAddress">
          <span>{{ cutAddress }}</span>

          <Icon icon="copy" className="copy" />

          <Tooltip text="common.copied" target=".copy-address" placement="top-end" trigger="click" />
        </button>
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

      <!-- The dock carries Settings whenever a wallet is open; the header keeps it only without the dock. -->
      <CircleButton
        v-if="showSettingsButton"
        :class="{ 'settings-highlighted': highlightSettingsIcon }"
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

<script lang="ts">
import { defineComponent } from 'vue';

import NetworkManagementButton from '@/screens/main/NetworkManagementButton.vue';
import NetworkManagement from '@/screens/wallet&asset/NetworkManagement.vue';
import { Components } from '@/router/routes';
import BaseApi from '@/util/BaseApi';
import { windowOpen } from '@/extension/messaging';
import ConnectionPopup from '@/screens/main/ConnectionPopup.vue';
import { isNetworkGroup } from '@/helpers/common';
import { cut, setClipboard } from '@/helpers';
import { IS_POPUP, IS_SIDE_PANEL } from '@/consts/globalClient';
import { followActiveTab } from '@/extension/activeTab';
import { useExtensionStore } from '@/stores/extension';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { usePortfolioDashboardStore } from '@/stores/portfolioDashboard';
import { PORTFOLIO_DASHBOARD_ENABLED } from '@/portfolio/dashboard/dashboardFlag';
import { registerDashboardMessages } from '@/portfolio/dashboard/locales';
import { effectiveScope } from '@/portfolio/dashboard/preferences';

export default defineComponent({ name: 'Header',
  components: {
    ConnectionPopup,
    NetworkManagement,
    NetworkManagementButton,
  },
  props: {
    highlightSettingsIcon: Boolean,
    showSelectWalletPopup: { type: Boolean },
    showSettingsButton: { type: Boolean, default: true },
  },
  data() {
    // Before the first render, so the header never shows a key: the dashboard's strings are not in translation.json.
    if (PORTFOLIO_DASHBOARD_ENABLED) registerDashboardMessages();

    return {
      walletNameRef: 'walletName',
      isPopup: IS_POPUP,
      isSidePanel: IS_SIDE_PANEL,
      stopFollowingTabs: undefined as (() => void) | undefined,
      allNetworksIcon: 'all-networks',
      networksStore: useNetworksStore(),
      extensionStore: useExtensionStore(),
      accountsStore: useAccountsStore(),
      dashboardStore: PORTFOLIO_DASHBOARD_ENABLED ? usePortfolioDashboardStore() : undefined,
      showConnectionPopup: false,
      showSelectNetworkPopup: false,
    };
  },
  computed: {
    showBackIcon() {
      const route = this.$route.name;

          return (
            route === Components.AssetNetworks ||
            route === Components.AssetHistory ||
            route === Components.TokenLocations ||
            route === Components.TokenOverview
          );
    },
    // Behind a build flag (src/portfolio/dashboard): on the portfolio, All wallets is named instead of one wallet.
    showsAllWallets(): boolean {
      if (!this.dashboardStore) return false;

      const route = this.$route.name;

      return (
        (route === Components.Wallet ||
          route === Components.Currencies ||
          route === Components.Nfts ||
          route === Components.PortfolioAllocation) &&
        effectiveScope(this.dashboardStore.preferences.scope, this.accountsStore.accounts.length) === 'all'
      );
    },
    isAddressExists() {
      if (this.showsAllWallets) return false;

      if (this.accountsStore.selectedWallet.isTon) return true;

          if (this.isGroup) return this.routeName === Components.AssetHistory;

          return true;
    },
    routeName() {
      return this.$route.name;
    },
    routeParams() {
      return this.$route.params;
    },
    isGroup() {
      return isNetworkGroup(this.accountsStore.selectedNetwork);
    },
    selectedAssetId() {
      return this.$route.params.assetId ?? '';
    },
    currentCurrency() {
      return this.accountsStore.balances.find(
            ({ groupId, balances }) =>
              groupId === this.selectedAssetId || balances.some((el) => el.id === this.selectedAssetId)
          );
    },
    isDisableNetworkManagementButton() {
      return this.networksStore.networks.length <= 1;
    },
    networkManagementButtonText() {
      if (this.isGroup) {
            if (this.$route.name === Components.AssetHistory)
              return this.networksStore.getNetwork(this.$route.params.selectedNetwork)?.name;

            return this.$t(`header.networkManagement.${this.accountsStore.selectedNetwork}`);
          }

          return this.accountsStore.selectedNetwork;
    },
    selectedNetworkIcon() {
      if (this.isGroup) return this.allNetworksIcon;

          if (this.$route.name === Components.AssetHistory) {
            const asset = this.currentCurrency?.balances.find((el) => el.id === this.selectedAssetId);

            if (!asset) return '';

            return this.networksStore.getNetwork(asset?.name).icon;
          }

          const network = this.networksStore.getNetwork(this.accountsStore.selectedNetwork);

          if (network) return network.icon;

          return this.allNetworksIcon;
    },
    cutAddress() {
      return cut(this.address, 5);
    },
    decimals() {
      return this.networksStore.getNetwork(this.accountsStore.selectedNetwork)?.addressPrefix;
    },
    address() {
      if (!this.isAddressExists) return '';

          if (this.accountsStore.selectedWallet.address === '') return '';

          const selectedNetwork = this.isGroup ? this.routeParams.selectedNetwork : this.accountsStore.selectedNetwork;

          return BaseApi.formatAddress(this.accountsStore.selectedWallet, selectedNetwork);
    },
    name() {
      return this.showsAllWallets ? this.$t('portfolioDashboard.allWallets') : this.accountsStore.selectedWallet.name;
    },
    statusConnectedClasses() {
      return !this.extensionStore.tabStatus || !this.extensionStore.tabStatus.isAuthorize
            ? 'fail-connect'
            : 'success-connect';
    },
    statusConnectedText() {
      return !this.extensionStore.tabStatus || !this.extensionStore.tabStatus.isAuthorize
            ? 'header.notConnected'
            : 'header.connected';
    },
    isMobile() {
      return !!this.accountsStore.selectedWallet.isMobile;
    },
    syncedShowSelectWalletPopup: {
      get() {
        return this.showSelectWalletPopup;
      },
      set(value) {
        this.$emit('update:showSelectWalletPopup', value);
      },
    },
  },
  watch: {
    "syncedShowSelectWalletPopup": 'updateZIndexSelectWalletPopup',
  },
  async mounted() {
    if (!this.isPopup) return;
    // The side panel stays open while the person moves between tabs and sites.
    if (this.isSidePanel) this.stopFollowingTabs = followActiveTab(() => this.extensionStore.fetchTabStatus());
    await this.extensionStore.fetchTabStatus();
  },
  unmounted() {
    this.stopFollowingTabs?.();
  },
  methods: {
    copyAddress() {
      setClipboard(this.address);
    },
    toggleSelectNetworkPopupVisible() {
      this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
    },
    updateZIndexSelectWalletPopup() {
      const targetElement = this.$refs[this.walletNameRef] as HTMLElement;

          targetElement.style.zIndex = this.syncedShowSelectWalletPopup ? '200' : '0';
    },
    toggleConnectionPopup() {
      if (!this.extensionStore.tabStatus) return;

          this.showConnectionPopup = !this.showConnectionPopup;
    },
    back() {
      this.$router.back();
    },
    openFullScreen() {
      windowOpen('/');
          // The side panel stays beside the new tab; the popup would close anyway.
          if (!this.isSidePanel) window.close();
    },
    toggleSettingsVisible() {
      this.$emit('toggleSettingsVisible');
    },
    toggleSelectWalletPopupVisible() {
      this.syncedShowSelectWalletPopup = !this.syncedShowSelectWalletPopup;
    },
  },
});
</script>

<style lang="scss" scoped>
.settings-highlighted :deep(button) {
  background: palette($secondary-background-color, var(--fw-select-fill));
}
</style>

<style lang="scss" scoped>
.name,
.copy-address {
  appearance: none;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-height: 44px;
}

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
    flex-shrink: 0;
    margin: auto;
  }

  i {
    color: $grayish-white;
  }

  .s-icon-arrows-arrows-diagonals-bltr-24 {
    font-size: 1.125em !important;
  }

  .header-part-right {
    flex-shrink: 0;
    gap: 4px;
    justify-content: flex-end;
    align-items: center;
  }

  .header-part-left {
    flex: 1;
    min-width: 0;
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
      min-width: 0;
      align-items: flex-start;
      justify-content: center;
      flex-direction: column;

      // Truncate the name to the remaining room while keeping the network controls visible.
      .name {
        display: flex;
        max-width: min(250px, 100%);
        font-weight: 700;
        font-size: 1.25rem;
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

<style lang="scss" scoped>
// The side panel's column keeps one row, as a phone wallet does: the name takes what the controls leave, and the
// network filter shows its icon (the balance caption names a filtered view in words).
@media (max-width: 500px) {
  .header {
    gap: 6px;

    .header-part-left {
      gap: 8px;

      .logo-container { flex: 0 0 36px; width: 36px; margin: 0; }
      .wallet-name { min-width: 0; flex: 1; }
      .name { max-width: 100%; font-size: 1.05rem; }
    }

    .header-part-right {
      gap: 2px;
    }

    .network-management {
      width: auto;
    }

    :deep(.network__title) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
}
</style>
