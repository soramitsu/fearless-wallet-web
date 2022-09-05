<template>
  <div>
    <ActivityForm
      class="send-form"
      header="Send Funds"
      :buttonText="buttonText"
      :handlerButton="handlerButton"
      :showBackIcon="showBackIcon"
      :handlerBack="handlerBack"
      :closeForm="closeForm"
      :buttonDisabled="buttonDisabled"
    >
      <div class="send-form-content">
        <template v-if="step === 1">
          <Select v-model="selectedToken" :options="optionsCurrency" placeholder="Currency" size="big" class="row" />

          <Select v-model="selectedNetwork" :options="optionsNetwork" placeholder="Network" size="big" class="row" />

          <Input v-model="recipient" placeholder="Send to" size="big" class="row" />

          <div class="row amount-wrapper">
            <FloatInput
              v-model="amount"
              class="input-amount"
              placeholder="Amount"
              size="big"
              styleInput="pink"
              @change="changeAmount"
            />

            <MaxButton class="max-button-two" @click="setMaxValue" />

            <template v-if="showValueInput">
              <img src="@/assets/equals.svg" class="img-equals" />

              <FloatInput
                v-model="value"
                class="input-amount"
                placeholder="Value"
                size="big"
                styleInput="pink"
                @change="changeValue"
              />

              <MaxButton class="max-button-one" @click="setMaxValue" />
            </template>
          </div>

          <div class="transferrable">
            <div class="transferrable-part">
              <div class="transferrable-label">Transferrable</div>
              <div class="transferrable-descriptions">
                <div class="transferrable-amount">{{ transferrableAmount }}</div>
                <div class="transferrable-token">{{ selectedTokenUpper }}</div>
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
    </ActivityForm>

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      header="Send Funds"
      :currency="currency"
      :amount="amount"
      :value="value"
      :address="addressByNetwork"
      :token="selectedToken"
      :firstNetwork="selectedNetwork"
      @close="confirmationPasswordPopupClose"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import ActivityForm from './ActivityForm.vue';
import ConfirmationPasswordPopup from './ConfirmationPasswordPopup.vue';
import MaxButton from './MaxButton.vue';
import type { Currencies } from '@/interfaces/currencies';
import BaseApi from '@/util/BaseApi';
import Input from '@/components/Input.vue';
import FloatInput from '@/components/FloatInput.vue';
import Select from '@/components/Select.vue';
import Corners from '@/components/Corners.vue';
import { GettersTypes as ApiGettersTypes, GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks } from '@/store/networks/types';
import { firstCharToUp } from '@/util/helpers';
import { formattedNumber, formattedPrice, addNumbers } from '@/util/numbers';

