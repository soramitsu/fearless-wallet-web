<template>
  <div class="controller-account">
    <template v-if="step === 1">
      <InfoRow
        text="accounts.account"
        borderType="default"
        data-testid="accountName"
        :value="accountName"
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
        v-model="addressCut"
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
import { Getter } from 'vuex-class';
import type { SelectedWallet, GetAssetPrice, NetworkParams } from '@/store';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { cut } from '@/helpers';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class Payee extends Vue {
  @Prop({ type: Number }) step!: number;
  @Prop({ type: String }) fee!: string;
  @Prop({ type: Object }) stakingCurrency!: TokenGroup;
  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @PropSync('payoutAddress', { type: String }) syncedPayoutAddress!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

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

  get accountName() {
    return this.selectedWallet.name;
  }

  get filteredWallets() {
    return this.wallets.filter(({ active }) => !active);
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get valueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
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
