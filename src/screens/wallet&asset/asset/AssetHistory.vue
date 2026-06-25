<template>
  <Fragment>
    <AssetActionButtons
      :showBuyButton="showBuyButton"
      :currency="currency"
      :assetId="selectedAssetId"
      v-bind="$attrs"
      @togglePopupButton="togglePopupButton"
    />

    <History :currency="currency" v-bind="$attrs" />

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
import { defineComponent } from 'vue';

import History from './History.vue';
import AssetActionButtons from '@/screens/wallet&asset/asset/AssetActionButtons.vue';
import BaseApi from '@/util/BaseApi';
import { fetchEvmBalance } from '@/extension/messaging';
import { useExtensionStore } from '@/stores/extension';

export default defineComponent({ name: 'AssetHistory',
  inheritAttrs: false,
  components: {
    History,
    AssetActionButtons,
  },
  props: {
    currency: Object,
  },
  data() {
    return {
      extensionStore: useExtensionStore(),
      showPopupButton: false,
    };
  },
  computed: {
    selectedAssetId() {
      return this.$route.params.assetId;
    },
    providers() {
      return this.currency.providers ?? [];
    },
    mainNetwork() {
      const currency = this.currency.balances?.find((network) => network.isUtility || network.isNative);

          return currency ? currency.name : '';
    },
    showBuyButton() {
      const providers = this.providers.filter((provider) => this.extensionStore.features?.fiat[provider]);

          if (providers.length === 0) return false;

          return this.mainNetwork?.toLowerCase() === this.selectedNetwork.toLowerCase();
    },
    selectedNetwork() {
      return this.$route.params.selectedNetwork ?? '';
    },
  },
  mounted() {
    if (BaseApi.isEthereumNativeNetwork(this.selectedNetwork)) fetchEvmBalance(this.selectedAssetId);
  },
  methods: {
    togglePopupButton() {
      this.showPopupButton = !this.showPopupButton;
    },
  },
});
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
