<template>
  <AboveForm header="asset.polkaswap" :fullScreen="true" :closeHandler="closeForm">
    <template v-slot:header>
      <div class="header-content">
        <div class="back" @click="back">
          <Icon icon="chevron-left" class="img" />
        </div>

        <div class="header">{{ $t('asset.polkaswap') }}</div>

        <div class="settings" @click="openSettings">
          <div class="settings-text">{{ marketUP }}</div>

          <div class="settings-circle">
            <Icon icon="settings" class="img" />
          </div>
        </div>
      </div>
    </template>

    <Scroll>
      <div class="swap-content">
        <template v-if="step === 1">
          <SwapSelectInput
            text="asset.sendButtonText"
            balance="1"
            :price="sendPrice"
            :asset="sendAsset"
            :amount="sendAmount"
            :isRotate="isRotateSend"
            @update:amount="updateSendAmount"
            @setMax="setMax"
            @toggleSelectAssetPopupVisibility="toggleSelectAssetPopupVisibility.call(null, 'send')"
          />

          <div class="swap-icon">
            <Icon icon="swap" class="img" />
          </div>

          <SwapSelectInput
            class="receive-input"
            text="asset.receiveButtonText"
            balance="1"
            :price="receivePrice"
            :asset="receiveAsset"
            :amount="receiveAmount"
            :isRotate="isRotateReceive"
            @update:amount="updateReceiveAmount"
            @setMax="setMax"
            @toggleSelectAssetPopupVisibility="toggleSelectAssetPopupVisibility.call(null, 'receive')"
          />

          <div class="row">
            {{ sendAssetUP }} / {{ receiveAssetUP }}

            <div class="fiat-info">
              <div>{{ sendAmount }}</div>

              <div class="price">{{ fiatSymbol }} {{ sendPrice }}</div>
            </div>
          </div>

          <div class="row">
            {{ receiveAssetUP }} / {{ sendAssetUP }}

            <div class="fiat-info">
              <div>{{ receiveAmount }}</div>

              <div class="price">{{ fiatSymbol }} {{ receivePrice }}</div>
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

          <div class="row">
            Network fee

            <div class="fiat-info">
              <div>{{ fee }}</div>

              <div class="price">{{ fiatSymbol }} {{ feePrice }}</div>
            </div>
          </div>
        </template>

        <Button size="big" :text="buttonText" :disabled="buttonPreviewDisabled" @click="proceed" />
      </div>
    </Scroll>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import SwapSelectInput from '@/screens/wallet&asset/SwapSelectInput.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component({
  components: {
    SwapSelectInput,
  },
})
export default class SwapForm extends Vue {
  step = 1;
  market = 'smart';
  sendAsset = 'XOR';
  receiveAsset = 'KSM';
  sendAmount = '1';
  sendPrice = '1';
  receiveAmount = '1';
  receivePrice = '1';
  minReceivedAmount = '1';
  minReceivedPrice = '1';
  priceImpact = '1';
  fee = '1';
  feePrice = '1';
  selectAssetType = '';

  @Prop(Function) closeForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get isRotateSend() {
    return this.selectAssetType === 'send';
  }

  get isRotateReceive() {
    return this.selectAssetType === 'receive';
  }

  get showSelectSendAsset() {
    return false;
  }

  get showReceiveAsset() {
    return false;
  }

  get buttonText() {
    return this.step === 1 ? 'asset.preview' : 'common.confirm';
  }

  get buttonPreviewDisabled() {
    return this.sendAsset === '' || this.receiveAsset === '' || this.sendAmount === '';
  }

  get marketUP() {
    return this.market.toUpperCase();
  }

  get sendAssetUP() {
    return this.sendAsset.toUpperCase();
  }

  get receiveAssetUP() {
    return this.receiveAsset.toUpperCase();
  }

  toggleSelectAssetPopupVisibility(value: 'send' | 'receive') {
    if (this.selectAssetType !== '') this.selectAssetType = '';
    else this.selectAssetType = value;
  }

  updateSendAmount(value: string) {
    this.sendAmount = value;
  }

  updateReceiveAmount(value: string) {
    this.receiveAmount = value;
  }

  proceed() {
    if (this.step === 1) this.step += 1;
    else {
      // this.swap(); // TODO
    }
  }

  openSettings() {
    console.info('open settings');
  }

  swapAssets() {
    const sendAsset = this.sendAsset;

    this.sendAsset = this.receiveAsset;
    this.receiveAsset = sendAsset;
  }

  back() {
    if (this.step === 1) this.closeForm();
    else this.step -= 1;
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

  :last-child {
    border: none;
  }

  .fiat-info {
    text-align: right;
    display: flex;
    flex-direction: column;

    .amount {
      color: $default-white;
      margin-bottom: 3px;
    }

    .price {
      color: $gray-color;
    }
  }
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
  width: 112px !important;
  height: 20px;
  opacity: 0.65;
  cursor: pointer;
}

.img {
  height: 20px;
  width: 20px;
}

.swap-content {
  color: $default-white;

  .receive-input {
    margin: 7px 0 32px;
  }

  .swap-icon {
    border-radius: 50%;
    background-color: $secondary-background-color;
    width: 46px;
    height: 46px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin: -23px auto;
    border: 1px solid $secondary-background-color;
    opacity: 1;
    cursor: pointer;
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
</style>
