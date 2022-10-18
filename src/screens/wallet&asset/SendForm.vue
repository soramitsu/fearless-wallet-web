<template>
  <div>
    <AboveForm
      header="Send Funds"
      :blur="true"
      :showBackIcon="showBackIcon"
      :handlerBack="handlerBack"
      :closeHandler="closeForm"
    >
      <div class="send-form">
        <div>
          <template v-if="step === 1">
            <Select
              v-model="selectedAssetId"
              :options="optionsCurrency"
              placeholder="CURRENCY"
              size="big"
              class="row"
            />

            <Select v-model="selectedNetwork" :options="optionsNetworks" placeholder="NETWORK" size="big" class="row" />

            <Input v-model="recipient" placeholder="SEND TO" size="big" class="row" />

            <AmountInputs
              class="row"
              :amount="amount"
              :value="value"
              :currency="currency"
              @setMaxValue="setMaxValue"
              @update:amount="updateAmount"
              @update:value="updateValue"
            />

            <div class="transferrable row">
              <div class="transferrable-part">
                <div class="transferrable-label">Transferrable</div>
                <div class="transferrable-descriptions">
                  <div class="transferrable-amount">{{ transferrableAmount }}</div>
                  <div class="transferrable-assets">{{ selectedAssetUpper }}</div>
                </div>
              </div>

              <div class="transferrable-part">
                <div class="transferrable-label">Transferrable</div>
                <div class="transferrable-descriptions">
                  <div class="transferrable-amount">{{ fiatSymbol }}{{ transferrableValue }}</div>
                </div>
              </div>
            </div>
          </template>
          <template v-else-if="step === 2">
            <div class="row direction-column">
              <Input v-model="selectedWallet.name" placeholder="From" size="big" :readonly="true" />

              <s-icon name="arrows-arrow-right-24" />

              <Input v-model="formattedAddressTo" placeholder="To" size="big" :readonly="true" />
            </div>

            <Corners size="big" class="row">
              <div class="summary">
                <div class="summary-label">Summary</div>
                <div class="summary-row">
                  <div class="name">Coins</div>
                  <div class="column">
                    <div>{{ amountString }}</div>
                    <div v-if="showValue" class="value">{{ valueString }}</div>
                  </div>
                </div>
                <div class="summary-row">
                  <div class="name">Fee</div>
                  <div class="column">
                    <div>{{ partialFeeString }}</div>
                  </div>
                </div>
                <div class="summary-row">
                  <div class="name">Total</div>
                  <div class="column">
                    <div>{{ totalString }}</div>
                  </div>
                </div>
              </div>
            </Corners>
          </template>
        </div>

        <Button
          size="big"
          class="button"
          :text="buttonText"
          :disabled="buttonDisabled"
          @click="handlerContinueButton"
        />
      </div>
    </AboveForm>

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="currency"
      :amount="amount"
      :value="value"
      :address="addressByNetwork"
      :firstNetwork="selectedNetwork"
      @close="confirmationPasswordPopupClose"
    />

    <ExistentialPopup
      v-if="showExistentialPopup"
      :handlerClose="handlerCloseExistentialPopup"
      :handlerAcceptButton="handlerAcceptExistentialPopup"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import AmountInputs from './AmountInputs.vue';
import ConfirmationPasswordPopup from './ConfirmationPasswordPopup.vue';
import MaxButton from './MaxButton.vue';
import ExistentialPopup from './ExistentialPopup.vue';
import type { Currencies } from '@/interfaces';
import type { GetAssetName } from '@/store/networks/types';
import BaseApi from '@/util/BaseApi';
import Input from '@/components/Input.vue';
import FloatInput from '@/components/FloatInput.vue';
import Select from '@/components/Select.vue';
import Corners from '@/components/Corners.vue';
import NetworkLogo from '@/components/NetworkLogo.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { firstCharToUp } from '@/helpers/common';
import { formattedNumber, formattedPrice, addNumbers } from '@/helpers/numbers';
import { getCurrencyOptions } from '@/helpers/currencies';
import AboveForm from '@/components/AboveForm.vue';
import Button from '@/components/Button.vue';

