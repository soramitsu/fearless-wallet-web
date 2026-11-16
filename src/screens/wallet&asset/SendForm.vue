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
        <div class="row network-review" data-testid="reviewNetworkRow">
          <span>{{ $t('common.network') }}</span>
          <strong data-testid="reviewNetwork">{{ networkName }}</strong>
        </div>

        <div class="row direction-column">
          <FInput
            :value="accountsStore.selectedWallet.name"
            placeholder="assets.from"
            size="big"
            :readonly="true"
            data-testid="fromWallet"
          />

          <Icon icon="chevron-right" class="arrow-icon" />

          <div class="recipient-review">
            <span>{{ $t('assets.to') }}</span>
            <p class="recipient-address" data-testid="toAddress">{{ recipient }}</p>
            <small>{{ $t('ux.verifyRecipient') }}</small>
          </div>
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
import { findTransferAssetGroup, getTransferAssetPrice, getUtilityAsset } from '@/helpers/currencies';
import { getOwnWalletRecipient } from '@/helpers/transfers';
import { isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({
  name: 'SendForm',
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
      return findTransferAssetGroup(this.accountsStore.balances, this.assetId, this.selectedNetwork);
    },
    networkName() {
      return this.networksStore.getNetwork(this.selectedNetwork)?.name ?? this.selectedNetwork;
    },
    isUtilityAsset() {
      return this.currency?.balances.some(
        ({ isUtility, name }) => isUtility && isSameString(name, this.selectedNetwork)
      );
    },
    partialFeeString() {
      const utilityAsset = getUtilityAsset(this.accountsStore.balances, this.selectedNetwork);
      const symbol = utilityAsset ? utilityAsset.symbol : '';

      return `${this.$n(+this.partialFee, 'decimalPrecise')} ${symbol.toUpperCase()}`;
    },
    showValue() {
      return this.value !== '0';
    },
    // The portfolio's trusted price for exactly the asset being sent, or `null`: "Price unavailable", never $0.
    assetPrice() {
      return getTransferAssetPrice(this.currency, this.originNet, this.networksStore.assetsPrice?.tokenPriceMap ?? {});
    },
    originNet() {
      return this.networksStore.getNetwork(this.selectedNetwork);
    },
    // The fee is paid in the network's utility asset, priced by its own decision.
    feeAssetPrice() {
      const utility = getUtilityAsset(this.accountsStore.balances, this.selectedNetwork);

      return getTransferAssetPrice(
        utility,
        this.originNet,
        this.networksStore.assetsPrice?.tokenPriceMap ?? {},
        ({ isUtility }) => Boolean(isUtility)
      );
    },
    fiatFeeString() {
      if (this.feeAssetPrice === null) return this.$t('portfolioPage.priceUnavailable');

      return `${this.accountsStore.fiatSymbol}${this.$n(+this.partialFee * this.feeAssetPrice, 'price')}`;
    },
    valueString() {
      if (this.assetPrice === null) return this.$t('portfolioPage.priceUnavailable');

      return `${this.accountsStore.fiatSymbol}${this.$n(+this.value, 'price')}`;
    },
    amountString() {
      return `${+this.amount} ${this.selectedAssetUpper}`;
    },
    selectedAsset() {
      return (
        this.currency?.balances?.find(({ name }) => isSameString(name, this.selectedNetwork)) ??
        this.currency?.balances?.find(
          (el) =>
            el.symbol.toLowerCase() === this.assetId.toLowerCase() || el.id.toLowerCase() === this.assetId.toLowerCase()
        )
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
    // The amount and the fee: without a price for either, a fiat total would leave part of it out.
    fiatTotalString() {
      if (this.assetPrice === null || this.feeAssetPrice === null) return this.$t('portfolioPage.priceUnavailable');

      return `${this.accountsStore.fiatSymbol}${this.$n(this.total * this.assetPrice, 'price')}`;
    },
  },
  created() {
    this.assetId = this.$route.params.assetId;
    this.selectedNetwork = this.$route.params.network;

    // The security notice guide opens Send with the user's new wallet as the recipient.
    const to = this.$route.query?.to;

    if (typeof to === 'string') this.recipient = getOwnWalletRecipient(this.accountsStore.accounts, to, this.selectedNetwork);
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
  border: 1px solid palette($default-background-color, var(--fw-divider)) !important;
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

<style lang="scss" scoped>
// Brand kit v3: the review's cards wear the lit rim.
.network-review {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px;
  text-align: left;
  background: $secondary-background-color;
  border-radius: 8px;
  @include fw-lit-rim(8px);

  span {
    color: $default-white;
    font-size: 0.875rem;
  }

  strong {
    overflow-wrap: anywhere;
    text-align: right;
  }
}
.recipient-review {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 16px;
  text-align: left;
  background: $secondary-background-color;
  border-radius: 8px;
  @include fw-lit-rim(8px);
}
.recipient-review > span,
.recipient-review > small {
  color: $default-white;
  font-size: 0.875rem;
}
.recipient-address {
  margin: 0 0 8px;
  font: inherit;
  line-height: 1.6;
  overflow-wrap: anywhere;
  user-select: text;
}
</style>
