<template>
  <TransferForm
    extrinsicType="teleport"
    header="asset.teleportFunds"
    :selectedAssetId="selectedAssetId"
    :selectedNetwork="originalNetwork"
    :amount="amount"
    :value="value"
    :partialFee="originNetFee"
    :destinationNetwork="destinationNetwork"
    :closeForm="closeForm"
    @update:selectedAssetId="updateSelectedAssetId"
    @update:selectedNetwork="updateOriginalNetwork"
    @update:amount="updateAmount"
    @update:value="updateValue"
    @update:partialFee="updateOriginNetFee"
    @update:destinationNetwork="updateDestinationNetwork"
  >
    <Corners size="big" class="row">
      <div class="summary">
        <div class="summary-label">{{ $t('asset.summary') }}</div>

        <div class="summary-row">
          <div class="column column-left">
            <div class="name">{{ $t('asset.from') }}</div>

            <div class="network-name">{{ originalNetworkString }}</div>
          </div>

          <Icon icon="bold-arrow-right" class="arrow-right" />

          <div class="column">
            <div class="name">{{ $t('asset.to') }}</div>

            <div class="network-name">{{ destinationNetworkString }}</div>
          </div>
        </div>

        <div class="summary-row">
          <div class="name">{{ $t('asset.assetsAmount') }}</div>

          <div class="column">
            <div>{{ amountString }}</div>

            <div v-if="showValue" class="value">{{ valueString }}</div>
          </div>
        </div>

        <div class="summary-row">
          <div class="name">{{ originalNetworkString }} {{ $t('asset.fee') }}</div>

          <div>
            {{ originalNetworkPartialFeeString }}
          </div>
        </div>

        <div class="summary-row">
          <div class="name">{{ destinationNetworkString }} {{ $t('asset.fee') }}</div>

          <div>{{ destinationNetworkPartialFeeString }}</div>
        </div>

        <div class="summary-row">
          <div class="name">{{ $t('asset.total') }}</div>

          <div>{{ totalString }}</div>
        </div>
      </div>
    </Corners>
  </TransferForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import TransferForm from './TransferForm.vue';
import type { Currencies } from '@/interfaces';
import type { GetAssetName, SelectedWallet } from '@/store';
import Select from '@/components/Select.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { firstCharToUp } from '@/helpers/common';
import { addNumbers, formattedNumber } from '@/helpers/numbers';

@Component({
  components: {
    Select,

    TransferForm,
  },
})
export default class TeleportForm extends Vue {
  originNetFee = '';
  destNetFee = '';
  selectedAssetId = '';
  originalNetwork = '';
  destinationNetwork = '';
  amount = '';
  value = '';
  step = 1;

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) _originalNetwork!: string;
  @Prop(String) _selectedAssetId!: string;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(NetworksGettersTypes.getAssetName) getAssetName!: GetAssetName;

  get showValue() {
    return this.value !== '0';
  }

  get originalNetworkString() {
    return `${firstCharToUp(this.originalNetwork)}`;
  }

  get destinationNetworkString() {
    return `${firstCharToUp(this.destinationNetwork)}`;
  }

  get amountString() {
    return `${+this.amount} ${this.selectedAssetUpper}`;
  }

  get valueString() {
    return `${this.fiatSymbol}${this.$n(+this.value, 'price')}`;
  }

  get originalNetworkPartialFeeString() {
    return `${formattedNumber(+this.originNetFee, { decimalsValue: 7 })} ${this.selectedAssetUpper}`;
  }

  get destinationNetworkPartialFeeString() {
    return `${formattedNumber(+this.destNetFee)} ${this.selectedAssetUpper}`;
  }

  get totalString() {
    const total = +addNumbers([this.amount, this.originNetFee, this.destNetFee]);

    return `${formattedNumber(total, { decimalsValue: 7 })} ${this.selectedAssetUpper}`;
  }

  get selectedAsset() {
    return this.getAssetName(this.selectedAssetId);
  }

  get selectedAssetUpper() {
    return this.selectedAsset.toUpperCase();
  }

  created() {
    this.selectedAssetId = this._selectedAssetId;
    this.originalNetwork = this._originalNetwork;
  }

  updateSelectedAssetId(value: string) {
    this.selectedAssetId = value;
  }

  updateOriginalNetwork(value: string) {
    this.originalNetwork = value;
  }

  updateDestinationNetwork(value: string) {
    this.destinationNetwork = value;
  }

  updateAmount(value: string) {
    this.amount = value;
  }

  updateValue(value: string) {
    this.value = value;
  }

  updateOriginNetFee(value: string) {
    this.originNetFee = value;
  }
}
</script>

<style lang="scss" scoped>
.summary {
  padding: $default-padding;
  background-color: $secondary-background-color !important;
  border: 1px solid $default-background-color !important;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;

  .arrow-right {
    width: 25px;
    height: 25px;
  }

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
      text-align: left;
    }

    .column {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      width: 240px;

      .value {
        color: rgba(255, 255, 255, 0.75);
        font-weight: 300;
        font-size: 12px;
        margin-top: 3px;
      }

      .network-name {
        margin-top: 10px;
        color: $pink-lavender-color;
      }
    }

    .column-left {
      align-items: flex-start;
    }
  }
}
</style>
