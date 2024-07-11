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
import { Getter } from 'vuex-class';
import History from './History.vue';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { Features } from '@/store/extension/types';
import AssetActionButtons from '@/screens/wallet&asset/asset/AssetActionButtons.vue';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import BaseApi from '@/util/BaseApi';
import { fetchEvmBalance } from '@/extension/messaging';

@Component({
  components: {
    History,
    AssetActionButtons,
  },
})
export default class AssetHistory extends Vue {
  showPopupButton = false;

  @Prop(Object) currency!: TokenGroup;
  @Getter(ExtensionGettersTypes.features) features!: Nullable<Features>;

  get selectedAssetId() {
    return this.$route.params.assetId ?? '0';
  }

  get providers() {
    return this.currency.providers ?? [];
  }

  get mainNetwork() {
    const currency = this.currency.balances?.find((network) => network.isUtility || network.isNative);

    return currency ? currency.name : '';
  }

  get showBuyButton() {
    const providers = this.providers.filter((provider) => this.features?.fiat[provider]);

    if (providers.length === 0) return false;

    return this.mainNetwork?.toLowerCase() === this.selectedNetwork.toLowerCase();
  }

  get selectedNetwork() {
    return this.$route.params.selectedNetwork ?? '';
  }

  mounted() {
    if (BaseApi.isEthereumNetwork(this.currency.mainNetwork))
      fetchEvmBalance(this.selectedAssetId !== '0' ? this.selectedAssetId : undefined);
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
