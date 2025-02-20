<template>
  <div class="controller-account">
    <template v-if="step === 1">
      <InfoRow
        text="accounts.account"
        borderType="default"
        data-testid="accountName"
        :value="accountNameCut"
        :price="addressCut"
        :hideLastBorder="false"
      />

      <InfoRow
        text="staking.payoutAccount"
        borderType="default"
        data-testid="infoPayoutAccount"
        :value="payeeCut"
        :hideLastBorder="false"
      />
    </template>

    <template v-else>
      <InputWithIcon
        :value="addressCut"
        icon="close"
        placeholder="staking.payoutAccount"
        class="payout-account"
        data-testid="inputAddress"
        @click="setPayoutAddress"
      />

      <slot></slot>

      <Hint text="staking.defaultPayout" iconName="notification" class="hint row" />
    </template>

    <InfoRow
      v-show="step !== 1"
      class="info-fee"
      text="assets.networkFee"
      borderType="default"
      icon="info"
      data-testid="assetsNetworkFee"
      :value="`${fee} ${asset}`"
      :price="valueString"
      :hideLastBorder="false"
      :iconClasses="['staking-fee']"
    />

    <Tooltip text="staking.stakingFee" target=".staking-fee" placement="right" data-testid="stakingFee" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import type { NetworkParams } from '@/stores';
import type { TokenGroup } from '@extension-base/background/types/types';
import { cut } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class Payee extends Vue {
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();

  @Prop({ type: Number }) step!: number;
  @Prop({ type: String }) fee!: string;
  @Prop({ type: Object }) stakingCurrency!: TokenGroup;
  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @PropSync('payoutAddress', { type: String }) syncedPayoutAddress!: string;

  get payeeName() {
    return this.stakingNetwork.payeeName;
  }

  get payeeCut() {
    return cut(this.payeeName);
  }

  get asset() {
    return this.stakingCurrency.symbol;
  }

  get addressCut() {
    return cut(this.syncedPayoutAddress);
  }

  get accountNameCut() {
    return cut(this.accountsStore.selectedWallet.name);
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.networksStore.getAssetPrice(priceId).price;
  }

  get valueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.accountsStore.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  setPayoutAddress(value = '') {
    this.syncedPayoutAddress = value;
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

  .payout-account {
    margin-top: 10px;
  }

  .hint {
    margin: 15px 0;
  }

  .row {
    margin-left: 15px;
  }
}
</style>
