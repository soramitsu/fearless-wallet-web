<template>
  <div>
    <SelectInput
      text="assets.sendButtonText"
      :totalAmount="transferableAmount1"
      :value="value1"
      :asset="asset1"
      :assetId="assetId1"
      :amount="syncedAmount1"
      :isRotate="false"
      :showIcon="false"
      :showOriginValue="syncedIsExchangeB"
      @update:amount="updateAmount1"
      @setMax="setMax(false)"
    />

    <SelectInput
      class="input-to"
      text="assets.receiveButtonText"
      :totalAmount="transferableAmount2"
      :value="value2"
      :asset="asset2"
      :assetId="assetId2"
      :amount="syncedAmount2"
      :isRotate="false"
      :showIcon="false"
      :showOriginValue="!syncedIsExchangeB"
      @update:amount="updateAmount2"
      @setMax="setMax(true)"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { FPNumber } from '@sora-substrate/util';
import type { GetAssetPrice, PoolParams } from '@/store';
import type { TokenGroup } from '@/extension/background/extension-base/src/background/types/types';
import { calcTransferableSendMinusFee } from '@/helpers/currencies';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { getAmountPoolValue } from '@/extension/messaging';

@Component({
  components: {},
})
export default class InputsForm extends Vue {
  @PropSync('amount1', { type: String }) syncedAmount1!: string;
  @PropSync('amount2', { type: String }) syncedAmount2!: string;
  @PropSync('isExchangeB', { type: Boolean }) syncedIsExchangeB!: boolean;
  @Prop({ type: Object }) poolParams!: PoolParams;
  @Prop({ type: Object }) currency1!: TokenGroup;
  @Prop({ type: Object }) currency2!: TokenGroup;
  @Prop({ type: String }) fee!: string;
  @Prop(String) extrinsicType!: 'addLiquidity' | 'removeLiquidity' | '';
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get transferableAmount1() {
    if (this.extrinsicType === 'removeLiquidity') return this.poolParams.asset1.myAmount;

    return this.poolParams.asset1.transferableAmount;
  }

  get transferableAmount2() {
    if (this.extrinsicType === 'removeLiquidity') return this.poolParams.asset2.myAmount;

    return this.poolParams.asset2.transferableAmount;
  }

  get assetId1() {
    return this.poolParams.asset1.id;
  }

  get assetId2() {
    return this.poolParams.asset2.id;
  }

  get asset1() {
    return this.poolParams.asset1.name;
  }

  get asset2() {
    return this.poolParams.asset2.name;
  }

  get asset1Amount() {
    return this.poolParams.asset1.myAmount;
  }

  get assetPrice1() {
    const priceId = this.poolParams.asset1.priceId;

    return this.getAssetPrice(priceId).price;
  }

  get assetPrice2() {
    const priceId = this.poolParams.asset2.priceId;

    return this.getAssetPrice(priceId).price;
  }

  get value1() {
    return getCostOfAssets(+this.syncedAmount1 ?? 0, this.assetPrice1);
  }

  get value2() {
    return getCostOfAssets(+this.syncedAmount2 ?? 0, this.assetPrice2);
  }

  @Watch('syncedAmount1')
  @Watch('syncedAmount2')
  async watcherAmount() {
    if (this.extrinsicType === 'addLiquidity') {
      if (this.syncedIsExchangeB) {
        if (this.poolParams.asset2.reserve === '0') return;

        this.syncedAmount1 = new FPNumber(this.syncedAmount2)
          .mul(FPNumber.fromCodecValue(this.poolParams.asset1.reserve))
          .div(FPNumber.fromCodecValue(this.poolParams.asset2.reserve))
          .toString();
      } else {
        if (this.poolParams.asset1.reserve === '0') return;

        this.syncedAmount2 = new FPNumber(this.syncedAmount1)
          .mul(FPNumber.fromCodecValue(this.poolParams.asset2.reserve))
          .div(FPNumber.fromCodecValue(this.poolParams.asset1.reserve))
          .toString();
      }

      return;
    }

    const params = {
      amount1: this.syncedAmount1,
      amount2: this.syncedAmount2,
      assetId1: this.assetId1,
      assetId2: this.assetId2,
      networkName: this.poolParams.network,
      isExchangeB: this.syncedIsExchangeB,
    };

    if (this.syncedIsExchangeB) this.syncedAmount1 = await getAmountPoolValue(params);
    else this.syncedAmount2 = await getAmountPoolValue(params);
  }

  updateAmount1(value: string) {
    this.syncedAmount1 = value;
    this.syncedIsExchangeB = false;
  }

  updateAmount2(value: string) {
    this.syncedAmount2 = value;
    this.syncedIsExchangeB = true;
  }

  calcTransferableSendMinusFee(isExchangeB: boolean) {
    const currency = isExchangeB ? this.currency2 : this.currency1;

    return calcTransferableSendMinusFee(currency, this.poolParams.network, this.fee);
  }

  setMax(isExchangeB: boolean) {
    if (this.extrinsicType === 'removeLiquidity') this.syncedAmount1 = this.transferableAmount1;
    else {
      this.syncedIsExchangeB = isExchangeB;

      if (isExchangeB) this.syncedAmount2 = this.calcTransferableSendMinusFee(isExchangeB);
      else this.syncedAmount1 = this.calcTransferableSendMinusFee(isExchangeB);
    }
  }
}
</script>

<style lang="scss" scoped>
.input-to {
  margin: 7px 0 14px;
}
</style>
