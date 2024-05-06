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
      @update:amount="updateAmount1"
      @setMax="setMax"
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
      @update:amount="updateAmount2"
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

@Component({
  components: {},
})
export default class InputsForm extends Vue {
  isExchangeB = false;

  @PropSync('amount1', { type: String }) syncedAmount1!: string;
  @PropSync('amount2', { type: String }) syncedAmount2!: string;
  @Prop({ type: Object }) poolParams!: PoolParams;
  @Prop({ type: Object }) currency1!: TokenGroup;
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
  watcherAmount() {
    if (this.isExchangeB)
      this.syncedAmount1 = new FPNumber(this.syncedAmount2)
        .mul(FPNumber.fromCodecValue(this.poolParams.asset1.reserve))
        .div(FPNumber.fromCodecValue(this.poolParams.asset2.reserve))
        .toString();
    else
      this.syncedAmount2 = new FPNumber(this.syncedAmount1)
        .mul(FPNumber.fromCodecValue(this.poolParams.asset2.reserve))
        .div(FPNumber.fromCodecValue(this.poolParams.asset1.reserve))
        .toString();
  }

  updateAmount1(value: string) {
    this.syncedAmount1 = value;
    this.isExchangeB = false;
  }

  updateAmount2(value: string) {
    this.syncedAmount2 = value;
    this.isExchangeB = true;
  }

  calcTransferableSendMinusFee() {
    return calcTransferableSendMinusFee(this.currency1, this.poolParams.network, this.fee);
  }

  setMax() {
    if (this.extrinsicType === 'removeLiquidity') this.syncedAmount1 = this.transferableAmount1;
    else this.syncedAmount1 = this.calcTransferableSendMinusFee();
  }
}
</script>

<style lang="scss" scoped>
.input-to {
  margin: 7px 0 14px;
}
</style>
