<template>
  <AboveForm header="asset.polkaswap" :fullScreen="true" :closeHandler="closeForm">
    <template v-slot:header>
      <div class="header-content">
        <div :class="classesBackIcon">
          <Icon v-show="!showSettings" icon="chevron-left" class="img" @click="back" />
        </div>

        <div class="header">{{ header }}</div>

        <Icon v-if="showSettings" icon="close" class="img close" @click="toggleSettingsVisibility" />

        <div v-else :class="classesSettings" @click="toggleSettingsVisibility">
          <template v-if="step === 1">
            <div class="settings-text">{{ marketTypeUP }}</div>

            <div class="settings-circle">
              <Icon icon="settings" class="img" />
            </div>
          </template>
        </div>
      </div>
    </template>

    <Scroll>
      <div class="swap">
        <div class="swap-content">
          <SwapSettings
            v-if="showSettings"
            :marketType="marketType"
            :slippage="slippage"
            :temporaryMarketType="temporaryMarketType"
            :temporarySlippage="temporarySlippage"
            @update:temporaryMarketType="updateMarketType"
            @update:temporarySlippage="updateSlippage"
          />

          <template v-else-if="step === 1">
            <SwapSelectInput
              text="asset.sendButtonText"
              :balance="transferrableSendAmount"
              :value="sendValue"
              :asset="sendAsset"
              :relayChain="currentSendCurrencyRelayChain"
              :amount="sendAmount"
              :isRotate="isSendAssetType"
              @update:amount="updateSendAmount"
              @setMax="setMax"
              @toggleSelectAssetPopupVisibility="toggleSelectAssetPopupVisibility.call(null, 'send')"
            />

            <SwapSelectInput
              class="receive-input"
              text="asset.receiveButtonText"
              :balance="transferrableReceiveAmount"
              :value="receiveValue"
              :asset="receiveAsset"
              :relayChain="currentReceiveCurrencyRelayChain"
              :amount="receiveAmount"
              :isRotate="isReceiveAssetType"
              @update:amount="updateReceiveAmount"
              @toggleSelectAssetPopupVisibility="toggleSelectAssetPopupVisibility.call(null, 'receive')"
            />

            <div class="swap-icon" @click="swapAssets">
              <Icon icon="swap" class="img" />
            </div>

            <template v-if="showSwapInfo">
              <div class="row">
                {{ sendAssetUP }} / {{ receiveAssetUP }}

                <div class="fiat-info">
                  <div>{{ AToBCut }} {{ receiveAssetUP }}</div>
                  <div class="price">{{ fiatSymbol }} {{ AToBValueCut }}</div>
                </div>
              </div>

              <div class="row">
                {{ receiveAssetUP }} / {{ sendAssetUP }}

                <div class="fiat-info">
                  <div>{{ BToACut }} {{ sendAssetUP }}</div>
                  <div class="price">{{ fiatSymbol }} {{ BToAValueCut }}</div>
                </div>
              </div>
            </template>

            <div class="row">
              <div>{{ $t(minMaxLabel) }}</div>

              <div class="fiat-info">
                <div>{{ minMaxAmountCut }} {{ minMaxAssetName }}</div>
                <div class="price">{{ fiatSymbol }} {{ minMaxAmountPrice }}</div>
              </div>
            </div>

            <div class="row">
              {{ $t('asset.priceImpact') }}

              <div class="fiat-info">
                <div>-</div>
              </div>
            </div>

            <div class="row">
              {{ $t('asset.route') }}

              <div class="fiat-info">
                <div>-</div>
              </div>
            </div>

            <div class="row last-row">
              {{ $t('asset.networkFee') }}

              <div class="fiat-info">
                <div>{{ fee }}</div>
                <div class="price">{{ fiatSymbol }} {{ feePrice }}</div>
              </div>
            </div>
          </template>

          <SwapPreview
            v-if="step === 2"
            :marketType="marketType"
            :slippage="slippage"
            :sendAmount="sendAmount"
            :receiveAmount="receiveAmount"
            :sendValue="sendValue"
            :receiveValue="receiveValue"
            :minMaxAmount="minMaxAmountCut"
            :minMaxAmountPrice="minMaxAmountPrice"
            :fee="fee"
            :feePrice="feePrice"
            :providerFee="providerFee"
            :sendAssetUP="sendAssetUP"
            :receiveAssetUP="receiveAssetUP"
            :isExchangeB="isExchangeB"
          />
        </div>

        <div class="buttons">
          <Button
            v-if="showSettings"
            size="big"
            text="asset.resetToDefault"
            type="secondary"
            width="49%"
            :border="false"
            @click="resetSettings"
          />

          <Button
            size="big"
            :text="buttonText"
            :disabled="buttonPreviewDisabled"
            :width="widthButton"
            @click="proceed"
          />
        </div>
      </div>
    </Scroll>

    <SelectPopup
      v-if="showSelectPopup"
      placeholder="common.searchAmongAssets"
      verticalPlacement="top"
      :value="selectPopupValue"
      :showBlur="false"
      :showBackground="false"
      :top="top"
      :left="160"
      :height="285"
      :options="options"
      :handlerFilter="handlerFilter"
      :toggleValue="toggleSelectedAsset"
      :handlerClose="toggleSelectAssetPopupVisibility.bind(null, '')"
    />

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="sendCurrency"
      :amount="sendAmount"
      :value="sendValue"
      :firstNetwork="currentSendCurrencyRelayChain"
      extrinsicType="sendSwap"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { Currencies } from '@/interfaces';
