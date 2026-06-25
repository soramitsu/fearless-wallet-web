<template>
  <AboveForm :fullScreen="true" @closeHandler="closeForm">
    <template v-slot:header>
      <PolkaswapSettingsHeader
        :marketType="marketType"
        :showSettings="showSettings"
        :showPolkaswapIcon="showPolkaswapIcon"
        :showBackIcon="showBackIcon"
        :showCloseIcon="showCloseIcon"
        :settingHide="step === 2"
        :header="header"
        @back="back"
        @toggleSettingsVisibility="toggleSettingsVisibility"
        @closeForm="closeForm"
      />
    </template>

    <Scroll>
      <div class="swap">
        <div class="swap-content">
          <PolkaswapSettings
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
              :showOriginValue="isExchangeB"
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
              :showOriginValue="!isExchangeB"
              @update:amount="updateReceiveAmount"
              @togglePopupVisibility="toggleSelectAssetPopupVisibility.call(null, 'receive')"
            />

            <div :class="classesSwapIcon" data-testid="swapAssets" @click="swapAssets">
              <Icon icon="swap" class="img" />
            </div>

            <template v-if="showSwapInfo">
              <div class="row" data-testid="AtoB">
                {{ sendAssetUP }} / {{ receiveAssetUP }}

                <div class="fiat-info">
                  <div data-testid="AtoBprice">{{ AToBCut }}</div>
                  <div class="price" data-testid="AtoBfiatPrice">{{ AToBValueCut }}</div>
                </div>
              </div>

              <div class="row" data-testid="BtoA">
                {{ receiveAssetUP }} / {{ sendAssetUP }}

                <div class="fiat-info">
                  <div data-testid="BtoAprice">{{ BToACut }}</div>
                  <div class="price" data-testid="BtoAfiatPrice">{{ BToAValueCut }}</div>
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
            :sendAssetUP="sendAssetUP"
            :receiveAssetUP="receiveAssetUP"
            :isExchangeB="isExchangeB"
            :route="route"
          />
        </div>

        <div>
          <template v-if="!showSettings">
            <PolkaswapAlert />

            <PoolsBanner class="banner-pools" />
          </template>

          <div class="buttons">
            <FButton
              v-if="showSettings"
              size="big"
              text="assets.resetToDefault"
              type="secondary"
              width="49%"
              :border="false"
              data-testId="resetToDefault"
              @click="resetSettings"
            />

            <FButton
              size="big"
              :text="buttonText"
              :disabled="buttonPreviewDisabled"
              :width="widthButton"
              data-testid="proceed"
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
import { defineComponent } from 'vue';

import { FPNumber } from '@sora-substrate/util';
import SwapPreview from '@/screens/polkaswap/swap/SwapPreview.vue';
import PolkaswapAlert from '@/screens/polkaswap/PolkaswapAlert.vue';
import SwapInfo from '@/screens/polkaswap/swap/SwapInfo.vue';
import PolkaswapSettings from '@/screens/polkaswap/PolkaswapSettings.vue';
import PolkaswapSettingsHeader from '@/screens/polkaswap/PolkaswapSettingsHeader.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import Disclaimer from '@/screens/polkaswap/swap/Disclaimer.vue';
import PoolsBanner from '@/screens/pools/PoolsBanner.vue';
import { checkSwap } from '@/extension/messaging';
import {
  getCurrencyOptions,
  getXORCurrency,
  calcTransferableSendMinusFee,
  isValidAmountAsset,
} from '@/helpers/currencies';
import { getCostOfAssets } from '@/helpers/transfers';
import { MarketType, type SwapOptions } from '@/interfaces';
import { addNumbers } from '@/helpers/numbers';
import { SORA_NETWORK_NAME, SORA_UTILITY_ASSET, SORA_XOR_ASSET_ID } from '@/consts/sora';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const SWAP_INTERVAL_RECALCULATE = 10000;

