<template>
  <Fragment>
    <AssetActionButtons
      :showBuyButton="showBuyButton"
      :showCrossChainButton="showCrossChainButton"
      :showSwapButton="showSwapButton"
      v-on="$listeners"
    />

    <History :currency="currency" @openHistoryDetailsForm="$emit('openHistoryDetailsForm')" />

    <Blur v-if="showPopupButton" @click="$emit('togglePopupButton')">
      <div class="popup-button">
        <BorderButton
          class="activity-button activity-button--settings popup__button-width"
          iconName="three-dots-vertical"
          @click="$emit('togglePopupButton')"
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
  @Prop(Function) togglePopupButton!: () => void;
  @Prop(Object) currency!: TokenBalance;
  @Prop(Function) openSoraSwap!: () => void;
  @Prop(Boolean) showBuyButton!: boolean;
  @Prop(Boolean) showPopupButton!: boolean;
  @Prop(Boolean) showCrossChainButton!: boolean;
  @Prop(Boolean) showSwapButton!: boolean;
  onPopup() {
    this.$emit('togglePopupButton');
  }
  onToggleVisible() {
    this.$emit('toggleVisible', 'showBuyPopup');
  }
}
</script>
