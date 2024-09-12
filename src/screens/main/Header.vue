<template>
  <header class="header">
    <div class="header-part header-part-left" :ref="walletNameRef" @click="toggleSelectWalletPopupVisible">
      <div class="logo-container">
        <CircleButton
          v-if="showBackIcon"
          backgroundColor="light-black"
          iconName="chevron-left"
          data-testid="backBtn"
          @click.stop="back"
        />

        <Logo v-else size="mini" />
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
        data-testid="selectNetwork"
        @onToggle="toggleSelectNetworkPopupVisible"
      />

      <div v-if="isPopup" class="background-ellipse connection" @click="toggleConnectionPopup">
        <Loading v-if="!tabStatus" :width="16" />

        <template v-else>
          <div class="connect" :class="statusConnectedClasses"></div>
        </template>
      </div>

      <ConnectionPopup v-if="showConnectionPopup" :tabStatus="tabStatus" @handlerClose="toggleConnectionPopup" />

      <Tooltip text="header.connectionStatus" target=".connection" placement="top" />
      <Tooltip :text="selectedNetwork" target=".network-management" placement="top" />

      <CircleButton
        :ref="settingsNameRef"
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
        :type="selectedNetwork"
        @handlerClose="toggleSelectNetworkPopupVisible"
      />
    </div>
  </header>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import type { ActiveTabAuthorizeStatus, TokenGroup } from '@extension-base/background/types/types';
import type { GetNetwork, SelectedWallet } from '@/store';
import type { NetworkJson } from '@extension-base/types';
import type { AsyncFn } from '@/interfaces';
import NetworkManagementButton from '@/screens/main/NetworkManagementButton.vue';
import NetworkManagement from '@/screens/wallet&asset/NetworkManagement.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import { Components } from '@/router/routes';
import BaseApi from '@/util/BaseApi';
import { windowOpen } from '@/extension/messaging';
import ConnectionPopup from '@/screens/main/ConnectionPopup.vue';
import { isNetworkGroup } from '@/helpers/common';
import { cut } from '@/helpers';

@Component({
  components: {
    ConnectionPopup,
    NetworkManagement,
    NetworkManagementButton,
  },
})
export default class Header extends Vue {
  readonly walletNameRef = 'walletName';
  readonly settingsNameRef = 'settingsName';
  readonly isPopup = BaseApi.useIsPopup();
  readonly allNetworksIcon = 'all-networks';
  showConnectionPopup = false;
  showSelectNetworkPopup = false;

  @Prop(Boolean) highlightSettingsIcon!: boolean;
  @PropSync('showSelectWalletPopup', { type: Boolean }) syncedShowSelectWalletPopup!: boolean;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(ExtensionGettersTypes.tabStatus) tabStatus!: ActiveTabAuthorizeStatus;
  @Action(ExtensionActionTypes.FETCH_TAB_STATUS) fetchTabStatus!: AsyncFn<ActiveTabAuthorizeStatus>;
  @Getter(AccountsGettersTypes.selectedNetwork) selectedNetwork!: string;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get showBackIcon() {
    const route = this.$route.name;

    return route === Components.AssetNetworks || route === Components.AssetHistory;
  }

  get isAddressExists() {
    if (this.isGroup) return this.routeName === Components.AssetHistory;

    return true;
  }

  get routeName() {
    return this.$route.name;
  }

  get routeParams() {
    return this.$route.params;
  }

  get isGroup() {
    return isNetworkGroup(this.selectedNetwork);
  }

  get selectedAssetId() {
    return this.$route.params.assetId ?? '';
  }

  get currentCurrency(): TokenGroup | undefined {
    return this.balances.find(
      ({ groupId, balances }) =>
        groupId === this.selectedAssetId || balances.some((el) => el.id === this.selectedAssetId)
    );
  }

  get computeActiveNetworks() {
    if (!this.currentCurrency) return [];

    return this.currentCurrency.balances.filter((network) => this.getNetwork(network.name).active);
  }

  get networkManagementButtonText() {
    if (this.isGroup) {
      if (this.$route.name === Components.AssetHistory)
        return this.getNetwork(this.$route.params.selectedNetwork)?.name;

      return this.$t(`header.networkManagement.${this.selectedNetwork}`);
    }

    return this.selectedNetwork;
  }

  get selectedNetworkIcon() {
    if (this.isGroup) return this.allNetworksIcon;

    if (this.$route.name === Components.AssetHistory) {
      const asset = this.currentCurrency?.balances.find((el) => el.id === this.selectedAssetId);
      if (!asset) return '';

      return this.getNetwork(asset?.name).icon;
    }

    const network = this.getNetwork(this.selectedNetwork);

    if (network) return network.icon;

    return this.allNetworksIcon;
  }

  get cutAddress() {
    return cut(this.address, 5);
  }

  get decimals() {
    return this.getNetwork(this.selectedNetwork)?.addressPrefix;
  }

  get address() {
    if (!this.isAddressExists) return '';

    if (this.selectedWallet.address === '') return '';

    const selectedNetwork = this.isGroup ? this.routeParams.selectedNetwork : this.selectedNetwork;

    return BaseApi.formatAddress(this.selectedWallet, selectedNetwork);
  }

  get name() {
    return this.selectedWallet.name;
  }

  get statusConnectedClasses() {
    return !this.tabStatus || !this.tabStatus.isAuthorize ? 'fail-connect' : 'success-connect';
  }

  get statusConnectedText() {
    return !this.tabStatus || !this.tabStatus.isAuthorize ? 'header.notConnected' : 'header.connected';
  }

  get isMobile() {
    return !!this.selectedWallet.isMobile;
  }

  copyAddress() {
    navigator.clipboard.writeText(this.address);
  }

  toggleSelectNetworkPopupVisible() {
    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
  }

  @Watch('syncedShowSelectWalletPopup')
  updateZIndexSelectWalletPopup() {
    const targetElement = this.$refs[this.walletNameRef] as HTMLElement;

    targetElement.style.zIndex = this.syncedShowSelectWalletPopup ? '200' : '0';
  }

  @Watch('highlightSettingsIcon')
  updateZIndexShowSettings(value: boolean) {
    const targetElement = (this.$refs[this.settingsNameRef] as Vue).$el as HTMLElement;

    targetElement.style.zIndex = value ? '300' : '0';
  }

  async mounted() {
    this.fetchTabStatus();
  }

  toggleConnectionPopup() {
    if (!this.tabStatus) return;

    this.showConnectionPopup = !this.showConnectionPopup;
  }

  back() {
    this.$router.back();
  }

  openFullScreen() {
    windowOpen('/');
    window.close();
  }

  toggleSettingsVisible() {
    this.$emit('toggleSettingsVisible');
  }

  toggleSelectWalletPopupVisible() {
    this.syncedShowSelectWalletPopup = !this.syncedShowSelectWalletPopup;
  }
}
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
    font-size: 18px !important;
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
        font-size: 24px;
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
        font-size: 12px;
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
      font-size: 12px;
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
