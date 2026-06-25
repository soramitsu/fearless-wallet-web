<template>
  <div class="activity">
    <BorderButton
      class="activity-button"
      text="assets.sendButtonText"
      iconName="send"
      data-testid="sendBtn"
      @click="onRoute('send')"
    />

    <BorderButton
      class="activity-button"
      width="100%"
      text="assets.receiveButtonText"
      iconName="receive"
      data-testid="receiveBtn"
      @click="onRoute('receive')"
    />

    <BorderButton
      v-if="showCrossChainButton"
      class="activity-button"
      text="assets.crossChain"
      iconName="cross-chain"
      data-testid="crossChainBtn"
      @click="onRoute('crossChain')"
    />

    <BorderButton
      v-if="showSwapButton"
      class="activity-button"
      text="assets.swap"
      iconName="swap"
      data-testid="swapBtn"
      @click="openSoraSwap"
    />

    <BorderButton
      v-if="showBuyButton && !isNeedPopupButton"
      class="activity-button"
      text="assets.buy"
      iconName="plus-pink"
      data-testid="buyBtn"
      @click="$emit('toggleVisible')"
    />

    <BorderButton
      v-if="isNeedPopupButton"
      class="activity-button activity-button--settings"
      iconName="three-dots-vertical"
      data-testid="threeDotsVerticalBtn"
      @click="$emit('togglePopupButton')"
    />
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue';

import { getNativeAssetName } from '@extension-base/background/handlers/utils';
import { isSora } from '@/helpers';
import { Components } from '@/router/routes';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

type ShowField = 'showSendForm' | 'showReceiveForm' | 'showCrossChainForm' | 'showBuyPopup';

type ControlButtons = {
  class: string;
  text: string;
  icon: string;
  formName: ShowField;
  isActive: boolean;
};

export default defineComponent({ name: 'AssetActionButtons' ,
  props: {
    currency: Object,
    showBuyButton: Boolean,
    assetId: String,
  },
  data() {
    return {
      basicButtons: [
    {
      class: 'activity-button',
      text: 'assets.receiveButtonText',
      icon: 'receive',
      formName: 'showReceiveForm',
      isActive: true,
    },
  ] as ControlButtons[],
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    selectedNetwork() {
      return this.$route.params.selectedNetwork ?? '';
    },
    selectedAsset() {
      return this.currency?.symbol?.toLowerCase() ?? '';
    },
    showSwapButton() {
      return isSora(this.selectedNetwork) && !this.accountsStore.selectedWallet.isMobile;
    },
    isNeedPopupButton() {
      return this.showCrossChainButton && this.showBuyButton && this.showSwapButton;
    },
    showCrossChainButton() {
      if (this.selectedNetwork === '') return false;

          const network = this.networksStore.getNetwork(this.selectedNetwork);

          const asset = getNativeAssetName(this.selectedAsset);

          if (!network || network.xcm === undefined) return false;

          return network.xcm.availableAssets?.some(({ symbol }) => symbol.toLowerCase() === asset);
    },
  },
  methods: {
    onRoute(form: 'send' | 'receive' | 'crossChain') {
      const name =
            form === 'send' ? Components.SendForm : form === 'receive' ? Components.ReceiveForm : Components.CrossChainForm;

          this.$router.push({
            name,
            params: {
              assetId: this.$route.params.assetId,
              network: this.selectedNetwork,
            },
          });
    },
    onToggleVisible(name: string) {
      this.$emit('toggleVisible', name);
    },
    openSoraSwap() {
      this.$router.push({
            name: Components.SoraSwap,
            params: {
              assetId: this.assetId,
              reset: '',
            },
          });
    },
  },
});
</script>

<style lang="scss" scoped>
.activity {
  display: flex;
  justify-content: space-between;
  gap: 5px;

  .activity-button {
    flex-grow: 1;

    &:first-child {
      margin-left: 0;
    }

    &--settings {
      color: $pink-color;
      flex-grow: 0;
      margin: 0;
    }
  }
}
</style>