@Component({
  components: {
    ActivityForm,
    Input,
    Select,
    ConfirmationPasswordPopup,
    Corners,
    MaxButton,
    FloatInput,
  },
})
export default class SendForm extends Vue {
  isValidCountTokens = true;
  showConfirmationPasswordPopup = false;
  partialFee = '';
  selectedNetwork = '';
  selectedToken = '';
  recipient = '';
  amount = '';
  value = '';
  step = 1;

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) _selectedNetwork!: string;
  @Prop(String) _selectedToken!: string;
  @Getter(ApiGettersTypes.getNetworks) networks!: Networks;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get amountString() {
    return `${+this.amount} ${this.selectedTokenUpper}`;
  }

  get showValue() {
    return this.value !== '0';
  }

  get valueString() {
    return `${this.fiatSymbol}${formattedPrice(+this.value)}`;
  }

  get partialFeeString() {
    return `${formattedNumber(+this.partialFee, 7)} ${this.selectedTokenUpper}`;
  }

  get totalString() {
    const total = addNumbers([this.amount, this.partialFee]);

    return `${formattedNumber(+total, 7)} ${this.selectedTokenUpper}`;
  }

  get showBackIcon() {
    return this.step === 2;
  }

  get showValueInput() {
    return this.currency?.price !== 0;
  }

  get buttonText() {
    if (this.step === 2) return 'Send';

    if (!this.currency) return '';

    const { token } = this.currency;

    if (this.recipient !== '' && !this.isValidRecipientAddress) return 'Incorrect address';
    else if (!this.isValidCountTokens) return `Insufficient balance ${token.toUpperCase()}`;

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
      !!this.selectedToken &&
      !!this.amount &&
      this.isValidRecipientAddress &&
      this.isValidCountTokens
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
    return this.currencies.find(({ token }) => token === this.selectedToken);
  }

  get optionsNetwork() {
    const availableInNetworks = this.currency?.getAvailableInNetworks(this.selectedWallet);

    return availableInNetworks?.map(({ network }) => ({
      label: firstCharToUp(network),
      value: `${network}`,
    }));
  }

  get transferrableAmount() {
    const count = +(this.currency?.getTransferableCountTokens(this.selectedNetwork, this.selectedWallet) ?? 0);

    return formattedNumber(count, 4);
  }

  get transferrableValue() {
    const cost = +(this.currency?.getCostOfTokens(this.transferrableAmount) ?? 0);

    return formattedPrice(cost);
  }

  get selectedTokenUpper() {
    return this.selectedToken.toUpperCase();
  }

  get optionsCurrency() {
    return this.currencies.map(({ token }) => ({ label: token.toUpperCase(), value: token }));
  }

  @Watch('selectedToken')
  updateSelectedNetwork() {
    this.selectedNetwork = this.optionsNetwork?.[0]?.value ?? '';
    this.amount = '';
  }

  @Watch('selectedNetwork')
  @Watch('selectedToken')
  @Watch('recipient')
  @Watch('amount')
  async createSendTransfer() {
    this.partialFee = '';

    if (!this.isValidRecipientAddress) return;

    const partialFee = await this.createTransferAndGetFee();

    this.partialFee = partialFee;
    this.isValidCountTokens = this.currency!.isValidCountTokens( // eslint-disable-line
      this.amount,
      partialFee,
      this.selectedNetwork,
      this.selectedWallet
    );
  }

  mounted() {
    this.selectedToken = this._selectedToken;

    this.$nextTick(() => {
      const index = this.optionsNetwork?.findIndex(({ value }) => value === this._selectedNetwork);

      this.selectedNetwork = index !== -1 ? this._selectedNetwork : this.optionsNetwork?.[0]?.value ?? '';
    });
  }

  async createTransferAndGetFee(amount?: string) {
    this.currency!.createSendTransfer(this.recipient, this.selectedNetwork, amount ?? this.amount); // eslint-disable-line

    return await this.currency!.getPartialFee(this.addressByNetwork); // eslint-disable-line
  }

  changeAmount(amount: string) {
    this.value = this.currency?.getCostOfTokens(amount).toString() ?? '';
  }

  changeValue(value: string) {
    this.amount = this.currency?.getCountTokensByPrice(value).toString() ?? '';
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

    const maxTransferableCountTokens = this.currency?.getTransferableCountTokens(
      this.selectedNetwork,
      this.selectedWallet
    );
    const partialFee = await this.createTransferAndGetFee(maxTransferableCountTokens);
    const transferableCountTokens = this.currency
      .getTransferableCountTokensMinusFee(partialFee, this.selectedNetwork, this.selectedWallet)
      .toString();

    this.amount = transferableCountTokens;
    this.value = this.currency.getCostOfTokens(transferableCountTokens).toString();
  }

  handlerButton() {
    if (this.step === 2) {
      this.showConfirmationPasswordPopup = true;

      return;
    }

    this.step += 1;
  }
}
</script>

<style lang="scss" scoped>
.send-form {
  .send-form-content {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .row {
    margin-top: 16px;

    &:first-child {
      margin-top: 0;
    }
  }

  .amount-wrapper {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .input-amount {
      flex: 1 1 235px;
    }

    .img-equals {
      margin: 0 15px;
    }

    .max-button-one {
      left: 180px;
    }

    .max-button-two {
      right: 35px;
    }
  }

  .transferrable {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;

    .transferrable-part {
      width: 235px;

      .transferrable-label {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.75);
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

      .transferrable-token {
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
    background-color: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
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
}
</style>
