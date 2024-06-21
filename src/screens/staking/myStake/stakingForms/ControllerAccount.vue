<template>
  <div class="controller-account">
    <template v-if="step === 1">
      <InfoRow
        text="staking.stashAccount"
        data-testid="stashAccount"
        borderType="default"
        :value="accountName"
        :hideLastBorder="false"
      />

      <InfoRow
        text="staking.setController"
        data-testid="controllerAccount"
        borderType="default"
        :value="controllerCut"
        :hideLastBorder="false"
      />
    </template>

    <template v-else>
      <Hint text="staking.stashBond" iconName="notification" class="hint row" />

      <InputWithIcon
        :value="addressCut"
        icon="close"
        placeholder="staking.setController"
        data-testid="controllerAccountInput"
        @click="setControllerAddress"
      />

      <Alert
        v-if="!isValidController"
        message="staking.alreadyControlling"
        sizeText="small"
        class="already-controlling"
      />

      <slot></slot>

      <Hint text="staking.controllerUnbond" iconName="notification" class="hint row" />
    </template>

    <InfoRow
      v-show="step !== 1"
      class="info-fee"
      text="assets.networkFee"
      borderType="default"
      icon="info"
      data-testid="networkFee"
      :value="`${fee} ${asset}`"
      :price="valueString"
      :hideLastBorder="false"
      :iconClasses="['network-fee']"
    />

    <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { SelectedWallet, GetAssetPrice, NetworkParams } from '@/store';
import type { TokenGroup } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { cut } from '@/helpers';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component({})
export default class ControllerAccount extends Vue {
  @Prop({ type: Number }) step!: number;
  @Prop({ type: String }) fee!: string;
  @Prop({ type: Object }) stakingCurrency!: TokenGroup;
  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @Prop({ type: Boolean }) isValidController!: boolean;
  @PropSync('controllerAddress', { type: String }) syncedControllerAddress!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get controllerName() {
    return this.stakingNetwork.controllerName;
  }

  get controllerCut() {
    return cut(this.controllerName);
  }

  get asset() {
    return this.stakingCurrency.symbol;
  }

  get addressCut() {
    return cut(this.syncedControllerAddress);
  }

  get accountName() {
    return cut(this.stakingNetwork.stashName);
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get valueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  setControllerAddress(value = '') {
    this.syncedControllerAddress = value;
  }
}
</script>

<style lang="scss" scoped>
.controller-account {
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .info-fee {
    margin-top: 10px;
    margin-bottom: 20px;
  }

  .hint {
    margin: 15px 0;
  }

  .row {
    margin-left: 15px;
  }

  .already-controlling {
    margin: 10px 0;
  }
}
</style>