export default defineComponent({ name: 'SwapForm',
  components: {
    SwapInfo,
    Disclaimer,
    SwapPreview,
    PoolsBanner,
    PolkaswapAlert,
    PolkaswapSettings,
    PolkaswapSettingsHeader,
    ConfirmationPasswordPopup,
  },
  data() {
    return {
      soraNetworkName: SORA_NETWORK_NAME,
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      step: 1,
      slippage: 0.5,
      temporarySlippage: 0.5,
      marketType: MarketType.SMART,
      temporaryMarketType: MarketType.SMART,
      sendAssetId: '',
      receiveAssetId: '',
      sendAmount: '',
      receiveAmount: '',
      minMaxAmount: '',
      selectAssetType: '',
      route: '',
      AToB: '',
      BToA: '',
      filterValue: '',
      showSettings: false,
      showConfirmationPasswordPopup: false,
      isExchangeB: false,
      tx: {} as SwapOptions,
      swapInterval: undefined as ReturnType<typeof setInterval> | undefined,
    };
  },
  computed: {
    showBackIcon() {
      return !this.showSettings;
    },
    showPolkaswapIcon() {
      return this.step === 1 && !this.showSettings;
    },
    fee() {
      return this.networksStore.soraFees?.Swap ?? '';
    },
    showCloseIcon() {
      if (this.showSettings) return true;

          return this.step !== 1;
    },
    sendAssetPrice() {
      const priceId = this.sendCurrency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    receiveAssetPrice() {
      const priceId = this.receiveCurrency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    classesSwapIcon() {
      return ['swap-icon', { 'swap-icon-disable': this.receiveAssetId === '' }];
    },
    currencyXOR() {
      return getXORCurrency(this.accountsStore.balances);
    },
    feePrice() {
      const fee = this.fee ?? 0;
          const balance = this.networksStore.getAssetPrice(this.currencyXOR?.priceId ?? '').price * +fee;

          return this.$n(+balance, 'price');
    },
    soraMainAssetUpper() {
      return SORA_UTILITY_ASSET.toUpperCase();
    },
    minMaxAmountPrice() {
      const price = (
            this.isExchangeB
              ? getCostOfAssets(+this.minMaxAmount, this.networksStore.getAssetPrice(this.sendAssetId).price)
              : getCostOfAssets(+this.minMaxAmount, this.networksStore.getAssetPrice(this.receiveAssetId).price)
          ) as number;

          return `${this.accountsStore.fiatSymbol} ${this.$n(price ?? 0, 'price')}`;
    },
    minMaxAmountCut() {
      return `${this.$n(+this.minMaxAmount, 'decimal')} ${this.minMaxAssetName}`;
    },
    minMaxAssetName() {
      return this.isExchangeB ? this.sendAssetUP : this.receiveAssetUP;
    },
    AToBCut() {
      const value = +this.$n(+this.AToB, 'decimal') || '0';

          return `${value} ${this.receiveAssetUP}`;
    },
    BToACut() {
      const value = +this.$n(+this.BToA, 'decimal') || '0';

          return `${value} ${this.sendAssetUP}`;
    },
    AToBValueCut() {
      const cost = (getCostOfAssets(this.transferableSendAmount, this.sendAssetPrice) as number) ?? 0;
          const value = this.$n(cost, 'price') || '0';

          return `${this.accountsStore.fiatSymbol} ${value}`;
    },
    BToAValueCut() {
      const cost = (getCostOfAssets(+this.transferableReceiveAmount, this.receiveAssetPrice) as number) ?? 0;
          const value = this.$n(cost, 'price') || '0';

          return `${this.accountsStore.fiatSymbol} ${value}`;
    },
    widthButton() {
      return this.showSettings ? '49%' : '100%';
    },
    classesSettings() {
      return ['settings', { 'setting-hide': this.step === 2 }];
    },
    header() {
      if (this.showSettings) return this.$t('assets.swapSettings');

          if (this.step === 1) return this.$t('assets.polkaswap');

          return this.$t('assets.swapPreview');
    },
    showSwapInfo() {
      return this.sendAssetId !== '' && this.receiveAssetId !== '' && this.sendAmount !== '' && this.receiveAmount !== '';
    },
    sendCurrency() {
      return this.accountsStore.balances.find(({ groupId }) => groupId === this.sendAssetId);
    },
    sendAssetName() {
      return this.sendCurrency?.symbol ?? '';
    },
    sendAssetIcon() {
      return this.sendCurrency?.groupId ?? '';
    },
    receiveCurrency() {
      return this.accountsStore.balances.find(({ groupId }) => groupId === this.receiveAssetId);
    },
    receiveAssetName() {
      return this.receiveCurrency?.symbol ?? '';
    },
    receiveAssetIcon() {
      return this.receiveCurrency ? this.receiveCurrency.icon : '';
    },
    showSelectPopup() {
      return this.selectAssetType !== '';
    },
    optionsCurrency() {
      const filter = this.filterValue.toLowerCase();
          const tokensGroupFilteredByNetwork = this.accountsStore.balances.filter(({ balances }) => {
            return balances.some(({ name }) => name.toLowerCase() === this.soraNetworkName.toLowerCase());
          });

          const tokens = getCurrencyOptions(tokensGroupFilteredByNetwork).filter(({ name, value }) => {
            if (!name.toLowerCase().includes(filter)) return false;

            const id = this.isSendAssetType ? this.receiveAssetId : this.sendAssetId;

            return value !== id;
          });

          return tokens;
    },
    top() {
      return this.isSendAssetType ? 145 : 248;
    },
    selectPopupValue() {
      if (this.isSendAssetType) return this.sendAssetId;

          return this.receiveAssetId;
    },
    isSendAssetType() {
      return this.selectAssetType === 'send';
    },
    isReceiveAssetType() {
      return this.selectAssetType === 'receive';
    },
    buttonText() {
      if (this.showSettings) return 'common.save';

          if (this.sendAmount !== '' && this.receiveAmount !== '' && this.fee === '') return 'assets.calculateFee';

          if (!this.isValidSendAsset) return { text: 'assets.insufficientBalance', localeProps: { asset: this.sendAssetUP } };

          if (!this.isValidTransferByXOR)
            return { text: 'assets.insufficientBalance', localeProps: { asset: this.soraMainAssetUpper } };

          if (+this.sendAmount === 0 || +this.receiveAmount === 0) return { text: 'assets.insufficientLiquidity' };

          return this.step === 1 ? 'assets.preview' : 'common.confirm';
    },
    buttonPreviewDisabled() {
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
    },
    isValidSendAsset() {
      return isValidAmountAsset(this.sendCurrency, this.soraNetworkName, this.fee, this.sendAmount);
    },
    isValidTransferByXOR() {
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
    },
    sendAssetUP() {
      return this.sendAssetName.toUpperCase();
    },
    receiveAssetUP() {
      return this.receiveAssetName.toUpperCase();
    },
    sendCurrencyBalance() {
      return this.sendCurrency?.balances.find(
            (balance) => balance.name.toLowerCase() === this.soraNetworkName.toLowerCase()
          );
    },
    transferableSendAmount() {
      return +(this.sendCurrencyBalance?.transferable ?? 0);
    },
    transferableReceiveAmount() {
      return +(
            this.receiveCurrency?.balances.find(
              (balance) => balance.name.toLowerCase() === this.soraNetworkName.toLowerCase()
            )?.transferable ?? 0
          );
    },
    sendValue() {
      return getCostOfAssets(+(this.sendAmount ?? 0), this.sendAssetPrice, 'string');
    },
    receiveValue() {
      return getCostOfAssets(+(this.receiveAmount ?? 0), this.receiveAssetPrice, 'string');
    },
  },
  created() {
    this.updateComponentParams();
  },
  activated() {
    this.updateComponentParams();
  },
  deactivated() {
    this.selectAssetType = '';
        this.step = 1;
  },
  methods: {
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
    },
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
            const { amountA, amountB, AToB, BToA, swapOptions, minMaxValue, route } = await checkSwap({
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
            this.AToB = AToB;
            this.BToA = BToA;
            this.route = route;
          };

          this.clearSwapInterval();
          this.swapInterval = setInterval(createSwap, SWAP_INTERVAL_RECALCULATE);

          createSwap();
    },
    clearSwapInterval() {
      clearInterval(this.swapInterval);
    },
    closeForm() {
      if (this.showSettings) {
            this.toggleSettingsVisibility();

            return;
          }

          this.clearSwapInterval();
          this.$router.back();
    },
    async updateSendAmount(value: string) {
      this.isExchangeB = false;
          this.sendAmount = value;

          this.checkSwap();
    },
    async updateReceiveAmount(value: string) {
      this.isExchangeB = true;
          this.receiveAmount = value;

          this.checkSwap();
    },
    toggleSelectedAsset(value: string) {
      if (this.isSendAssetType) this.sendAssetId = value;
          else this.receiveAssetId = value;

          this.checkSwap();
          this.toggleSelectAssetPopupVisibility('');
    },
    confirmationPasswordPopupClose(closeForm: boolean) {
      this.showConfirmationPasswordPopup = false;

          if (closeForm) {
            this.sendAmount = '';
            this.receiveAmount = '';
            this.step = 1;

            this.clearSwapInterval();
          }
    },
    handlerFilter(value: string) {
      this.filterValue = value;
    },
    toggleSelectAssetPopupVisibility(value: 'send' | 'receive' | '') {
      if (this.selectAssetType !== '') this.selectAssetType = '';
          else this.selectAssetType = value;

          this.filterValue = '';
    },
    async proceed() {
      if (this.showSettings) {
            this.marketType = this.temporaryMarketType;
            this.slippage = this.temporarySlippage;
            this.showSettings = false;

            await this.checkSwap();
          } else if (this.step === 1) this.step += 1;
          else this.showConfirmationPasswordPopup = true;
    },
    resetSettings() {
      this.temporaryMarketType = MarketType.SMART;
          this.temporarySlippage = 0.5;

          this.proceed();
    },
    toggleSettingsVisibility() {
      this.showSettings = !this.showSettings;
          this.temporaryMarketType = this.marketType;
          this.temporarySlippage = this.slippage;
    },
    swapAssets() {
      if (this.receiveAssetId === '') return;

          const sendAssetId = this.sendAssetId;

          if (this.isExchangeB) this.sendAmount = this.receiveAmount;
          else this.receiveAmount = this.sendAmount;

          this.isExchangeB = !this.isExchangeB;
          this.sendAssetId = this.receiveAssetId;
          this.receiveAssetId = sendAssetId;

          this.checkSwap();
    },
    back() {
      if (this.step === 1) this.closeForm();
          else this.step -= 1;
    },
    updateMarketType(value: MarketType) {
      this.temporaryMarketType = value;
    },
    updateSlippage(value: number) {
      this.temporarySlippage = value;
    },
    calcTransferableXor() {
      const balance = this.currencyXOR!.balances.find(
            ({ name }) => name.toLowerCase() === this.soraNetworkName.toLowerCase()
          )!;

          return balance.transferable?.toString() ?? '';
    },
    calcTransferableSendMinusFee() {
      return calcTransferableSendMinusFee(this.sendCurrency, this.soraNetworkName, this.fee);
    },
    setMax() {
      this.isExchangeB = false;
          this.sendAmount = this.calcTransferableSendMinusFee();

          this.checkSwap();
    },
  },
});
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

.buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
}

.img {
  height: 20px;
  width: 20px;
}

.swap-icon-disable {
  cursor: not-allowed !important;
  background-color: rgb(29, 29, 29) !important;
}

.swap {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.banner-pools {
  margin-top: 10px;
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
</style>
