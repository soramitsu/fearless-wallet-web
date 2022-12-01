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
          v-if="showFullScreenIcon"
          iconName="expand"
          backgroundColor="light-black"
          class="button-margin"
          tooltipText="common.fullScreen"
          target=".expand"
          placement="bottom"
          @click="openFullScreen"
        />

        <div class="background-ellipse button-margin">
          <div :class="statusConnectedClasses"></div>

          {{ $t(statusConnectedText) }}
        </div>

        <Tooltip text="header.connectionStatus" target=".background-ellipse" placement="top" />

        <CircleButton
          :ref="settingsNameRef"
          iconName="settings"
          class="button-margin"
          backgroundColor="none"
          placement="left"
          target=".settings"
          tooltipText="Settings and account management"
          @click="toggleSettingsVisible"
        />
      </div>
    </header>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { SelectedWallet } from '@/store/accounts/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';
import BaseApi from '@/util/BaseApi';
import Tooltip from '@/components/Tooltip.vue';

@Component({
  components: {
    Tooltip,
  },
})
export default class Header extends Vue {
  readonly walletNameRef = 'walletName';
  readonly settingsNameRef = 'settingsName';

  @Prop(Boolean) highlightSettingsIcon!: boolean;
  @PropSync('showSelectWalletPopup', { type: Boolean }) syncedShowSelectWalletPopup!: boolean;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;

  get showFullScreenIcon() {
    return BaseApi.useIsPopup();
  }

  get showBackIcon() {
    return this.$route.name === Components.Asset;
  }

  get name() {
    return this.selectedWallet.name;
  }

  get statusConnectedClasses() {
    return ['connect', this.isOnline ? 'success-connect' : 'fail-connect'];
  }

  get statusConnectedText() {
    return this.isOnline ? 'header.connected' : 'header.disconnect';
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

  backToWallet() {
    this.$router.push({ name: Components.Wallet });
  }

  openFullScreen() {
    BaseApi.windowOpen('/');
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
      padding: 0 12px;
      font-size: 12px;
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
    background-color: #ee7700;
  }
}
</style>
