<template>
  <AboveForm :fullScreen="true" @closeHandler="closeForm">
    <template v-slot:header>
      <div class="header-content">
        <div :class="classesBackIcon" @click="back">
          <Icon v-show="showBackIcon" icon="chevron-left" class="img" />
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
            <SelectInput
              text="assets.sendButtonText"
              :totalAmount="transferableSendAmount"
              :value="sendValue"
              :asset="sendAssetName"
              :assetId="sendAssetId"
              :amount="sendAmount"
              :isRotate="isSendAssetType"
              @update:amount="updateSendAmount"
              @setMax="setMax"
              @togglePopupVisibility="toggleSelectAssetPopupVisibility.call(null, 'send')"
            />

            <SelectInput
              class="receive-input"
              text="assets.receiveButtonText"
              :totalAmount="transferableReceiveAmount"
              :value="receiveValue"
              :asset="receiveAssetName"
              :assetId="receiveAssetId"
              :amount="receiveAmount"
              :isRotate="isReceiveAssetType"
              @update:amount="updateReceiveAmount"
              @togglePopupVisibility="toggleSelectAssetPopupVisibility.call(null, 'receive')"
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
              :route="route"
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
            :route="route"
          />
        </div>

        <div>
          <Alert v-if="showPolkaswapAlert" message="common.readPolkaswapDisclaimer" headerMessage="common.disclaimer">
            <div class="alert-content">
              {{ $t('common.readPolkaswapDisclaimer') }}

              <FButton
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
            <FButton
              v-if="showSettings"
              size="big"
              text="assets.resetToDefault"
              type="secondary"
              width="49%"
              :border="false"
              @click="resetSettings"
            />

            <FButton
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
      @handlerFilter="handlerFilter"
      @toggleValue="toggleSelectedAsset"
      @handlerClose="toggleSelectAssetPopupVisibility('')"
    />

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="sendCurrency"
      :amount="sendAmount"
      :value="sendValue"
      :firstIcon="sendAssetId"
      :secondIcon="receiveAssetId"
      :tx="tx"
      extrinsicType="swap"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { FPNumber } from '@sora-substrate/util';
import type { SelectedWallet, GetNetwork, GetAssetPrice } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import SwapPreview from '@/screens/polkaswap/swap/SwapPreview.vue';
import SwapInfo from '@/screens/polkaswap/swap/SwapInfo.vue';
import SwapSettings from '@/screens/polkaswap/swap/SwapSettings.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import Disclaimer from '@/screens/polkaswap/swap/Disclaimer.vue';
import { Components } from '@/router/routes';
import { checkSwap, getSoraFees } from '@/extension/messaging';
import {
  getCurrencyOptions,
  getXORCurrency,
  calcTransferableSendMinusFee,
  isValidAmountAsset,
} from '@/helpers/currencies';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { MarketType, type SwapOptions } from '@/interfaces';
import { addNumbers } from '@/helpers/numbers';
import { SORA_NETWORK_NAME, SORA_UTILITY_ASSET, SORA_XOR_ASSET_ID } from '@/consts/sora';

const SWAP_INTERVAL_RECALCULATE = 10000;

