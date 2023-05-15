<template>
  <TransferForm
    extrinsicType="transfer"
    header="assets.sendFunds"
    :selectedAssetId="selectedAssetId"
    :selectedNetwork="selectedNetwork"
    :amount="amount"
    :value="value"
    :partialFee="partialFee"
    :recipient="recipient"
    :closeForm="closeForm"
    @update:selectedAssetId="updateSelectedAssetId"
    @update:selectedNetwork="updateSelectedNetwork"
    @update:amount="updateAmount"
    @update:value="updateValue"
    @update:partialFee="updatePartialFee"
    @update:recipient="updateRecipient"
  >
    <div class="row direction-column">
      <Input v-model="selectedWallet.name" placeholder="assets.from" size="big" :readonly="true" />

      <SIcon name="arrows-arrow-right-24" class="arrow-icon" />

      <Input v-model="formattedAddressTo" placeholder="assets.to" size="big" :readonly="true" />
    </div>

    <Corners size="big" class="row">
      <div class="summary">
        <div class="summary-label">{{ $t('assets.summary') }}</div>

        <div class="summary-row">
          <div class="name">{{ $t('assets.assetsAmount') }}</div>

          <div class="column">
            <div>{{ amountString }}</div>

            <div v-if="showValue" class="value">{{ valueString }}</div>
          </div>
        </div>

        <div class="summary-row">
          <div class="name">{{ $t('assets.fee') }}</div>

          <div class="column">
            <div>{{ partialFeeString }}</div>
          </div>
        </div>

        <div v-if="isUtilityAsset" class="summary-row">
          <div class="name">{{ $t('assets.total') }}</div>

          <div class="column">
            <div>{{ totalString }}</div>
          </div>
        </div>
      </div>
    </Corners>
  </TransferForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { SelectedWallet } from '@/store';
import TransferForm from '@/screens/wallet&asset/TransferForm.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { addNumbers } from '@/helpers/numbers';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { getUtilityAsset } from '@/helpers/currencies';

@Component({
  components: { TransferForm },
})
export default class SendFormStateLess extends Vue {
  partialFee = '';
  selectedNetwork = '';
  selectedAssetId = '';
  recipient = '';
  amount = '';
  value = '';

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) _selectedNetwork!: string;
  @Prop(String) _selectedAssetId!: string;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];

  get currency() {
    return this.balances.find(({ assetId }) => assetId.toLowerCase() === this.selectedAssetId.toLowerCase());
  }

  get isUtilityAsset() {
    return !!this.currency?.balances.find((el) => el.isUtility || el.isNative);
  }

  get partialFeeString() {
    const utilityAsset = getUtilityAsset(this.balances, this.selectedNetwork);

    return `${this.$n(+this.partialFee, 'decimal')} ${utilityAsset.toUpperCase()}`;
  }

  get showValue() {
    return this.value !== '0';
  }

  get valueString() {
    return `${this.fiatSymbol}${this.$n(+this.value, 'price')}`;
  }

  get amountString() {
    return `${+this.amount} ${this.selectedAssetUpper}`;
  }

  get formattedAddressTo() {
    return `${this.recipient.slice(0, 7)}...${this.recipient.slice(-8)}`;
  }

  get selectedAsset() {
    return this.balances.find(
      (el) =>
        el.name.toLowerCase() === this.selectedAssetId.toLowerCase() ||
        el.assetId.toLowerCase() === this.selectedAssetId.toLowerCase()
    )!;
  }

  get selectedAssetUpper() {
    return this.selectedAsset.name.toUpperCase();
  }

  get totalString() {
    const total = +addNumbers([this.amount, this.partialFee]);

    return `${this.$n(total, 'decimal')} ${this.selectedAssetUpper}`;
  }

  created() {
    this.selectedAssetId = this._selectedAssetId;
    this.selectedNetwork = this._selectedNetwork;
  }

  updateSelectedAssetId(value: string) {
    this.selectedAssetId = value;
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

<style lang="scss">
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