import type { GetAssetName, SelectedWallet } from '@/store';
import SwapSelectInput from '@/screens/wallet&asset/swap/SwapSelectInput.vue';
import SwapPreview from '@/screens/wallet&asset/swap/SwapPreview.vue';
import SwapSettings from '@/screens/wallet&asset/swap/SwapSettings.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { getCurrencyOptions } from '@/helpers/currencies';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { formattedCountAsset, formattedPrice } from '@/helpers/numbers';

@Component({
  components: {
    SwapPreview,
    SwapSettings,
    SwapSelectInput,
    ConfirmationPasswordPopup,
  },
})
export default class SwapForm extends Vue {
  step = 1;
  slippage = 0.5;
  temporarySlippage = 0.5;
  marketType = 'smart';
  temporaryMarketType = 'smart';
  sendAssetId = '';
  receiveAssetId = '';
  sendAmount = '';
  receiveAmount = '';
  sendValue = '';
  receiveValue = '';
  minMaxAmount = '';
  fee = '';
  providerFee = '';
  selectAssetType = '';
  AToB = '';
  BToA = '';
  filterValue = '';
  showSettings = false;
  showConfirmationPasswordPopup = false;
  isExchangeB = false;

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) selectedNetwork!: string;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(NetworksGettersTypes.getAssetName) getAssetName!: GetAssetName;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  //TODO
  get feePrice() {
    return this.fee;
  }

  get minMaxAmountPrice() {
    const price = this.isExchangeB
      ? this.sendCurrency?.getCostOfAssets(this.minMaxAmount)
      : this.receiveCurrency?.getCostOfAssets(this.minMaxAmount);

    return formattedPrice(+(price ?? '0'));
  }

  get minMaxAmountCut() {
    return formattedCountAsset(+this.minMaxAmount);
  }

  get minMaxAssetName() {
    return this.isExchangeB ? this.sendAssetUP : this.receiveAssetUP;
  }

  get AToBCut() {
    return this.sendAmount === '' || this.receiveAmount === '' ? '0' : formattedCountAsset(+this.AToB);
  }

  get BToACut() {
    return this.sendAmount === '' || this.receiveAmount === '' ? '0' : formattedCountAsset(+this.BToA);
  }

  get AToBValueCut() {
    return this.sendAmount === '' || this.receiveAmount === ''
      ? '0'
      : formattedPrice(+this.sendCurrency!.getCostOfAssets(this.AToB));
  }

  get BToAValueCut() {
    return this.sendAmount === '' || this.receiveAmount === ''
      ? '0'
      : formattedPrice(+this.sendCurrency!.getCostOfAssets(this.BToA));
  }

  get minMaxLabel() {
    return this.isExchangeB ? 'asset.maxSales' : 'asset.minReceived';
  }

  get widthButton() {
    return this.showSettings ? '49%' : '100%';
  }

  get classesSettings() {
    return [
      'settings',
      {
        'setting-hide': this.step === 2,
      },
    ];
  }

  get classesBackIcon() {
    return [
      'back',
      {
        'back-mock': this.showSettings,
      },
    ];
  }

  get header() {
    if (this.showSettings) return this.$t('asset.swapSettings');

    if (this.step === 1) return this.$t('asset.polkaswap');

    return this.$t('asset.swapPreview');
  }

  get showSwapInfo() {
    return this.sendAssetId !== '' && this.receiveAssetId !== '' && this.sendAmount !== '' && this.receiveAmount !== '';
  }

  get sendAsset() {
    return this.getAssetName(this.sendAssetId);
  }

  get receiveAsset() {
    return this.getAssetName(this.receiveAssetId);
  }

  get showSelectPopup() {
    return this.selectAssetType !== '';
  }

  get optionsCurrency() {
    const currenciesFilteredByNetwork = this.currencies.filter(({ relayChain }) => relayChain === this.selectedNetwork);

    return getCurrencyOptions(currenciesFilteredByNetwork).filter(({ label }) => {
      const filter = this.filterValue.toLowerCase();

      return label.toLowerCase().includes(filter);
    });
  }

  get options() {
    return this.isSendAssetType
      ? this.optionsCurrency
      : this.optionsCurrency.filter(({ value }) => value !== this.sendAssetId);
  }

  get sendCurrency() {
    return this.currencies.find(({ assetId }) => assetId === this.sendAssetId);
  }

  get receiveCurrency() {
    return this.currencies.find(({ assetId }) => assetId === this.receiveAssetId);
  }

  get currentReceiveCurrencyRelayChain() {
    return this.currencies.find(({ assetId }) => assetId === this.receiveAssetId)?.relayChain;
  }

  get currentSendCurrencyRelayChain() {
    return this.sendCurrency?.relayChain;
  }

  get top() {
    return this.isSendAssetType ? 145 : 250;
  }

  get selectPopupValue() {
    if (this.isSendAssetType) return this.sendAssetId;

    return this.receiveAsset;
  }

  get isSendAssetType() {
    return this.selectAssetType === 'send';
  }

  get isReceiveAssetType() {
    return this.selectAssetType === 'receive';
  }

  get showSelectSendAsset() {
    return false;
  }

  get showReceiveAsset() {
    return false;
  }

  get buttonText() {
    if (this.showSettings) return 'common.save';

    return this.step === 1 ? 'asset.preview' : 'common.confirm';
  }

  get buttonPreviewDisabled() {
    if (this.step === 2) return false;

    return (this.sendAssetId === '' || this.receiveAssetId === '' || this.sendAmount === '') && !this.showSettings;
  }

  get marketTypeUP() {
    return this.marketType.toUpperCase();
  }

  get sendAssetUP() {
    return this.sendAsset.toUpperCase();
  }

  get receiveAssetUP() {
    return this.receiveAsset.toUpperCase();
  }

  get transferrableSendAmount() {
    const count = +(this.sendCurrency?.getTransferableCountAssets(this.selectedWallet, this.selectedNetwork) ?? 0);

    return formattedCountAsset(count);
  }

  get transferrableReceiveAmount() {
    const count = +(this.receiveCurrency?.getTransferableCountAssets(this.selectedWallet, this.selectedNetwork) ?? 0);

    return formattedCountAsset(count);
  }

  async createSwap() {
    if (
      this.sendAssetId === '' ||
      this.receiveAssetId === '' ||
      (this.isExchangeB && this.receiveAmount == '') ||
      (!this.isExchangeB && this.sendAmount === '')
    ) {
      this.sendAmount = '';
      this.receiveAmount = '';
      this.sendValue = '';
      this.receiveValue = '';

      return;
    }

    const { amountA, amountB, fee, AToB, BToA, providerFee, minMaxValue } = await this.sendCurrency!.createSwap(
      this.selectedWallet,
      {
        network: this.selectedNetwork,
        amountA: this.sendAmount,
        amountB: this.receiveAmount,
        assetAId: this.sendAssetId,
        assetBId: this.receiveAssetId,
        slippage: this.slippage,
        symbolA: this.sendAsset,
        symbolB: this.receiveAsset,
        isExchangeB: this.isExchangeB,
      }
    );

    if (this.isExchangeB) {
      this.sendAmount = amountA;
      this.sendValue = this.sendCurrency!.getCostOfAssets(amountA);
      this.receiveValue = this.receiveCurrency!.getCostOfAssets(this.receiveAmount);
    } else {
      this.receiveAmount = amountB;
      this.sendValue = this.sendCurrency!.getCostOfAssets(this.sendAmount);
      this.receiveValue = this.receiveCurrency!.getCostOfAssets(amountB);
    }

    this.minMaxAmount = minMaxValue;
    this.fee = fee;
    this.providerFee = providerFee;
    this.AToB = AToB;
    this.BToA = BToA;
  }

  updateSendAmount(value: string) {
    this.isExchangeB = false;
    this.sendAmount = value;

    this.createSwap();
  }

  updateReceiveAmount(value: string) {
    this.isExchangeB = true;
    this.receiveAmount = value;

    this.createSwap();
  }

  toggleSelectedAsset(value: string) {
    if (this.isSendAssetType) this.sendAssetId = value;
    else this.receiveAssetId = value;

    this.createSwap();
    this.toggleSelectAssetPopupVisibility('');
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) this.closeForm();
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }

  toggleSelectAssetPopupVisibility(value: 'send' | 'receive' | '') {
    if (this.selectAssetType !== '') this.selectAssetType = '';
    else this.selectAssetType = value;

    this.filterValue = '';
  }

  async proceed() {
    if (this.showSettings) {
      this.marketType = this.temporaryMarketType;
      this.slippage = this.temporarySlippage;
      this.showSettings = false;

      this.createSwap();
    } else if (this.step === 1) this.step += 1;
    else this.showConfirmationPasswordPopup = true;
  }

  resetSettings() {
    this.temporaryMarketType = 'smart';
    this.temporarySlippage = 0.5;
  }

  toggleSettingsVisibility() {
    if (this.step === 2) return;

    this.showSettings = !this.showSettings;
    this.temporaryMarketType = this.marketType;
    this.temporarySlippage = this.slippage;
  }

  swapAssets() {
    const sendAssetId = this.sendAssetId;

    if (this.isExchangeB) this.sendAmount = this.receiveAmount;
    else this.receiveAmount = this.sendAmount;

    this.isExchangeB = !this.isExchangeB;
    this.sendAssetId = this.receiveAssetId;
    this.receiveAssetId = sendAssetId;

    this.createSwap();
  }

  back() {
    if (this.step === 1) this.closeForm();
    else this.step -= 1;
  }

  updateMarketType(value: string) {
    this.temporaryMarketType = value;
  }

  updateSlippage(value: number) {
    this.temporarySlippage = value;
  }

  setMax() {
    this.sendAmount = this.transferrableSendAmount;

    this.createSwap();
  }
}
</script>

