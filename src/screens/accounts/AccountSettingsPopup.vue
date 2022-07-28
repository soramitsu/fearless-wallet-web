<template>
  <Popup
    :showHeader="false"
    :showBlur="false"
    :showBorder="true"
    :handlerClose="handlerClose"
    :top="top"
    :left="-17"
    sizeWidth="mini"
    verticalPlacement="top"
    horizontalPlacement="right"
  >
    <div class="account-settings">
      <div class="row" @click="openNotificationPopup">
        <img src="@/assets/export.svg" class="icon" />
        <div class="label">Export account</div>
      </div>
      <div v-if="showReplaceAccount" class="row" @click="openReplacePopup">
        <img src="@/assets/account-switch.svg" class="icon" />
        <div class="label">Replace account</div>
      </div>
      <div v-if="showSwitchNode" class="row" @click="openNetwork">
        <img src="@/assets/currency-switch.svg" class="icon" />
        <div class="label">Switch node</div>
      </div>
      <div class="row" @click="copyAddress">
        <img src="@/assets/copy-2.svg" class="icon" />
        <div class="label">Copy address</div>
      </div>
      <div class="row" @click="open()">
        <img src="@/assets/globus.svg" class="icon" />
        <div class="label">View in Subscan</div>
      </div>
      <div class="row" @click="open(false)">
        <img src="@/assets/globus.svg" class="icon" />
        <div class="label">View in Polkascan</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import Popup from '@/components/Popup.vue';
import BaseApi from '@/util/BaseApi';
import { Getter } from 'vuex-class';
import { Components } from '@/router/routes';
import { firstCharToUp } from '@/util/helpers';
import { Component, Vue, Prop } from 'vue-property-decorator';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import type { SelectedWallet } from '@/store/accounts/types';

@Component({
  components: { Popup },
})
export default class AccountSettingsPopup extends Vue {
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showSwitchNode!: boolean;
  @Prop(Boolean) showReplaceAccount!: boolean;
  @Prop(Number) buttonTopClick!: number;
  @Prop(Function) handlerClose!: VoidFunction;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get top() {
    if (this.buttonTopClick === undefined) return 110;

    if (this.buttonTopClick > 300) {
      const subtractionNumber = this.showReplaceAccount ? 265 : 225;

      return this.buttonTopClick - subtractionNumber;
    }

    return this.buttonTopClick + 7;
  }

  get addressByNetwork() {
    return BaseApi.formatAddress(this.selectedWallet, this.selectedNetwork);
  }

  copyAddress() {
    navigator.clipboard.writeText(this.addressByNetwork);

    this.close();
  }

  open(isSubscan = true) {
    if (isSubscan) window.open(`https://${this.selectedNetwork}.subscan.io/account/${this.addressByNetwork}`);
    else
      window.open(
        `https://explorer.polkascan.io/${firstCharToUp(this.selectedNetwork)}/account/${this.addressByNetwork}`
      );

    this.close();
  }

  openNetwork() {
    this.$router.push({
      name: Components.Network,
      params: {
        network: this.selectedNetwork,
      },
    });

    this.close();
  }

  openReplacePopup() {
    this.$emit('openReplacePopup');
  }

  openNotificationPopup() {
    this.$emit('openNotificationPopup', 'export');
  }

  close() {
    this.handlerClose();
  }
}
</script>

<style lang="scss" scoped>
.account-settings {
  color: rgba(255, 255, 255, 0.75);
  font-weight: 500;

  .row {
    display: flex;
    margin: 0 0 20px 20px;

    &:last-child {
      margin-bottom: 0;
    }

    &:hover {
      cursor: pointer;
      color: rgba(255, 255, 255, 0.9);

      .icon {
        filter: invert(0.1);
      }
    }

    .icon {
      filter: invert(0.25);
    }

    .label {
      margin: auto 0 auto 10px;
      width: 160px;
      text-align: left;
    }
  }
}
</style>
