<template>
  <TransferForm
    extrinsicType="transfer"
    header="assets.sendFunds"
    :assetId="assetId"
    :selectedNetwork="selectedNetwork"
    :amount="amount"
    :value="value"
    :partialFee="partialFee"
    :recipient="recipient"
    @closeForm="closeForm"
    @update:assetId="updateAssetId"
    @update:selectedNetwork="updateSelectedNetwork"
    @update:amount="updateAmount"
    @update:value="updateValue"
    @update:partialFee="updatePartialFee"
    @update:recipient="updateRecipient"
  >
    <template v-slot:step2>
      <div>
        <div class="row direction-column">
          <FInput
            :value="accountsStore.selectedWallet.name"
            placeholder="assets.from"
            size="big"
            :readonly="true"
            data-testid="fromWallet"
          />

          <Icon icon="chevron-right" class="arrow-icon" />

          <FInput
            :value="formattedAddressTo"
            placeholder="assets.to"
            size="big"
            :readonly="true"
            data-testid="toAddress"
          />
        </div>

        <FCorners size="big" class="row">
          <div class="summary">
            <div class="summary-label">{{ $t('assets.summary') }}</div>

            <InfoRow text="assets.assetsAmount" :value="amountString" :price="valueString" />
            <InfoRow text="assets.networkFee" :value="partialFeeString" :price="fiatFeeString" />
            <InfoRow v-if="isUtilityAsset" text="assets.total" :value="totalString" :price="fiatTotalString" />
          </div>
        </FCorners>
      </div>
    </template>
  </TransferForm>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import TransferForm from '@/screens/wallet&asset/TransferForm.vue';
import { addNumbers } from '@/helpers/numbers';
import { getUtilityAsset } from '@/helpers/currencies';
import { isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'SendForm',
  components: { TransferForm },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      partialFee: '',
      selectedNetwork: '',
      assetId: '',
      recipient: '',
      amount: '',
      value: '',
    };
  },
  computed: {
    currency() {
      return this.accountsStore.balances.find(({ balances }) =>
            balances.some(({ id }) => id.toLowerCase() === this.assetId.toLowerCase())
          );
    },
    isUtilityAsset() {
      return this.currency?.balances.some(({ isUtility, name }) => isUtility && isSameString(name, this.selectedNetwork));
    },
    partialFeeString() {
      const utilityAsset = getUtilityAsset(this.accountsStore.balances, this.selectedNetwork);
          const symbol = utilityAsset ? utilityAsset.symbol : '';

          return `${this.$n(+this.partialFee, 'decimalPrecise')} ${symbol.toUpperCase()}`;
    },
    showValue() {
      return this.value !== '0';
    },
    assetPrice() {
      return this.networksStore.getAssetPrice(this.currency?.priceId ?? '')?.price ?? 0;
    },
    originNet() {
      return this.networksStore.getNetwork(this.selectedNetwork);
    },
    originalUtilityId() {
      return this.originNet?.assets[0].id ?? ''; // [0] - is utility asset
    },
    feeAssetPrice() {
      const currency = this.accountsStore.balances.find(({ balances }) =>
            balances.some(({ id }) => id === this.originalUtilityId)
          );
          const priceId = currency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    fiatFeeString() {
      return `${this.accountsStore.fiatSymbol}${this.$n(+this.partialFee * this.feeAssetPrice, 'price')}`;
    },
    valueString() {
      return `${this.accountsStore.fiatSymbol}${this.$n(+this.value, 'price')}`;
    },
    amountString() {
      return `${+this.amount} ${this.selectedAssetUpper}`;
    },
    formattedAddressTo() {
      return `${this.recipient.slice(0, 7)}...${this.recipient.slice(-8)}`;
    },
    selectedAsset() {
      return this.currency?.balances?.find(
            (el) =>
              el.symbol.toLowerCase() === this.assetId.toLowerCase() || el.id.toLowerCase() === this.assetId.toLowerCase()
          );
    },
    selectedAssetUpper() {
      return this.selectedAsset?.symbol.toUpperCase();
    },
    total() {
      return +addNumbers([this.amount, this.partialFee]);
    },
    totalString() {
      return `${this.$n(this.total, 'decimalPrecise')} ${this.selectedAssetUpper}`;
    },
    fiatTotalString() {
      return `${this.accountsStore.fiatSymbol}${this.$n(this.total * this.assetPrice, 'price')}`;
    },
  },
  created() {
    this.assetId = this.$route.params.assetId;
        this.selectedNetwork = this.$route.params.network;
  },
  methods: {
    closeForm() {
      this.$router.back();
    },
    updateAssetId(value: string) {
      this.assetId = value;
    },
    updateSelectedNetwork(value: string) {
      this.selectedNetwork = value;
    },
    updateRecipient(value: string) {
      this.recipient = value;
    },
    updateAmount(value: string) {
      this.amount = value;
    },
    updateValue(value: string) {
      this.value = value;
    },
    updatePartialFee(value: string) {
      this.partialFee = value;
    },
  },
});
</script>

<style lang="scss" scoped>
.direction-column {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .arrow-icon {
    color: $default-white;
  }
}

.summary {
  padding: 16px;
  background-color: $secondary-background-color !important;
  border: 1px solid $default-background-color !important;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;

  .summary-label {
    text-align: left;
    font-size: 1.125em;
    font-weight: 600;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    margin: 24px 0;

    &:last-child {
      margin-bottom: 5px;
    }

    .name {
      color: $gray-color;
    }

    .column {
      display: flex;
      flex-direction: column;
      align-items: flex-end;

      .value {
        color: $default-white;
        font-weight: 300;
        font-size: 0.75rem;
        margin-top: 3px;
      }
    }
  }
}
</style>
