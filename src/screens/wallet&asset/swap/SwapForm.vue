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
              balance="1"
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
              balance="1"
              :value="receiveValue"
              :asset="receiveAsset"
              :relayChain="currentReceiveCurrencyRelayChain"
              :amount="receiveAmount"
              :isRotate="isReceiveAssetType"
              @update:amount="updateReceiveAmount"
              @setMax="setMax"
              @toggleSelectAssetPopupVisibility="toggleSelectAssetPopupVisibility.call(null, 'receive')"
            />

            <div class="swap-icon" @click="swapAssets">
              <Icon icon="swap" class="img" />
            </div>

            <div v-if="showSwapInfo" class="row">
              {{ sendAssetUP }} / {{ receiveAssetUP }}

              <div class="fiat-info">
                <div>{{ sendAmount }} {{ receiveAssetUP }}</div>
                <div class="price">{{ fiatSymbol }} {{ sendValue }}</div>
              </div>
            </div>

            <div v-if="showSwapInfo" class="row">
              {{ receiveAssetUP }} / {{ sendAssetUP }}

              <div class="fiat-info">
                <div>{{ receiveAmount }} {{ sendAssetUP }}</div>
                <div class="price">{{ fiatSymbol }} {{ receiveValue }}</div>
              </div>
            </div>

            <div class="row">
              <div>Min received</div>

              <div class="fiat-info">
                <div>{{ minReceivedAmount }}</div>
                <div class="price">{{ fiatSymbol }} {{ minReceivedPrice }}</div>
              </div>
            </div>

            <div class="row">
              Price impact

              <div class="fiat-info">
                <div>{{ priceImpact }} %</div>
              </div>
            </div>

            <div class="row">
              Route

              <div class="fiat-info">
                <div>-</div>
              </div>
            </div>

            <div class="row last-row">
              Network fee

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
            :minReceivedAmount="minReceivedAmount"
            :minReceivedPrice="minReceivedPrice"
            :fee="fee"
            :feePrice="feePrice"
            :sendAssetUP="sendAssetUP"
            :receiveAssetUP="receiveAssetUP"
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
      :currency="currentSendCurrency"
      :amount="sendAmount"
      :value="sendValue"
      :firstNetwork="currentSendCurrencyRelayChain"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { Currencies } from '@/interfaces';
import type { GetAssetName } from '@/store';
import SwapSelectInput from '@/screens/wallet&asset/swap/SwapSelectInput.vue';
import SwapPreview from '@/screens/wallet&asset/swap/SwapPreview.vue';
import SwapSettings from '@/screens/wallet&asset/swap/SwapSettings.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { getCurrencyOptions } from '@/helpers/currencies';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';

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
  marketType = 'smart';
  temporaryMarketType = 'smart';
  temporarySlippage = 0.5;
  sendAssetId = '';
  receiveAssetId = '';
  sendAmount = '1';
  sendValue = '1';
  receiveAmount = '1';
  receiveValue = '1';
  minReceivedAmount = '1';
  minReceivedPrice = '1';
  priceImpact = '1';
  fee = '1';
  feePrice = '1';
  selectAssetType = '';
  filterValue = '';
  showSettings = false;
  showConfirmationPasswordPopup = false;

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) selectedNetwork!: string;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(NetworksGettersTypes.getAssetName) getAssetName!: GetAssetName;

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
    return this.sendAssetId !== '' && this.receiveAssetId !== '';
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

    return getCurrencyOptions(currenciesFilteredByNetwork, ['soraAsset']).filter(({ label }) => {
      const filter = this.filterValue.toLowerCase();

      return label.toLowerCase().includes(filter);
    });
  }

  get options() {
    return this.isSendAssetType
      ? this.optionsCurrency
      : this.optionsCurrency.filter(({ value }) => value !== this.sendAssetId);
  }

  get currentSendCurrency() {
    return this.currencies.find(({ assetId }) => assetId === this.sendAssetId);
  }

  get currentReceiveCurrencyRelayChain() {
    return this.currencies.find(({ assetId }) => assetId === this.receiveAssetId)?.relayChain;
  }

  get currentSendCurrencyRelayChain() {
    return this.currentSendCurrency?.relayChain;
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

  toggleSelectedAsset(value: string) {
    if (this.isSendAssetType) this.sendAssetId = value;
    else this.receiveAssetId = value;

    this.toggleSelectAssetPopupVisibility('');
  }

  confirmationPasswordPopupClose() {
    this.showConfirmationPasswordPopup = false;
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }

  toggleSelectAssetPopupVisibility(value: 'send' | 'receive' | '') {
    if (this.selectAssetType !== '') this.selectAssetType = '';
    else this.selectAssetType = value;
  }

  updateSendAmount(value: string) {
    this.sendAmount = value;
  }

  updateReceiveAmount(value: string) {
    this.receiveAmount = value;
  }

  async proceed() {
    if (this.showSettings) {
      this.marketType = this.temporaryMarketType;
      this.slippage = this.temporarySlippage;

      this.showSettings = false;
    } else if (this.step === 1) this.step += 1;
    else {
      this.showConfirmationPasswordPopup = true;

      // await this.swap(); // TODO

      // this.showConfirmationPasswordPopup = false;
    }
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

    this.sendAssetId = this.receiveAssetId;
    this.receiveAssetId = sendAssetId;
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
    // TODO
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

    .amount {
      color: $default-white;
      margin-bottom: 3px;
    }

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
