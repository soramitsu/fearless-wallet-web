<template>
  <div class="controller-account">
    <template v-if="step === 1">
      <InfoRow
        text="accounts.account"
        borderType="default"
        :value="accountName"
        :price="addressCut"
        :hideLastBorder="false"
      />

      <InfoRow text="staking.payoutAccount" borderType="default" :value="payeeCut" :hideLastBorder="false" />
    </template>

    <template v-else>
      <InputWithIcon
        v-model="addressCut"
        icon="close"
        placeholder="staking.payoutAccount"
        class="payout-account"
        @click="setPayoutAddress"
      />

      <div class="activity-buttons">
        <BadgeButton text="common.paste" @click="paste" />
      </div>

      <Hint text="staking.defaultPayout" iconName="notification" class="hint row" />

      <InfoRow
        class="info-fee"
        text="assets.networkFee"
        borderType="default"
        icon="info"
        :value="`${fee} ${asset}`"
        :price="valueString"
        :hideLastBorder="false"
        :iconClasses="['network-fee']"
      />

      <Tooltip text="assets.networkFee" target=".network-fee" placement="right" />

      <FLink text="staking.learnAboutRewards" class="about-controllers row" @click="openAboutRewards" />
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { SelectedWallet, GetAssetPrice, NetworkParams } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { cut, getClipboard } from '@/helpers';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class Payee extends Vue {
  @Prop({ type: Number }) step!: number;
  @Prop({ type: String }) fee!: string;
  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @PropSync('payoutAddress', { type: String }) syncedPayoutAddress!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get payee() {
    return this.stakingNetwork.payee;
  }

  get payeeCut() {
    return cut(this.payee);
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

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get valueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  paste() {
    this.syncedPayoutAddress = getClipboard();
  }

  setPayoutAddress(value = '') {
    this.syncedPayoutAddress = value;
  }

  openAboutRewards() {
    console.info('openAboutRewards');
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

  .about-controllers {
    margin-top: 10px;
  }

  .activity-buttons {
    display: flex;
    user-select: none;
    margin-bottom: 15px;
  }
}
</style>
