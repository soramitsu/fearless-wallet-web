<template>
  <Popup
    sizeWidth="mini"
    verticalPlacement="top"
    horizontalPlacement="right"
    :top="top"
    :left="-17"
    :showBorder="true"
    :showHeader="false"
    :handlerClose="handlerClose"
  >
    <div class="account-settings">
      <div v-if="showExport" class="row" @click="openNotificationPopup">
        <Icon icon="export" className="icon" />
        <div class="label">Export account</div>
      </div>
      <div v-if="showReplaceAccount" class="row" @click="openReplacePopup">
        <Icon icon="account-switch" className="icon" />

        <div class="label">Replace account</div>
      </div>
      <div v-if="showSwitchNode" class="row" @click="openNetwork">
        <Icon icon="currency-switch" className="icon" />

        <div class="label">Switch node</div>
      </div>
      <div class="row" @click="copyAddress">
        <Icon icon="copy-2" className="icon" />

        <div class="label">Copy address</div>
      </div>
      <div class="row" @click="openSubscan">
        <Icon icon="globus" className="icon" />

        <div class="label">View in Subscan</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Getter } from 'vuex-class';
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { SelectedWallet } from '@/store/accounts/types';
import Popup from '@/components/Popup.vue';
import BaseApi from '@/util/BaseApi';
import { Components } from '@/router/routes';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component({
  components: { Popup },
})
export default class AccountSettingsPopup extends Vue {
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showSwitchNode!: boolean;
  @Prop(Boolean) showExport!: boolean;
  @Prop(Boolean) showReplaceAccount!: boolean;
  @Prop(Number) buttonTopClick!: number;
  @Prop(Function) handlerClose!: VoidFunction;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get top() {
    if (this.buttonTopClick === undefined) return 110;

    if (this.buttonTopClick > 300) {
      const subtractionNumber = this.showReplaceAccount ? 221 : 181;

      return this.buttonTopClick - subtractionNumber;
    }

    return this.buttonTopClick + 7;
  }

  get addressByNetwork() {
    return BaseApi.getDisplayAddressByNetwork(this.selectedWallet, this.selectedNetwork);
  }

  copyAddress() {
    navigator.clipboard.writeText(this.addressByNetwork);

    this.close();
  }

  openSubscan() {
    window.open(`https://${this.selectedNetwork}.subscan.io/account/${this.addressByNetwork}`);

    this.close();
  }

  openNetwork() {
    this.$router.push({
      name: Components.Nodes,
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
  color: $default-white;
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
      width: 20px;
      height: 20px;
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
