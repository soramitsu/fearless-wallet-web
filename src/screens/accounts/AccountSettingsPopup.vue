<template>
  <Popup
    :showHeader="false"
    :showBlur="false"
    :showBorder="true"
    :handlerClose="handlerClose"
    :top="top"
    :left="-17"
    verticalPlacement="center"
    horizontalPlacement="right"
  >
    <div class="account-settings">
      <div class="row">
        <img src="@/assets/export.svg" class="icon" />
        <div class="label">Export account</div>
      </div>
      <div class="row">
        <img src="@/assets/account-switch.svg" class="icon" />
        <div class="label">Replace account</div>
      </div>
      <div class="row" @click="openNetwork">
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
      <div class="row" @click="open(true)">
        <img src="@/assets/globus.svg" class="icon" />
        <div class="label">View in Polkascan</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { firstCharToUp } from '@/util/helpers';
import { Components } from '@/router/routes';
import Popup from '@/components/Popup.vue';

@Component({
  components: { Popup },
})
export default class AccountSettingsPopup extends Vue {
  @Prop(String) selectedNetwork!: string;
  @Prop(String) selectedAddress!: string;
  @Prop(Function) handlerClose!: VoidFunction;

  get top() {
    return 0;
  }

  copyAddress() {
    navigator.clipboard.writeText(this.selectedAddress);

    this.close();
  }

  open(isPolkascan = false) {
    if (isPolkascan)
      window.open(
        `https://explorer.polkascan.io/${firstCharToUp(this.selectedNetwork)}/account/${this.selectedAddress}`
      );
    else window.open(`https://${this.selectedNetwork}.subscan.io/account/${this.selectedAddress}`);

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
