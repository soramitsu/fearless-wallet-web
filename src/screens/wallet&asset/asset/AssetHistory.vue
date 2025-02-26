<template>
  <Fragment>
    <AssetActionButtons
      :showBuyButton="showBuyButton"
      :currency="currency"
      :assetId="selectedAssetId"
      v-on="$listeners"
      @togglePopupButton="togglePopupButton"
    />

    <History :currency="currency" v-on="$listeners" />

    <Blur v-if="showPopupButton" @click="togglePopupButton">
      <div class="popup-button">
        <BorderButton
          class="activity-button activity-button--settings popup__button-width"
          iconName="three-dots-vertical"
          @click="togglePopupButton"
        />

        <BorderButton
          v-if="showBuyButton"
          class="activity-button"
          text="assets.buy"
          iconName="plus-pink"
          @click="$emit('toggleVisible')"
        />
      </div>
    </Blur>
  </Fragment>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import History from './History.vue';
import type { TokenGroup } from '@extension-base/background/types/types';
import AssetActionButtons from '@/screens/wallet&asset/asset/AssetActionButtons.vue';
import BaseApi from '@/util/BaseApi';
import { fetchEvmBalance } from '@/extension/messaging';
import { useExtensionStore } from '@/stores/extension';

@Component({
  components: {
    History,
    AssetActionButtons,
  },
})
export default class AssetHistory extends Vue {
  extensionStore = useExtensionStore();
  showPopupButton = false;

  @Prop(Object) currency!: TokenGroup;

  get selectedAssetId() {
    return this.$route.params.assetId;
  }

  get providers() {
    return this.currency.providers ?? [];
  }

  get mainNetwork() {
    const currency = this.currency.balances?.find((network) => network.isUtility || network.isNative);

    return currency ? currency.name : '';
  }

  get showBuyButton() {
    const providers = this.providers.filter((provider) => this.extensionStore.features?.fiat[provider]);

    if (providers.length === 0) return false;

    return this.mainNetwork?.toLowerCase() === this.selectedNetwork.toLowerCase();
  }

  get selectedNetwork() {
    return this.$route.params.selectedNetwork ?? '';
  }

  mounted() {
    if (BaseApi.isEthereumNativeNetwork(this.selectedNetwork)) fetchEvmBalance(this.selectedAssetId);
  }

  togglePopupButton() {
    this.showPopupButton = !this.showPopupButton;
  }
}
</script>

<style lang="scss" scoped>
.popup-button {
  position: absolute;
  display: flex;
  flex-flow: column;
  align-items: flex-end;
  top: 250px;
  left: 465px;
  height: 100px;
  gap: 10px;

  .popup__button-width {
    width: 42px;
  }
}
</style>
