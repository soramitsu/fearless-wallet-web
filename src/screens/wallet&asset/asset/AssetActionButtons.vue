<template>
  <div class="activity">
    <BorderButton
      v-for="(button, index) in basicButtons"
      :class="button.class"
      :text="button.text"
      :iconName="button.icon"
      @click="onToggleVisible(button.formName)"
      :key="index"
    />

    <BorderButton
      v-if="showCrossChainButton"
      class="activity-button"
      text="assets.crossChain"
      iconName="cross-chain"
      @click="$emit('toggleVisible', 'showCrossChainForm')"
    />

    <BorderButton
      v-if="showSwapButton"
      class="activity-button"
      text="assets.swap"
      iconName="swap"
      @click="openSoraSwap"
    />

    <BorderButton
      v-if="showBuyButton && !isNeedPopupButton"
      class="activity-button"
      text="assets.buy"
      iconName="plus-pink"
      @click="$emit('toggleVisible', 'showBuyPopup')"
    />

    <BorderButton
      v-if="isNeedPopupButton"
      class="activity-button activity-button--settings"
      iconName="three-dots-vertical"
      @click="$emit('togglePopupButton')"
    />
  </div>
</template>
<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { getNativeAssetName } from '@extension-base/background/utils/utils';
import type { NetworkJson } from '@extension-base/types';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { isSora } from '@/helpers';
import { SelectedWallet } from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Components } from '@/router/routes';

type ShowField = 'showSendForm' | 'showReceiveForm' | 'showCrossChainForm' | 'showBuyPopup';

type ControlButtons = {
  class: string;
  text: string;
  icon: string;
  formName: ShowField;
  isActive: boolean;
};

@Component
export default class AssetActionButtons extends Vue {
  readonly basicButtons: ControlButtons[] = [
    {
      class: 'activity-button',
      text: 'assets.sendButtonText',
      icon: 'send',
      formName: 'showSendForm',
      isActive: true,
    },
    {
      class: 'activity-button',
      text: 'assets.receiveButtonText',
      icon: 'receive',
      formName: 'showReceiveForm',
      isActive: true,
    },
  ];

  @Prop(Object) currency!: TokenBalance;
  @Prop(Boolean) showBuyButton!: boolean;
  @Prop(String) assetId!: string;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: (value: string) => NetworkJson;

  get selectedNetwork() {
    return this.$route.params.selectedNetwork ?? '';
  }

  get selectedAsset() {
    return this.currency?.symbol?.toLowerCase() ?? '';
  }

  get showSwapButton() {
    return isSora(this.selectedNetwork) && !this.selectedWallet.isMobile;
  }

  get isNeedPopupButton() {
    return this.showCrossChainButton && this.showBuyButton && this.showSwapButton;
  }

  get showCrossChainButton() {
    if (this.selectedNetwork === '') return false;

    const network = this.getNetwork(this.selectedNetwork);

    const asset = getNativeAssetName(this.selectedAsset);

    if (!network || network.xcm === undefined) return false;

    return network.xcm.availableAssets?.some(({ symbol }) => symbol.toLowerCase() === asset);
  }

  onToggleVisible(name: string) {
    this.$emit('toggleVisible', name);
  }

  openSoraSwap() {
    this.$router.push({
      name: Components.SoraSwap,
      params: {
        assetId: this.assetId,
        reset: '',
      },
    });
  }
}
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