@Component({
  components: {
    SwapInfo,
    Disclaimer,
    SwapPreview,
    SwapSettings,
    ConfirmationPasswordPopup,
  },
})
export default class SwapForm extends Vue {
  readonly soraNetworkName = SORA_NETWORK_NAME;
  step = 1;
  slippage = 0.5;
  temporarySlippage = 0.5;
  marketType = MarketType.SMART;
  temporaryMarketType = MarketType.SMART;
  sendAssetId = '';
  receiveAssetId = '';
  sendAmount = '';
  receiveAmount = '';
  minMaxAmount = '';
  providerFee = '';
  selectAssetType = '';
  route = '';
  AToB = '';
  BToA = '';
  filterValue = '';
  showSettings = false;
  showConfirmationPasswordPopup = false;
  isExchangeB = false;
  fee = '';
  tx: SwapOptions = {} as SwapOptions;
  swapInterval!: NodeJS.Timer;

  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.showPolkaswapAlert) showPolkaswapAlert!: boolean;

  get showCloseIcon() {
    return this.showSettings;
  }

  get sendAssetPrice() {
    const priceId = this.sendCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get receiveAssetPrice() {
    const priceId = this.receiveCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get showBackIcon() {
    return !this.showSettings;
  }

  get showPolkaswapIcon() {
    return this.step === 1 && !this.showSettings;
  }

  get classesSwapIcon() {
    return ['swap-icon', { 'swap-icon-disable': this.receiveAssetId === '' }];
  }

  get currencyXOR() {
    return getXORCurrency(this.balances);
  }

  get feePrice() {
    const fee = this.fee ?? 0;
    const balance = this.getAssetPrice(this.currencyXOR?.priceId ?? '').price * +fee;

    return this.$n(+balance, 'price');
  }

  get soraMainAssetUpper() {
    return SORA_UTILITY_ASSET.toUpperCase();
  }

  get minMaxAmountPrice() {
    const price = this.isExchangeB
      ? getCostOfAssets(+this.minMaxAmount, this.getAssetPrice(this.sendAssetId).price)
      : getCostOfAssets(+this.minMaxAmount, this.getAssetPrice(this.receiveAssetId).price);

    return `${this.fiatSymbol} ${this.$n(price ?? 0, 'price')}`;
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
    const cost = getCostOfAssets(this.transferableSendAmount, this.sendAssetPrice) ?? 0;
    const value = this.$n(cost, 'price') || '0';

    return `${this.fiatSymbol} ${value}`;
  }

  get BToAValueCut() {
    const cost = getCostOfAssets(+this.transferableReceiveAmount, this.receiveAssetPrice) ?? 0;
    const value = this.$n(cost, 'price') || '0';

    return `${this.fiatSymbol} ${value}`;
  }

  get widthButton() {
    return this.showSettings ? '49%' : '100%';
  }

  get classesSettings() {
    return ['settings', { 'setting-hide': this.step === 2 }];
  }

  get classesBackIcon() {
    return ['back', { 'back-mock': this.showSettings }];
  }

  get header() {
    if (this.showSettings) return this.$t('assets.swapSettings');

    if (this.step === 1) return this.$t('assets.polkaswap');

    return this.$t('assets.swapPreview');
  }

  get showSwapInfo() {
    return this.sendAssetId !== '' && this.receiveAssetId !== '' && this.sendAmount !== '' && this.receiveAmount !== '';
  }

  get sendCurrency() {
    return this.balances.find(({ assetId }) => assetId === this.sendAssetId);
  }

  get sendAssetName(): string {
    return this.sendCurrency?.symbol ?? '';
  }

  get sendAssetIcon() {
    return this.sendCurrency?.assetId ?? '';
  }

  get receiveCurrency() {
    return this.balances.find(({ assetId: id }) => id === this.receiveAssetId);
  }

  get receiveAssetName(): string {
    return this.receiveCurrency?.symbol ?? '';
  }

  get receiveAssetIcon() {
    return this.receiveCurrency ? this.receiveCurrency.icon : '';
  }

  get showSelectPopup() {
    return this.selectAssetType !== '';
  }

  get optionsCurrency() {
    const filter = this.filterValue.toLowerCase();
    const currenciesFilteredByNetwork = this.balances.filter(
      ({ mainNetwork }) => mainNetwork.toLowerCase() === this.soraNetworkName.toLowerCase()
    );

    return getCurrencyOptions(currenciesFilteredByNetwork).filter(({ name, value }) => {
      if (!name.toLowerCase().includes(filter)) return false;

      const id = this.isSendAssetType ? this.receiveAssetId : this.sendAssetId;

      return value !== id;
    });
  }

  get top() {
    return this.isSendAssetType ? 145 : 248;
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

  get buttonText() {
    if (this.showSettings) return 'common.save';

    if (this.sendAmount !== '' && this.receiveAmount !== '' && this.fee === '') return 'assets.calculateFee';

    if (!this.isValidSendAsset) return { text: 'assets.insufficientBalance', localeProps: { asset: this.sendAssetUP } };

    if (!this.isValidTransferByXOR)
      return { text: 'assets.insufficientBalance', localeProps: { asset: this.soraMainAssetUpper } };

    if (+this.sendAmount === 0 || +this.receiveAmount === 0) return { text: 'assets.insufficientLiquidity' };

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
    return isValidAmountAsset(this.sendCurrency, this.soraNetworkName, this.fee, this.sendAmount);
  }

  get isValidTransferByXOR() {
    if (this.fee === '') return false;

    if (this.receiveAssetName === SORA_UTILITY_ASSET) {
      const transferableXor = this.calcTransferableXor();
      const receiveAmount = this.isExchangeB ? this.receiveAmount : this.minMaxAmount;
      const transferableXORAfterSending = addNumbers([transferableXor, receiveAmount]);

      // если баланс xor после получения будет больше, чем затраты на комиссию, своп валиден
      return FPNumber.gt(new FPNumber(transferableXORAfterSending), new FPNumber(this.fee));
    }

    // этот кейс проверяется в this.isValidSendAsset, когда sendAsset выбран xor
    if (this.sendAssetName === SORA_UTILITY_ASSET) return true;

    // проверяем, что xor достаточно на оплату комиссии
    return FPNumber.gte(new FPNumber(this.calcTransferableXor()), new FPNumber(this.fee));
  }

  get marketTypeUP() {
    return this.marketType.toUpperCase();
  }

  get sendAssetUP() {
    return this.sendAssetName.toUpperCase();
  }

  get receiveAssetUP() {
    return this.receiveAssetName.toUpperCase();
  }

  get sendCurrencyBalance() {
    return this.sendCurrency?.balances.find(
      (balance) => balance.name.toLowerCase() === this.soraNetworkName.toLowerCase()
    );
  }

  get transferableSendAmount() {
    return +(this.sendCurrencyBalance?.transferable ?? 0);
  }

  get transferableReceiveAmount() {
    return +(
      this.receiveCurrency?.balances.find(
        (balance) => balance.name.toLowerCase() === this.soraNetworkName.toLowerCase()
      )?.transferable ?? 0
    );
  }

  get sendValue() {
    return (this.sendAssetPrice * (+this.sendAmount ?? 0)).toString();
  }

  get receiveValue() {
    const amount = +this.receiveAmount ?? 0;

    return this.receiveAssetPrice * amount;
  }

  created() {
    this.updateComponentParams();

    this.getSoraFees();
  }

  activated() {
    this.updateComponentParams();
  }

  deactivated() {
    this.selectAssetType = '';
    this.step = 1;
  }

  updateComponentParams() {
    const { reset, restPriceXOR, assetId } = this.$route.params;

    if (reset !== undefined) {
      this.receiveAssetId = '';
      this.sendAmount = '';
      this.receiveAmount = '';
    } else if (restPriceXOR) {
      this.receiveAssetId = SORA_XOR_ASSET_ID;
      this.receiveAmount = restPriceXOR;
      this.isExchangeB = true;
    }

    this.sendAssetId = assetId ?? SORA_XOR_ASSET_ID;
  }

  async getSoraFees() {
    const { Swap } = await getSoraFees();

    this.fee = Swap;
  }

  async checkSwap() {
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

    const createSwap = async () => {
      const { amountA, amountB, AToB, BToA, fee, swapOptions, minMaxValue, route } = await checkSwap({
        network: this.soraNetworkName,
        amountA: this.sendAmount,
        amountB: this.receiveAmount,
        assetAId: this.sendAssetId,
        assetBId: this.receiveAssetId,
        slippage: this.slippage,
        symbolA: this.sendAssetName,
        symbolB: this.receiveAssetName,
        isExchangeB: this.isExchangeB,
        marketType: this.marketType,
      });
      if (this.isExchangeB) this.sendAmount = amountA;
      else this.receiveAmount = amountB;

      this.tx = swapOptions!;
      this.minMaxAmount = minMaxValue;
      this.providerFee = fee;
      this.AToB = AToB;
      this.BToA = BToA;
      this.route = route;
    };

    this.clearSwapInterval();
    this.swapInterval = setInterval(createSwap, SWAP_INTERVAL_RECALCULATE);

    createSwap();
  }

  clearSwapInterval() {
    clearInterval(this.swapInterval);
  }

  closeForm() {
    this.clearSwapInterval();
    this.$router.back();
  }

  openPolkaswapDisclaimer() {
    this.$router.push({
      name: Components.PolkaswapDisclaimer,
      params: { showSwitcher: '1' },
    });
  }

  async updateSendAmount(value: string) {
    this.isExchangeB = false;
    this.sendAmount = value;

    this.checkSwap();
  }

  async updateReceiveAmount(value: string) {
    this.isExchangeB = true;
    this.receiveAmount = value;

    this.checkSwap();
  }

  toggleSelectedAsset(value: string) {
    if (this.isSendAssetType) this.sendAssetId = value;
    else this.receiveAssetId = value;

    this.checkSwap();
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

      await this.checkSwap();
    } else if (this.step === 1) this.step += 1;
    else this.showConfirmationPasswordPopup = true;
  }

  resetSettings() {
    this.temporaryMarketType = MarketType.SMART;
    this.temporarySlippage = 0.5;
  }

  toggleSettingsVisibility() {
    if (this.step === 2) return;

    this.showSettings = !this.showSettings;
    this.temporaryMarketType = this.marketType;
    this.temporarySlippage = this.slippage;
  }

  swapAssets() {
    if (this.receiveAssetId === '') return;

    const sendAssetId = this.sendAssetId;

    if (this.isExchangeB) this.sendAmount = this.receiveAmount;
    else this.receiveAmount = this.sendAmount;

    this.isExchangeB = !this.isExchangeB;
    this.sendAssetId = this.receiveAssetId;
    this.receiveAssetId = sendAssetId;

    this.checkSwap();
  }

  back() {
    if (this.step === 1) this.closeForm();
    else this.step -= 1;
  }

  updateMarketType(value: MarketType) {
    this.temporaryMarketType = value;
  }

  updateSlippage(value: number) {
    this.temporarySlippage = value;
  }

  calcTransferableXor() {
    const balance = this.currencyXOR!.balances.find(
      ({ name }) => name.toLowerCase() === this.soraNetworkName.toLowerCase()
    )!;

    return balance.transferable?.toString() ?? '';
  }

  calcTransferableSendMinusFee() {
    return calcTransferableSendMinusFee(this.sendCurrency, this.soraNetworkName, this.fee);
  }

  setMax() {
    this.isExchangeB = false;
    this.sendAmount = this.calcTransferableSendMinusFee();

    this.checkSwap();
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
  border-bottom: $secondary-border;

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
  border-bottom: $default-border;
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
    margin: 7px 0 14px;
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
    border: $secondary-border;
    opacity: 1;
    position: relative;
    top: -92px;
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
