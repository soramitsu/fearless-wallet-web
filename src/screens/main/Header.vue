<template>
  <div class="header">
    <div class="header-part">
      <Logo size="small" />

      <div class="wallet-name">{{ name }}</div>
    </div>
    <div class="header-part">
      <CircleButton iconType="full-screen" class="button-margin" :handler="handler" />

      <CircleButton iconType="lock" class="button-margin" :handler="handler" />

      <div class="background-ellipse button-margin">
        <div :class="statusConnectedClasses"></div>
        {{ statusConnectedText }}
      </div>

      <CircleButton iconType="settings" class="button-margin" :background="false" :handler="handler" />
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

  handler(name: string) {
    alert(`handler ${name}`);
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
      margin-left: 10px;
      align-items: center;

      &:hover {
        cursor: pointer;
      }
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
