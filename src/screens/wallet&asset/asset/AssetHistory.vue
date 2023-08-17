<template>
  <Fragment>
    <AssetActionButtons
      :showBuyButton="showBuyButton"
      :currency="currency"
      :assetId="selectedAssetId"
      v-on="$listeners"
      @togglePopupButton="togglePopupButton"
    />

    <History :currency="currency" @openHistoryDetailsForm="$emit('openHistoryDetailsForm')" />

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
          @click="$emit('toggleVisible', 'showBuyPopup')"
        />
      </div>
    </Blur>
  </Fragment>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import History from './History.vue';
import type { TokenBalance } from '@extension-base/background/types/types';
import AssetActionButtons from '@/screens/wallet&asset/asset/AssetActionButtons.vue';

@Component({
  components: {
    History,
    AssetActionButtons,
  },
})
export default class AssetHistory extends Vue {
  showPopupButton = false;

  @Prop(Object) currency!: TokenBalance;

  get selectedAssetId() {
    return this.$route.params.assetId ?? '';
  }

  get providers() {
    return this.currency.providers ?? [];
  }

  get mainNetwork() {
    const currency = this.currency.balances?.find((network) => network.isUtility || network.isNative);

    return currency ? currency.name : '';
  }

  get showBuyButton() {
    return this.providers.length !== 0 && this.mainNetwork?.toLowerCase() === this.selectedNetwork.toLowerCase();
  }

  get selectedNetwork() {
    return this.$route.params.selectedNetwork ?? '';
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
