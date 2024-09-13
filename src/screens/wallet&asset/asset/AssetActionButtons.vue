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
import { Component, Prop, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { getNativeAssetName } from '@extension-base/background/handlers/utils';
import type { NetworkJson } from '@extension-base/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { isSora } from '@/helpers';
import { type SelectedWallet } from '@/store';
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
      text: 'assets.receiveButtonText',
      icon: 'receive',
      formName: 'showReceiveForm',
      isActive: true,
    },
  ];

  @Prop(Object) currency!: TokenGroup;
  @Prop(Boolean) showBuyButton!: boolean;
  @Prop(String) assetId!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: (value: string) => NetworkJson;

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
  }

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
