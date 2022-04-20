<template>
  <div class="header">
    <div class="header-part">
      <Logo size="small" />

      <div class="wallet-name">{{ name }}</div>
      <s-icon name="chevron-bottom-16" :class="iconChevronClasses" />
    </div>
    <div class="header-part">
      <CircleButton iconType="full-screen" backgroundColor="light-black" class="button-margin" :handler="fullScreen" />

      <CircleButton iconType="lock" backgroundColor="light-black" class="button-margin" :handler="lock" />

      <div class="background-ellipse button-margin">
        <div :class="statusConnectedClasses"></div>
        {{ statusConnectedText }}
      </div>

      <CircleButton iconType="settings" class="button-margin" backgroundColor="none" :handler="openSettings" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '../../store/accounts/getters';
import { SelectedWallet } from '../../store/accounts/types';
import Identicon from '@polkadot/vue-identicon';
import Logo from '../../components/Logo.vue';
import CircleButton from '../../components/CircleButton.vue';

@Component({
  components: { Identicon, Logo, CircleButton },
})
export default class extends Vue {
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get name() {
    return this.selectedWallet.name;
  }

  get statusConnectedClasses() {
    return ['connected', 'success-connected'];
  }

  get statusConnectedText() {
    return 'Connected';
  }

  get iconChevronClasses() {
    return [
      {
        'rotate-180': false,
      },
    ];
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

    .wallet-name {
      display: flex;
      font-weight: 700;
      font-size: 24px;
      margin: 0 5px 0 10px;
      align-items: center;

      &:hover {
        cursor: pointer;
      }
    }

    .s-icon-chevron-bottom-16 {
      margin-top: 5px;
    }

    .rotate-180 {
      transform: rotate(180deg);
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
    background-color: red;
  }
}
</style>