@Component({
  components: {
    Input,
    Select,
    Button,
    Corners,
    MaxButton,
    AboveForm,
    FloatInput,
    NetworkLogo,
    AmountInputs,
    ExistentialPopup,
    ConfirmationPasswordPopup,
  },
})
export default class SendForm extends Vue {
  isValidCountAssets = true;
  showExistentialPopup = false;
  showConfirmationPasswordPopup = false;
  partialFee = '';
  selectedNetwork = '';
  selectedAssetId = '';
  recipient = '';
  amount = '';
  value = '';
  step = 1;

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) _selectedNetwork!: string;
  @Prop(String) _selectedAssetId!: string;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(NetworksGettersTypes.getAssetName) getAssetName!: GetAssetName;

  get amountString() {
    return `${+this.amount} ${this.selectedAssetUpper}`;
  }

  get showValue() {
    return this.value !== '0';
  }

  get valueString() {
    return `${this.fiatSymbol}${formattedPrice(+this.value)}`;
  }

  get partialFeeString() {
    return `${formattedNumber(+this.partialFee, 7)} ${this.selectedAssetUpper}`;
  }

  get totalString() {
    const total = addNumbers([this.amount, this.partialFee]);

    return `${formattedNumber(+total, 7)} ${this.selectedAssetUpper}`;
  }

  get showBackIcon() {
    return this.step === 2;
  }

  get buttonText() {
    if (this.step === 2) return 'Send';

    if (!this.currency) return '';

    if (this.recipient !== '' && !this.isValidRecipientAddress) return 'Incorrect address';
    else if (!this.isValidCountAssets) return `Insufficient balance ${this.selectedAssetUpper}`;

    return 'Continue';
  }

  get buttonDisabled() {
    if (this.step === 2) return false;

    return !this.isAllFieldsCorrect || +this.amount === 0 || this.partialFee === '';
  }

  get isAllFieldsCorrect() {
    if (!this.currency) return false;

    return (
      !!this.selectedNetwork &&
      !!this.selectedAssetId &&
      !!this.amount &&
      this.isValidRecipientAddress &&
      this.isValidCountAssets
    );
  }

  get isValidRecipientAddress() {
    return BaseApi.validateAddress(this.recipient);
  }

  get addressByNetwork() {
    return this.currency?.getTransactionAddress(this.selectedWallet, this.selectedNetwork) ?? '';
  }

  get formattedAddressTo() {
    return `${this.recipient.slice(0, 7)}...${this.recipient.slice(-8)}`;
  }

  get currency() {
    return this.currencies.find(({ assetId }) => assetId === this.selectedAssetId);
  }

  get optionsNetworks() {
    const availableInNetworks = this.currency?.getAvailableInNetworks(this.selectedWallet);

    return availableInNetworks?.map(({ network, precision, type }) => ({
      label: firstCharToUp(network),
      value: `${network}`,
      precision,
      type,
    }));
  }

  get transferrableAmount() {
    const count = +(this.currency?.getTransferableCountAssets(this.selectedNetwork, this.selectedWallet) ?? 0);

    return formattedNumber(count, 4, false, true);
  }

  get transferrableValue() {
    const cost = +(this.currency?.getCostOfAssets(this.transferrableAmount) ?? 0);

    return formattedPrice(cost);
  }

  get selectedAsset() {
    return this.getAssetName(this.selectedAssetId);
  }

  get selectedAssetUpper() {
    return this.selectedAsset.toUpperCase();
  }

  get optionsCurrency() {
    return getCurrencyOptions(this.currencies);
  }

  @Watch('selectedAssetId')
  updateSelectedNetwork() {
    this.selectedNetwork = this.optionsNetworks?.[0]?.value ?? '';
    this.amount = '';
  }

  @Watch('selectedNetwork')
  @Watch('selectedAssetId')
  @Watch('recipient')
  @Watch('amount')
  async createSendTransfer() {
    this.partialFee = '';

    if (!this.isValidRecipientAddress || this.selectedNetwork === '') return;

    const partialFee = await this.createTransferAndGetFee();

    this.partialFee = partialFee;
    this.isValidCountAssets = this.currency!.validateCountAssets(
      this.amount,
      partialFee,
      this.selectedNetwork,
      this.selectedWallet
    );
  }

  mounted() {
    this.selectedAssetId = this._selectedAssetId;
    this.$nextTick(() => {
      const index = this.optionsNetworks?.findIndex(({ value }) => value === this._selectedNetwork);

      this.selectedNetwork = index !== -1 ? this._selectedNetwork : this.optionsNetworks?.[0]?.value ?? '';
    });
  }

  createTransferAndGetFee(amount?: string) {
    const networkProps = this.optionsNetworks!.find(({ value }) => value === this.selectedNetwork)!;

    this.currency!.createTransferExtrinsic(this.recipient, amount ?? this.amount, networkProps);

    return this.currency!.getPartialFee(this.addressByNetwork, networkProps);
  }

  updateAmount(value: string) {
    this.amount = value;
  }

  updateValue(value: string) {
    this.value = value;
  }

  handlerBack() {
    this.step -= 1;
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) this.closeForm();
  }

  async setMaxValue() {
    if (!this.currency) return;

    const maxTransferableCountAssets = this.currency?.getTransferableCountAssets(
      this.selectedNetwork,
      this.selectedWallet
    );
    const partialFee = await this.createTransferAndGetFee(maxTransferableCountAssets);
    const transferableCountAssets = this.currency
      .getTransferableCountAssetsMinusFee(partialFee, this.selectedNetwork, this.selectedWallet)
      .toString();

    this.amount = transferableCountAssets;
    this.value = this.currency.getCostOfAssets(transferableCountAssets).toString();
  }

  handlerContinueButton(skipWarning = false) {
    if (!skipWarning && this.step === 1) {
      this.showExistentialPopup = !this.currency!.validateExistentialDeposit(
        this.selectedWallet,
        this.selectedNetwork,
        this.amount,
        this.partialFee
      );

      if (this.showExistentialPopup) return;
    }

    if (this.step === 2) {
      this.showConfirmationPasswordPopup = true;

      return;
    }

    this.step += 1;
  }

  handlerCloseExistentialPopup() {
    this.showExistentialPopup = false;
  }

  handlerAcceptExistentialPopup() {
    this.handlerContinueButton(true);

    this.handlerCloseExistentialPopup();
  }
}
</script>

<style lang="scss" scoped>
.send-form {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .row {
    margin-top: 10px;

    &:first-child {
      margin-top: 0;
    }
  }

  .transferrable {
    display: flex;
    justify-content: space-between;

    .transferrable-part {
      width: 235px;

      .transferrable-label {
        font-size: 14px;
        color: $default-white;
        text-align: left;
      }

      .transferrable-descriptions {
        display: flex;
        line-height: 25px;
      }

      .transferrable-amount {
        font-weight: 600;
        font-size: 16px;
        color: $pink-lavender-color;
      }

      .transferrable-assets {
        margin-left: 5px;
        color: rgba(255, 255, 255, 0.9);
      }
    }
  }

  .direction-column {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .s-icon-arrows-arrow-right-24 {
    color: $default-white;
    font-size: 30px !important;
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
}
</style>
