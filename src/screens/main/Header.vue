<template>
  <div class="header">
    <div class="header-part">
      <Logo size="small" />

      <div class="wallet-name-block" @click="toggleSelectWalletPopupVisible">
        <div class="wallet-name">{{ name }}</div>

        <Rotate :isActive="showSelectWalletPopup">
          <s-icon name="chevron-bottom-16" />
        </Rotate>
      </div>
    </div>
    <div class="header-part">
      <CircleButton iconType="full-screen" backgroundColor="light-black" class="button-margin" @click="fullScreen" />

      <CircleButton iconType="lock" backgroundColor="light-black" class="button-margin" @click="lock" />

      <div class="background-ellipse button-margin">
        <div :class="statusConnectedClasses"></div>
        {{ statusConnectedText }}
      </div>

      <CircleButton iconType="settings" class="button-margin" backgroundColor="none" @click="openSettings" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import Identicon from '@polkadot/vue-identicon';
import Logo from '@/components/Logo.vue';
import CircleButton from '@/components/CircleButton.vue';
import Rotate from '@/components/Rotate.vue';

@Component({
  components: {
    Identicon,
    Logo,
    CircleButton,
    Rotate,
  },
})
export default class extends Vue {
  showSelectWalletPopup = false;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

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
  }

  fullScreen() {
    alert(`fullScreen`);
  }

  lock() {
    alert(`lock`);
  }

  openSettings() {
    alert(`settings`);
  }
}
</script>

<style lang="scss" scoped>
.header {
  display: flex;
  justify-content: space-between;
  height: 48px;
  margin-bottom: 16px;

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
