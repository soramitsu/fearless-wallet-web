<template>
  <AboveForm :fullScreen="true" :closeHandler="closeForm">
    <template v-slot:header>
      <div class="header-content">
        <div :class="classesBackIcon">
          <Icon v-show="showBackIcon" icon="chevron-left" class="img" @click="back" />
        </div>

        <div class="header">
          {{ header }}

          <Icon v-if="showPolkaswapIcon" icon="polkaswap" class="polkaswap" />
        </div>

        <Icon v-if="showCloseIcon" icon="close" class="img close" @click="toggleSettingsVisibility" />

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
              text="assets.sendButtonText"
              :balance="transferableSendAmount"
              :value="sendValue"
              :asset="sendAsset"
              :assetId="sendAssetId"
              :amount="sendAmount"
              :isRotate="isSendAssetType"
              @update:amount="updateSendAmount"
              @setMax="setMax"
              @toggleSelectAssetPopupVisibility="toggleSelectAssetPopupVisibility.call(null, 'send')"
            />

            <SwapSelectInput
              class="receive-input"
              text="assets.receiveButtonText"
              :balance="transferableReceiveAmount"
              :value="receiveValue"
              :asset="receiveAsset"
              :assetId="receiveAssetId"
              :amount="receiveAmount"
              :isRotate="isReceiveAssetType"
              @update:amount="updateReceiveAmount"
              @toggleSelectAssetPopupVisibility="toggleSelectAssetPopupVisibility.call(null, 'receive')"
            />

            <div :class="classesSwapIcon" @click="swapAssets">
              <Icon icon="swap" class="img" />
            </div>

            <template v-if="showSwapInfo">
              <div class="row">
                {{ sendAssetUP }} / {{ receiveAssetUP }}

                <div class="fiat-info">
                  <div>{{ AToBCut }}</div>
                  <div class="price">{{ AToBValueCut }}</div>
                </div>
              </div>

              <div class="row">
                {{ receiveAssetUP }} / {{ sendAssetUP }}

                <div class="fiat-info">
                  <div>{{ BToACut }}</div>
                  <div class="price">{{ BToAValueCut }}</div>
                </div>
              </div>
            </template>

            <SwapInfo
              :showSwapInfo="showSwapInfo"
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

        <div>
          <Alert v-if="showPolkaswapAlert" message="common.readPolkaswapDisclaimer" headerMessage="common.disclaimer">
            <div class="alert-content">
              {{ $t('common.readPolkaswapDisclaimer') }}

              <Button
                width="85px"
                size="mini"
                fontSize="small"
                type="warning"
                text="common.read"
                :border="false"
                @click="openPolkaswapDisclaimer"
              />
            </div>
          </Alert>

          <div class="buttons">
            <Button
              v-if="showSettings"
              size="big"
              text="assets.resetToDefault"
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
      :options="optionsCurrency"
      :handlerFilter="handlerFilter"
      :toggleValue="toggleSelectedAsset"
      :handlerClose="toggleSelectAssetPopupVisibility.bind(null, '')"
    />

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="sendCurrency"
      :amount="sendAmount"
      :value="sendValue"
      :network="selectedNetwork"
      :firstIcon="sendAssetId"
      :secondIcon="receiveAssetId"
      extrinsicType="swap"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { Currencies, NetworkStatus } from '@/interfaces';
import type { GetAssetName, SelectedWallet, GetNetworkStatus, GetNetwork } from '@/store';
import SwapSelectInput from '@/screens/polkaswap/swap/SwapSelectInput.vue';
import SwapPreview from '@/screens/polkaswap/swap/SwapPreview.vue';
import SwapInfo from '@/screens/polkaswap/swap/SwapInfo.vue';
import SwapSettings from '@/screens/polkaswap/swap/SwapSettings.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { getCurrencyOptions } from '@/helpers/currencies';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import Disclaimer from '@/screens/polkaswap/swap/Disclaimer.vue';
import { NetworksController } from '@/controllers';
import { SORA_UTILITY_ASSET, SORA_NETWORK_NAME, SORA_XOR_ASSET_ID } from '@/consts/networks';
import { Components } from '@/router/routes';

