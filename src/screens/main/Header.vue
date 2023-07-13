<template>
  <div>
    <header class="header">
      <div class="header-part header-part-left" :ref="walletNameRef" @click="toggleSelectWalletPopupVisible">
        <div class="logo-container">
          <CircleButton
            v-if="showBackIcon"
            backgroundColor="light-black"
            iconName="chevron-left"
            @click.stop="backToWallet"
          />

          <Logo v-else size="small" />
        </div>

        <div class="wallet-name">
          <div class="name">{{ name }}</div>

          <Rotate :isActive="syncedShowSelectWalletPopup">
            <SIcon name="chevron-bottom-16" />
          </Rotate>
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
        <div
          class="background-ellipse network-management"
          :ref="selectNetworkButtonRef"
          @click="toggleSelectNetworkPopupVisible"
        >
          <Icon v-if="isGroupIcon" :icon="selectedNetworkIcon" className="icon--network" width="16" height="16" />
          <ExternalLogo v-else :name="selectedNetworkIcon" width="16" height="16" class="icon--network" />

          <span>{{ selectedNetworkType }}</span>
          <Icon icon="down" className="icon--down" width="10" height="9" />
        </div>

        <div v-if="isPopup" class="background-ellipse" @click="toggleConnectionPopup">
          <Loading v-if="!tabStatus" />

          <template v-else>
            <div class="connect" :class="statusConnectedClasses"></div>
          </template>
        </div>

        <ConnectionPopup v-if="showConnectionPopup" :tabStatus="tabStatus" :handlerClose="toggleConnectionPopup" />

        <Tooltip text="header.connectionStatus" target=".background-ellipse" placement="top" />

        <CircleButton
          :ref="settingsNameRef"
          iconName="settings"
          size="big"
          backgroundColor="none"
          placement="left"
          target=".settings"
          tooltipText="header.settingsAndManagement"
          @click="toggleSettingsVisible"
        />

        <NetworkManage
          v-if="showSelectNetworkPopup"
          :type="networkType"
          :handlerClose="toggleSelectNetworkPopupVisible"
        />
      </div>
    </header>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync, Watch } from 'vue-property-decorator';
import { Getter, Action, Mutation } from 'vuex-class';
import { HexString } from '@polkadot/util/types';
import type { SelectedWallet } from '@/store';
import NetworkManage from '@/screens/wallet&asset/NetworkForm.vue';

import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import { Components } from '@/router/routes';
import BaseApi from '@/util/BaseApi';
import { getNetworkType, tieAccount, windowOpen } from '@/extension/messaging';
import {
  ActiveTabAuthorizeStatus,
  NetworkType,
} from '@/extension/background/extension-base/src/background/types/types';
import ConnectionPopup from '@/screens/main/ConnectionPopup.vue';
import { AsyncFn, Fn } from '@/interfaces';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { ALL_NETWORKS } from '@/consts/networks';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { NetworkJson } from '@/extension/background/extension-base/src/types';

@Component({
  components: { ConnectionPopup, NetworkManage },
})
export default class Header extends Vue {
  readonly walletNameRef = 'walletName';
  readonly settingsNameRef = 'settingsName';
  readonly isPopup = BaseApi.useIsPopup();
  networkType: NetworkType | string = 'all';
  showConnectionPopup = false;
  showSelectNetworkPopup = false;
  readonly selectNetworkButtonRef = 'selectNetworkButton';

  @Prop(Boolean) highlightSettingsIcon!: boolean;
  @PropSync('showSelectWalletPopup', { type: Boolean }) syncedShowSelectWalletPopup!: boolean;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(ExtensionGettersTypes.tabStatus) tabStatus!: ActiveTabAuthorizeStatus;
  @Action(ExtensionActionTypes.FETCH_TAB_STATUS) fetchTabStatus!: AsyncFn<ActiveTabAuthorizeStatus>;
  @Getter(AccountsGettersTypes.getSelectedNetwork) selectedNetwork!: string;
  @Mutation(AccountsMutationTypes.SET_SELECTED_NETWORK) setSelectedNetwork!: Fn<string>;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: (value: string) => NetworkJson;

  get showBackIcon() {
    return this.$route.name === Components.Asset;
  }

  get selectedNetworkType() {
    return this.networkType;
  }

  get isGroupIcon() {
    return this.networkType === 'all' || this.networkType === 'popular' || this.networkType === 'favorites';
  }

  get selectedNetworkIcon() {
    if (this.isGroupIcon) return 'all-networks';

    return this.getNetwork(this.networkType).icon;
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

  toggleSelectedNetwork(network: string) {
    if (this.selectedNetwork === network) return;

    const prepNetwork: HexString | null = network === ALL_NETWORKS ? null : `0x${this.getNetwork(network).chainId}`;

    this.setSelectedNetwork(network);

    tieAccount(this.selectedWallet.address, prepNetwork);

    this.toggleSelectNetworkPopupVisible();
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
    this.getNetworkType();
    this.fetchTabStatus();
  }

  async getNetworkType() {
    this.networkType = await getNetworkType();
  }

  toggleConnectionPopup() {
    if (!this.tabStatus) return;

    this.showConnectionPopup = !this.showConnectionPopup;
  }

  backToWallet() {
    this.$router.push({ name: Components.Wallet });
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
  height: $header-height;
  margin-bottom: 16px;
  gap: 2px;

  .logo-container {
    width: 48px;
  }

  i {
    color: $grayish-white;
  }

  .s-icon-arrows-arrows-diagonals-bltr-24 {
    font-size: 18px !important;
  }
  .header-part-right {
    gap: 4px;
  }
  .header-part-left {
    &:hover {
      cursor: pointer;
    }
  }

  .header-part {
    display: flex;
    align-items: center;

    &:hover {
      cursor: pointer;
    }

    .wallet-name {
      display: flex;
      align-items: center;
      height: 48px;

      .name {
        max-width: 190px;
        font-weight: 700;
        font-size: 24px;
        margin-left: 10px;
        align-items: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .s-icon-chevron-bottom-16 {
      margin-top: 5px;
    }

    .background-ellipse {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 32px;
      padding: 12px;
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
    width: 137px;
    height: 32px;
    display: flex;
    gap: 4px;
  }

  .icon--down {
    height: 9px;
  }

  .icon--network {
    height: 16px;
  }

  .success-connect {
    background-color: #00ee77;
  }

  .fail-connect {
    background-color: $gray-color;
  }
}
</style>
