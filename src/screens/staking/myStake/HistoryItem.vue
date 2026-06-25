<template>
  <div class="history-item" data-testid="historyItem" @click="openDetails">
    <div class="column left">
      <span class="name" data-testid="operationName">
        {{ operationName }}
      </span>

      <span class="date" data-testid="operationDate">
        {{ date }}
      </span>
    </div>

    <div class="column right">
      <div>
        <div class="amount" data-testid="operationAmount">{{ amount }} {{ symbol }}</div>

        <div class="value" data-testid="operationValue">{{ value }}</div>
      </div>

      <Icon icon="chevron-right" className="chevron" data-testid="operationDetails" @click="openDetails" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { getFormattedDate } from '@/helpers';
import { getHistoryValue } from '@/helpers/history';
import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'HistoryItem' ,
  props: {
    history: { type: Object },
    stakingAssetId: { type: String },
    rewardedAssetId: { type: String },
    network: { type: String },
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    operationName() {
      return this.$t(`history.${this.history.method}`);
    },
    method() {
      return this.history.method;
    },
    historyValue() {
      return getHistoryValue(this.history, this.stakingAssetId, this.network, this.address, true);
    },
    amount() {
      return `${this.historyValue.signTransfer}${this.$n(this.historyValue.value, 'decimalPrecise')}`;
    },
    networkFee() {
      return this.history.networkFee;
    },
    symbol() {
      if (this.method === 'rewarded') return this.rewardedCurrency?.symbol;

          return this.currency?.symbol;
    },
    date() {
      return getFormattedDate(this.history.timestamp);
    },
    currency() {
      return this.accountsStore.balances.find(({ groupId }) => groupId === this.stakingAssetId);
    },
    rewardedCurrency() {
      return this.accountsStore.balances.find(({ groupId }) => groupId === this.rewardedAssetId);
    },
    assetPrice() {
      const priceId = this.currency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    address() {
      if (BaseApi.isEthereumNetwork(this.network.toLowerCase())) return this.accountsStore.selectedWallet.ethereumAddress;

          const network = this.networksStore.getNetwork(this.network);

          return BaseApi.encodeAddress(this.accountsStore.selectedWallet.address, network.addressPrefix);
    },
    value() {
      const value = this.historyValue.value * this.assetPrice;

          return `${this.accountsStore.fiatSymbol}${this.$n(value, 'price')}`;
    },
  },
  methods: {
    openDetails() {
      this.$emit('openHistoryDetailsForm', this.history);
    },
  },
});
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
      font-size: 1em;
      color: $default-white;
    }

    .date {
      font-size: 0.75rem;
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
      font-size: 0.75rem;
      color: $grayish-white-2;
      text-align: right;
      margin-top: 5px;
    }
  }
}
</style>