@Component({
  components: {
    SwapInfo,
    Disclaimer,
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
  minMaxAmount = '';
  providerFee = '';
  selectAssetType = '';
  AToB = '';
  BToA = '';
  filterValue = '';
  showSettings = false;
  showConfirmationPasswordPopup = false;
  isExchangeB = false;

  @Prop(String) _selectedAssetId!: string;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(NetworksGettersTypes.getAssetName) getAssetName!: GetAssetName;
  @Getter(NetworksGettersTypes.getNetworkStatus) getNetworkStatus!: GetNetworkStatus;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getPolkaswapAlertVisibility) showPolkaswapAlert!: boolean;

  get selectedNetwork() {
    return SORA_NETWORK_NAME as string;
  }

  get showCloseIcon() {
    return this.showSettings;
  }

  get showBackIcon() {
    return !this.showSettings;
  }

  get showPolkaswapIcon() {
    return this.step === 1 && !this.showSettings;
  }

  get classesSwapIcon() {
    return [
      'swap-icon',
      {
        'swap-icon-disable': this.receiveAssetId === '' || this.sendAssetId === '',
      },
    ];
  }

  get currencyXOR() {
    return this.currencies.find(({ displayName, relayChain }) => {
      return displayName === SORA_UTILITY_ASSET && relayChain === this.selectedNetwork;
    });
  }

  get feePrice() {
    const value = this.currencyXOR?.getCostOfAssets(this.fee) ?? '0';

    return this.$n(+value, 'price');
  }

  get soraMainAssetUpper() {
    return SORA_UTILITY_ASSET.toUpperCase();
  }

  get fee() {
    return this.getNetwork(this.selectedNetwork)?.fee?.toString() ?? '';
  }

  get minMaxAmountPrice() {
    const price = this.isExchangeB
      ? this.sendCurrency?.getCostOfAssets(this.minMaxAmount)
      : this.receiveCurrency?.getCostOfAssets(this.minMaxAmount);

    return `${this.fiatSymbol} ${this.$n(+(price ?? '0'), 'price')}`;
  }

  get minMaxAmountCut() {
    return `${this.$n(+this.minMaxAmount, 'decimal')} ${this.minMaxAssetName}`;
  }

  get minMaxAssetName() {
    return this.isExchangeB ? this.sendAssetUP : this.receiveAssetUP;
  }

  get AToBCut() {
    const value = +this.$n(+this.AToB, 'decimal') || '0';

    return `${value} ${this.receiveAssetUP}`;
  }

  get BToACut() {
    const value = +this.$n(+this.BToA, 'decimal') || '0';

    return `${value} ${this.sendAssetUP}`;
  }

  get AToBValueCut() {
    const value = +this.$n(+this.sendCurrency!.getCostOfAssets(this.AToB), 'price') || '0';

    return `${this.fiatSymbol} ${value}`;
  }

  get BToAValueCut() {
    const value = +this.$n(+this.sendCurrency!.getCostOfAssets(this.BToA), 'price') || '0';

    return `${this.fiatSymbol} ${value}`;
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
    if (this.showSettings) return this.$t('assets.swapSettings');

    if (this.step === 1) return this.$t('assets.polkaswap');

    return this.$t('assets.swapPreview');
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
    const filter = this.filterValue.toLowerCase();
    const currenciesFilteredByNetwork = this.currencies.filter(({ relayChain }) => relayChain === this.selectedNetwork);

    return getCurrencyOptions(currenciesFilteredByNetwork).filter(({ label, value }) => {
      if (!label.toLowerCase().includes(filter)) return false;

      const id = this.isSendAssetType ? this.receiveAssetId : this.sendAssetId;

      return value !== id;
    });
  }

  get sendCurrency() {
    return this.currencies.find(({ assetId }) => assetId === this.sendAssetId);
  }

  get receiveCurrency() {
    return this.currencies.find(({ assetId }) => assetId === this.receiveAssetId);
  }

  get top() {
    return this.isSendAssetType ? 145 : 250;
  }

  get selectPopupValue() {
    if (this.isSendAssetType) return this.sendAssetId;

    return this.receiveAssetId;
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

    if (this.sendAmount !== '' && this.receiveAmount !== '' && this.fee === '') return 'assets.calculateFee';

    if (!this.isValidSendAsset) return { text: 'assets.insufficientBalance', localeProps: { asset: this.sendAssetUP } };

    if (!this.isValidTransferByXOR)
      return { text: 'assets.insufficientBalance', localeProps: { asset: this.soraMainAssetUpper } };

    if (+this.sendAmount === 0 || +this.receiveAmount === 0) return { text: 'assets.unableSwap' };

    return this.step === 1 ? 'assets.preview' : 'common.confirm';
  }

  get buttonPreviewDisabled() {
    if (this.step === 2 || this.showSettings) return false;

    if (
      this.fee === '' ||
      !this.isValidSendAsset ||
      !this.isValidTransferByXOR ||
      +this.sendAmount === 0 ||
      +this.receiveAmount === 0
    )
      return true;

    return this.sendAssetId === '' || this.receiveAssetId === '' || this.sendAmount === '';
  }

  get isValidSendAsset() {
    return this.sendCurrency?.validateCountAssets(this.sendAmount, this.fee, this.selectedNetwork, this.selectedWallet);
  }

  get isValidTransferByXOR() {
    if (this.fee === '') return false;

    if (this.receiveAsset === SORA_UTILITY_ASSET) {
      return this.currencyXOR!.validateSwapToXOR(
        this.selectedWallet,
        this.isExchangeB ? this.receiveAmount : this.minMaxAmount,
        this.fee
      );
    }

    const xorAmount = this.sendAsset === SORA_UTILITY_ASSET ? this.sendAmount : '0';

    return this.currencyXOR?.validateCountAssets(xorAmount, this.fee, this.selectedNetwork, this.selectedWallet);
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

  get transferableSendAmount() {
    const count = +(this.sendCurrency?.getTransferableCountAssets(this.selectedWallet, this.selectedNetwork) ?? 0);

    return this.$n(count, 'decimal');
  }

  get transferableReceiveAmount() {
    const count = +(this.receiveCurrency?.getTransferableCountAssets(this.selectedWallet, this.selectedNetwork) ?? 0);

    return this.$n(count, 'decimal');
  }

  get networkStatus() {
    return this.getNetworkStatus(this.selectedNetwork);
  }

  get sendValue() {
    return this.sendCurrency?.getCostOfAssets(this.sendAmount);
  }

  get receiveValue() {
    return this.receiveCurrency?.getCostOfAssets(this.receiveAmount);
  }

  @Watch('networkStatus')
  connect(status: NetworkStatus) {
    if (status === 'ready') this.initializeSora();
  }

  async created() {
    const { assetId, leftXORAmount } = this.$route.params;
    if (leftXORAmount) {
      this.receiveAssetId = SORA_XOR_ASSET_ID;
      this.receiveAmount = leftXORAmount;
      this.isExchangeB = true;
    } else this.sendAssetId = assetId ?? SORA_XOR_ASSET_ID;

    if (this.networkStatus === 'ready') this.initializeSora();
  }

  async initializeSora() {
    if (this.fee !== '') return;

    try {
      await NetworksController.initializeSora();
      await NetworksController.calcSoraFee();
    } catch (ex) {
      console.info('initializeSora', ex);
    }
  }

  async createSwap() {
    if (this.sendAssetId === '' || this.receiveAssetId === '') {
      if (this.isExchangeB) this.sendAmount = '';
      else this.receiveAmount = '';

      return;
    }

    if ((this.isExchangeB && this.receiveAmount == '') || (!this.isExchangeB && this.sendAmount === '')) {
      this.sendAmount = '';
      this.receiveAmount = '';

      return;
    }

    const { amountA, amountB, AToB, BToA, providerFee, minMaxValue } = await this.sendCurrency!.createSwap({
      network: this.selectedNetwork,
      amountA: this.sendAmount,
      amountB: this.receiveAmount,
      assetAId: this.sendAssetId,
      assetBId: this.receiveAssetId,
      slippage: this.slippage,
      symbolA: this.sendAsset,
      symbolB: this.receiveAsset,
      isExchangeB: this.isExchangeB,
    });

    if (this.isExchangeB) this.sendAmount = amountA;
    else this.receiveAmount = amountB;

    this.minMaxAmount = minMaxValue;
    this.providerFee = providerFee;
    this.AToB = AToB;
    this.BToA = BToA;
  }

  closeForm() {
    this.$router.back();
  }

  openPolkaswapDisclaimer() {
    this.$router.push({
      name: Components.PolkaswapDisclaimer,
      params: { showSwitcher: '1' },
    });
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
    if (this.receiveAssetId === '' || this.sendAssetId === '') return;

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
    this.isExchangeB = false;
    this.sendAmount = this.sendCurrency!.getTransferableCountAssetsMinusFee(
      this.fee,
      this.selectedNetwork,
      this.selectedWallet
    ).toString();

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

.alert-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
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

.header {
  display: flex;
  align-items: flex-end;

  .polkaswap {
    width: 32px;
    height: 32px;
    color: $pink-color;
  }
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

.swap-icon-disable {
  cursor: not-allowed !important;
  background-color: rgb(29, 29, 29) !important;
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
