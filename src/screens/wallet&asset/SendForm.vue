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
            :value="selectedWallet.name"
            placeholder="assets.from"
            size="big"
            :readonly="true"
            data-testid="fromWallet"
          />

          <SIcon name="arrows-arrow-right-24" class="arrow-icon" />

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
import { Component, Vue } from 'vue-property-decorator';
import TransferForm from '@/screens/wallet&asset/TransferForm.vue';

import { addNumbers } from '@/helpers/numbers';
import { getUtilityAsset } from '@/helpers/currencies';
import { isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component({
  components: { TransferForm },
})
export default class SendForm extends Vue {
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();
  partialFee = '';
  selectedNetwork = '';
  assetId = '';
  recipient = '';
  amount = '';
  value = '';

  get currency() {
    return this.accountsStore.balances.find(({ balances }) =>
      balances.some(({ id }) => id.toLowerCase() === this.assetId.toLowerCase())
    );
  }

  get isUtilityAsset() {
    return this.currency?.balances.some(({ isUtility, name }) => isUtility && isSameString(name, this.selectedNetwork));
  }

  get partialFeeString() {
    const utilityAsset = getUtilityAsset(this.accountsStore.balances, this.selectedNetwork);
    const symbol = utilityAsset ? utilityAsset.symbol : '';

    return `${this.$n(+this.partialFee, 'decimalPrecise')} ${symbol.toUpperCase()}`;
  }

  get showValue() {
    return this.value !== '0';
  }

  get assetPrice() {
    return this.networksStore.getAssetPrice(this.currency?.priceId ?? '')?.price ?? 0;
  }

  get originNet() {
    return this.networksStore.getNetwork(this.selectedNetwork);
  }

  get originalUtilityId() {
    return this.originNet?.assets[0].id ?? ''; // [0] - is utility asset
  }

  get feeAssetPrice() {
    const currency = this.accountsStore.balances.find(({ balances }) =>
      balances.some(({ id }) => id === this.originalUtilityId)
    );
    const priceId = currency?.priceId ?? '';

    return this.networksStore.getAssetPrice(priceId).price;
  }

  get fiatFeeString() {
    return `${this.accountsStore.fiatSymbol}${this.$n(+this.partialFee * this.feeAssetPrice, 'price')}`;
  }

  get valueString() {
    return `${this.accountsStore.fiatSymbol}${this.$n(+this.value, 'price')}`;
  }

  get amountString() {
    return `${+this.amount} ${this.selectedAssetUpper}`;
  }

  get formattedAddressTo() {
    return `${this.recipient.slice(0, 7)}...${this.recipient.slice(-8)}`;
  }

  get selectedAsset() {
    return this.currency?.balances?.find(
      (el) =>
        el.symbol.toLowerCase() === this.assetId.toLowerCase() || el.id.toLowerCase() === this.assetId.toLowerCase()
    );
  }

  get selectedAssetUpper() {
    return this.selectedAsset?.symbol.toUpperCase();
  }

  get total() {
    return +addNumbers([this.amount, this.partialFee]);
  }

  get totalString() {
    return `${this.$n(this.total, 'decimalPrecise')} ${this.selectedAssetUpper}`;
  }

  get fiatTotalString() {
    return `${this.accountsStore.fiatSymbol}${this.$n(this.total * this.assetPrice, 'price')}`;
  }

  created() {
    this.assetId = this.$route.params.assetId;
    this.selectedNetwork = this.$route.params.network;
  }

  closeForm() {
    this.$router.back();
  }

  updateAssetId(value: string) {
    this.assetId = value;
  }

  updateSelectedNetwork(value: string) {
    this.selectedNetwork = value;
  }

  updateRecipient(value: string) {
    this.recipient = value;
  }

  updateAmount(value: string) {
    this.amount = value;
  }

  updateValue(value: string) {
    this.value = value;
  }

  updatePartialFee(value: string) {
    this.partialFee = value;
  }
}
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
    font-size: 18px;
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
        font-size: 12px;
        margin-top: 3px;
      }
    }
  }
}
</style>