<style lang="scss" scoped>
.row {
  margin: 0 16px;
  height: 55px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid $secondary-background-color;

  .fiat-info {
    text-align: right;
    display: flex;
    flex-direction: column;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;

    .price {
      color: $gray-color;
    }
  }
}

.last-row {
  border: none;
}

.buttons {
  display: flex;
  justify-content: space-between;
}

.header-content {
  height: 64px;
  font-size: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $default-padding;
  border-bottom: 1px solid $default-background-color;
}

.back {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  width: 112px;
  height: 20px;
  opacity: 0.65;
  cursor: pointer;
}

.back-mock {
  width: 20px;
  height: 20px;
  cursor: default;
}

.img {
  height: 20px;
  width: 20px;
}

.close {
  opacity: 0.65;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }
}

.swap {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.swap-content {
  color: $default-white;
  min-height: 504px;

  .receive-input {
    margin: 7px 0 32px;
  }

  .swap-icon {
    border-radius: 50%;
    background-color: rgb(29, 29, 29);
    width: 46px;
    height: 46px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin: -46px auto 0;
    border: 1px solid $secondary-background-color;
    opacity: 1;
    position: relative;
    top: -110px;
    cursor: pointer;

    &:hover {
      background-color: rgb(34, 32, 32);
    }
  }
}

.settings {
  display: flex;
  justify-content: space-between;
  background-color: $secondary-background-color;
  border-radius: 20px;
  height: 42px;
  min-width: 112px;
  cursor: pointer;

  .settings-text {
    display: flex;
    flex: 1 0 40px;
    justify-content: center;
    align-items: center;
    font-weight: 700;
    font-size: 12px;
    color: $gray-color;
  }

  .settings-circle {
    background-color: $default-background-color;
    border-radius: 50%;
    height: 42px;
    width: 42px;
    display: flex;
    justify-content: center;
    align-items: center;
    opacity: 0.65;
  }
}

.setting-hide {
  background: none;
  cursor: default;
}
</style>
