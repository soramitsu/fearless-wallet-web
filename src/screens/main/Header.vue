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

      <div class="header-part">
        <CircleButton
          v-if="isPopup"
          iconName="expand"
          backgroundColor="light-black"
          class="button-margin"
          tooltipText="common.fullScreen"
          target=".expand"
          placement="bottom"
          @click="openFullScreen"
        />

        <div v-if="isPopup" class="background-ellipse button-margin" @click="toggleConnectionPopup">
          <Loading v-if="!tabStatus" />

          <template v-else>
            <div class="connect" :class="statusConnectedClasses"></div>
            <span>{{ $t(statusConnectedText) }}</span>
          </template>
        </div>

        <ConnectionPopup v-if="showConnectionPopup" :tabStatus="tabStatus" :handlerClose="toggleConnectionPopup" />

        <Tooltip text="header.connectionStatus" target=".background-ellipse" placement="top" />

        <CircleButton
          :ref="settingsNameRef"
          iconName="settings"
          class="button-margin"
          backgroundColor="none"
          placement="left"
          target=".settings"
          tooltipText="header.settingsAndManagement"
          @click="toggleSettingsVisible"
        />
      </div>
    </header>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import type { SelectedWallet } from '@/store';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import { Components } from '@/router/routes';
import BaseApi from '@/util/BaseApi';
import { windowOpen } from '@/extension/messaging';
import { ActiveTabAuthorizeStatus } from '@/extension/background/extension-base/src/background/types/types';
import ConnectionPopup from '@/screens/main/ConnectionPopup.vue';
import { TAction } from '@/interfaces';

@Component({
  components: { ConnectionPopup },
})
export default class Header extends Vue {
  readonly walletNameRef = 'walletName';
  readonly settingsNameRef = 'settingsName';
  readonly isPopup = BaseApi.useIsPopup();

  showConnectionPopup = false;

  @Prop(Boolean) highlightSettingsIcon!: boolean;
  @PropSync('showSelectWalletPopup', { type: Boolean }) syncedShowSelectWalletPopup!: boolean;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(ExtensionGettersTypes.getTabStatus) tabStatus!: ActiveTabAuthorizeStatus;
  @Action(ExtensionActionTypes.FETCH_TAB_STATUS) fetchTabStatus!: TAction<ActiveTabAuthorizeStatus>;

  get showBackIcon() {
    return this.$route.name === Components.Asset;
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

  .logo-container {
    width: 48px;
  }

  i {
    color: $grayish-white;
  }

  .s-icon-arrows-arrows-diagonals-bltr-24 {
    font-size: 18px !important;
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
        display: flex;
        max-width: 220px;
        font-weight: 700;
        font-size: 24px;
        margin: 0 5px 0 10px;
        align-items: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .s-icon-chevron-bottom-16 {
      margin-top: 5px;
    }

    .button-margin {
      margin-left: 5px;
    }

    .background-ellipse {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 32px;
      width: 145px;
      padding: 0 12px;
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
    margin-right: 8px;
  }

  .success-connect {
    background-color: #00ee77;
  }

  .fail-connect {
    background-color: $gray-color;
  }
}
</style>
