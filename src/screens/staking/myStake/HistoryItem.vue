<template>
  <div class="history-item" @click="openDetails">
    <div class="column left">
      <span class="name">
        {{ operationName }}
      </span>

      <span class="date">
        {{ date }}
      </span>
    </div>

    <div class="column right">
      <div>
        <div class="amount">{{ amount }} {{ symbol }}</div>

        <div class="value">{{ value }}</div>
      </div>

      <Icon icon="chevron-right" className="chevron" @click="openDetails" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetPrice, GetNetwork, SelectedWallet } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { getFormattedDate } from '@/helpers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { getHistoryValue } from '@/helpers/history';
import BaseApi from '@/util/BaseApi';
import { type SoraHistoryElement } from '@/interfaces/history';
import { type NetworkName } from '@/interfaces';

@Component
export default class HistoryItem extends Vue {
  @Prop({ type: Object }) history!: SoraHistoryElement;
  @Prop({ type: String }) stakingAssetId!: string;
  @Prop({ type: String }) rewardedAssetId!: string;
  @Prop({ type: String }) network!: NetworkName;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get operationName() {
    return this.$t(`history.${this.history.method}`);
  }

  get method() {
    return this.history.method;
  }

  get historyValue() {
    return getHistoryValue(this.history, this.stakingAssetId, this.network, this.address, true);
  }

  get amount() {
    return `${this.historyValue.signTransfer}${this.$n(this.historyValue.value, 'decimalPrecise')}`;
  }

  get networkFee() {
    return this.history.networkFee;
  }

  get symbol() {
    if (this.method === 'rewarded') return this.rewardedCurrency?.symbol;

    return this.currency?.symbol;
  }

  get date() {
    return getFormattedDate(this.history.timestamp);
  }

  get currency() {
    return this.balances.find(({ assetId }) => assetId === this.stakingAssetId);
  }

  get rewardedCurrency() {
    return this.balances.find(({ assetId }) => assetId === this.rewardedAssetId);
  }

  get assetPrice() {
    const priceId = this.currency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get address() {
    if (BaseApi.isEthereumNetwork(this.network.toLowerCase())) return this.selectedWallet.ethereumAddress;

    const network = this.getNetwork(this.network);

    return BaseApi.encodeAddress(this.selectedWallet.address, network.addressPrefix);
  }

  get value() {
    const value = this.historyValue.value * this.assetPrice;

    return `${this.fiatSymbol}${this.$n(value, 'price')}`;
  }

  openDetails() {
    this.$emit('openHistoryDetailsForm', this.history);
  }
}
</script>

<style lang="scss" scoped>
.history-item {
  display: flex;
  justify-content: space-between;
  border-bottom: $secondary-border;
  padding: 15px 0;
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }

  .column {
    display: flex;

    .name {
      font-size: 16px;
      color: $default-white;
    }

    .date {
      font-size: 12px;
      color: $grayish-white-2;
      text-align: left;
      margin-top: 5px;
    }
  }

  .left {
    text-align: left;
    flex-direction: column;
  }

  .right {
    text-align: right;
    align-items: center;
    height: 38px;
    max-width: 325px;

    .chevron {
      width: 20px;
      height: 20px;
      margin-left: 10px;
      color: $gray-color;
    }

    .amount {
      color: $default-white;
      text-transform: uppercase;
    }

    .value {
      font-size: 12px;
      color: $grayish-white-2;
      text-align: right;
      margin-top: 5px;
    }
  }
}
</style>
