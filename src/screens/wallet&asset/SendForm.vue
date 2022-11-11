<template>
  <TransferForm
    extrinsicType="transfer"
    header="asset.sendFunds"
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
      <Input v-model="selectedWallet.name" placeholder="asset.from" size="big" :readonly="true" />

      <SIcon name="arrows-arrow-right-24" class="arrow-icon" />

      <Input v-model="formattedAddressTo" placeholder="asset.to" size="big" :readonly="true" />
    </div>

    <Corners size="big" class="row">
      <div class="summary">
        <div class="summary-label">{{ $t('asset.summary') }}</div>

        <div class="summary-row">
          <div class="name">{{ $t('asset.assetsAmount') }}</div>

          <div class="column">
            <div>{{ amountString }}</div>

            <div v-if="showValue" class="value">{{ valueString }}</div>
          </div>
        </div>

        <div class="summary-row">
          <div class="name">{{ $t('asset.fee') }}</div>

          <div class="column">
            <div>{{ partialFeeString }}</div>
          </div>
        </div>

        <div class="summary-row">
          <div class="name">{{ $t('asset.total') }}</div>

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
import TransferForm from './TransferForm.vue';
import type { Currencies } from '@/interfaces';
import type { GetAssetName } from '@/store/networks/types';
import Input from '@/components/Input.vue';
import Corners from '@/components/Corners.vue';
import NetworkLogo from '@/components/NetworkLogo.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import AboveForm from '@/components/AboveForm.vue';
import { formattedNumber, formattedPrice, addNumbers } from '@/helpers/numbers';

@Component({
  components: {
    Input,
    Corners,
    AboveForm,
    NetworkLogo,
    TransferForm,
  },
})
export default class SendForm extends Vue {
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
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(NetworksGettersTypes.getAssetName) getAssetName!: GetAssetName;

  get partialFeeString() {
    return `${formattedNumber(+this.partialFee, { decimalsValue: 7 })} ${this.selectedAssetUpper}`;
  }

  get showValue() {
    return this.value !== '0';
  }

  get valueString() {
    return `${this.fiatSymbol}${formattedPrice(+this.value)}`;
  }

  get amountString() {
    return `${+this.amount} ${this.selectedAssetUpper}`;
  }

  get formattedAddressTo() {
    return `${this.recipient.slice(0, 7)}...${this.recipient.slice(-8)}`;
  }

  get selectedAsset() {
    return this.getAssetName(this.selectedAssetId);
  }

  get selectedAssetUpper() {
    return this.selectedAsset.toUpperCase();
  }

  get totalString() {
    const total = addNumbers([this.amount, this.partialFee]);

    return `${formattedNumber(+total, { decimalsValue: 7 })} ${this.selectedAssetUpper}`;
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
      color: rgba(255, 255, 255, 0.5);
    }

    .column {
      display: flex;
      flex-direction: column;
      align-items: flex-end;

      .value {
        color: rgba(255, 255, 255, 0.75);
        font-weight: 300;
        font-size: 12px;
        margin-top: 3px;
      }
    }
  }
}
</style>
