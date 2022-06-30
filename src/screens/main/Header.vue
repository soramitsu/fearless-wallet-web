<template>
  <div class="header">
    <div class="header-part" :ref="walletNameRef">
      <div class="logo-container">
        <CircleButton v-if="showBackIcon" backgroundColor="light-black" iconName="chevron-left" @click="backToWallet" />

        <Logo v-else size="small" />
      </div>

      <div class="wallet-name-block" @click="toggleSelectWalletPopupVisible">
        <div class="wallet-name">{{ name }}</div>

        <Rotate :isActive="showSelectWalletPopup">
          <s-icon name="chevron-bottom-16" />
        </Rotate>
      </div>
    </div>
    <div class="header-part">
      <CircleButton iconName="expand" backgroundColor="light-black" class="button-margin" @click="fullScreen" />

      <CircleButton iconName="lock" backgroundColor="light-black" class="button-margin" @click="lock" />

      <div class="background-ellipse button-margin">
        <div :class="statusConnectedClasses"></div>
        {{ statusConnectedText }}
      </div>

      <CircleButton iconName="settings" class="button-margin" backgroundColor="none" @click="toggleSettingsVisible" />
    </div>

    <SelectWalletPopup v-if="showSelectWalletPopup" @close="toggleSelectWalletPopupVisible" />

    <SettingsPopup v-if="showSettings" :handlerClose="toggleSettingsVisible" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Components } from '@/router/routes';
import AccountController from '@/controllers/accountController';
import Logo from '@/components/Logo.vue';
import CircleButton from '@/components/CircleButton.vue';
import Rotate from '@/components/Rotate.vue';
import SelectWalletPopup from './SelectWalletPopup.vue';
import SettingsPopup from './SettingsPopup.vue';

@Component({
  components: {
    Logo,
    CircleButton,
    Rotate,
    SelectWalletPopup,
    SettingsPopup,
  },
})
export default class Header extends Vue {
  readonly accountController = new AccountController();
  walletNameRef = 'walletName';
  showSelectWalletPopup = false;
  showSettings = false;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get showBackIcon() {
    return this.$route.name === Components.Token;
  }

  get targetElement() {
    return this.$refs[this.walletNameRef] as HTMLElement;
  }

  get name() {
    return this.selectedWallet.name;
  }

  get statusConnectedClasses() {
    return ['connected', 'success-connected'];
  }

  get statusConnectedText() {
    return Date.now() ? 'Connected' : 'Not connected';
  }

  toggleSelectWalletPopupVisible() {
    this.showSelectWalletPopup = !this.showSelectWalletPopup;

    if (this.showSelectWalletPopup) {
      this.targetElement.style.zIndex = '200';
    } else {
      this.targetElement.style.zIndex = '0';
    }
  }

  toggleSettingsVisible() {
    this.showSettings = !this.showSettings;
  }

  backToWallet() {
    this.$router.push({ name: Components.Wallet });
  }

  lock() {
    this.accountController.updatedPasswordDateCreated(0);
    this.$router.push({ name: Components.WelcomeBack });
  }

  fullScreen() {
    alert(`fullScreen`);
  }
}
</script>

<style lang="scss" scoped>
.header {
  display: flex;
  justify-content: space-between;
  min-height: 48px;
  margin-bottom: 16px;

  .logo-container {
    width: 48px;
  }

  i {
    color: rgba(255, 255, 255, 0.65);
  }

  .s-icon-arrows-arrows-diagonals-bltr-24 {
    font-size: 18px !important;
  }

  .header-part {
    display: flex;
    align-items: center;

    .wallet-name-block {
      display: flex;
      align-items: center;

      &:hover {
        cursor: pointer;
      }

      .wallet-name {
        display: flex;
        font-weight: 700;
        font-size: 24px;
        margin: 0 5px 0 10px;
        align-items: center;
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
      background-color: rgba(255, 255, 255, 0.1);
    }
  }

  .connected {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    margin-right: 8px;
  }

  .success-connected {
    background-color: #00ee77;
  }

  .fail-connected {
    background-color: #ee7700;
  }
}
</style>
