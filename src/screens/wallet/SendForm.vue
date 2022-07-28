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

          <div class="row amount-block">
            <MaxButton class="max-button-amount" @click="setMaxValue" />
            <MaxButton v-show="!isReadonlyValueInput" class="max-button-value" @click="setMaxValue" />

            <FloatInput v-model="amount" placeholder="Amount" size="big" styleInput="pink" @change="changeAmount" />

            <img src="@/assets/equals.svg" />

            <FloatInput
              v-model="value"
              placeholder="Value"
              size="big"
              styleInput="pink"
              :readonly="isReadonlyValueInput"
              @change="changeValue"
            />
          </div>

          <div class="row transferrable">
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
                <div class="transferrable-amount">${{ transferrableValue }}</div>
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

    <SendingPopup
      v-if="showSendingPopup"
      :header="headerSendingPopup"
      :popupLoading="sendingPopupLoading"
      :handlerClose="sendingPopupClose"
      :amount="amount"
      :value="value"
      :token="selectedToken"
      :firstNetwork="selectedNetwork"
    />
  </div>
</template>

<script lang="ts">
import BaseApi from '@/util/BaseApi';
import Input from '@/components/Input.vue';
import FloatInput from '@/components/FloatInput.vue';
import Select from '@/components/Select.vue';
import Corners from '@/components/Corners.vue';
import ActivityForm from './ActivityForm.vue';
import SendingPopup from './SendingPopup.vue';
import MaxButton from './MaxButton.vue';
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as ApiGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks } from '@/store/networks/types';
import { firstCharToUp } from '@/util/helpers';
import { formattedNumber, formattedPrice, addNumbers } from '@/util/numbers';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import type { Currency } from '@/interfaces/currencies';

@Component({
  components: {
    ActivityForm,
    Input,
    Select,
    SendingPopup,
    Corners,
    MaxButton,
    FloatInput,
  },
})
export default class SendForm extends Vue {
  isValidCountTokens = true;
  showSendingPopup = false;
  sendingPopupLoading = false;
  partialFee = '';
  selectedNetwork = '';
  selectedToken = '';
  recipient = '';
  amount = '';
  value = '';
  step = 1;

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(Array) currencies!: Currency[];
  @Prop(String) _selectedNetwork!: string;
  @Prop(String) _selectedToken!: string;
  @Getter(ApiGettersTypes.getNetworks) networks!: Networks;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get amountString() {
    return `${+this.amount} ${this.selectedTokenUpper}`;
  }

  get showValue() {
    return this.value !== '0';
  }

  get valueString() {
    return `$${formattedPrice(+this.value)}`;
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

  get isReadonlyValueInput() {
    return this.currentCurrency?.price === 0;
  }

  get headerSendingPopup() {
    return this.sendingPopupLoading ? 'Send Funds' : 'Successful sending';
  }

  get buttonText() {
    if (this.step === 2) return 'Send';

    if (!this.currentCurrency) return '';

    const { token } = this.currentCurrency;

    if (this.recipient !== '' && !this.isValidRecipientAddress) return 'Incorrect address';
    else if (!this.isValidCountTokens) return `Insufficient balance ${token.toUpperCase()}`;

    return 'Continue';
  }

  get buttonDisabled() {
    if (this.step === 2) return false;

    return !this.isAllFieldsCorrect || +this.amount === 0 || this.partialFee === '';
  }

  get isAllFieldsCorrect() {
    if (!this.currentCurrency) return false;

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
    const { address, ethereumAddress } = this.selectedWallet;
    const isEthereumNetwork = ETHEREUM_NETWORKS.includes(this.selectedNetwork);
    const addressByNetwork = isEthereumNetwork ? ethereumAddress : address;

    return addressByNetwork;
  }

  get formattedAddressTo() {
    return `${this.recipient.slice(0, 7)}...${this.recipient.slice(-8)}`;
  }

  get currentCurrency() {
    return this.currencies.find(({ token }) => token === this.selectedToken);
  }

  get optionsNetwork() {
    return this.currentCurrency?.availableInNetworks.map(({ network }) => ({
      label: firstCharToUp(network),
      value: `${network}`,
    }));
  }

  get transferrableAmount() {
    const count = +(this.currentCurrency?.getTransferableCountTokens(this.selectedNetwork) ?? 0);

    return formattedNumber(count, 4);
  }

  get transferrableValue() {
    const cost = +(this.currentCurrency?.getCostOfTokens(this.transferrableAmount) ?? 0);

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
    this.isValidCountTokens = this.currentCurrency!.isValidCountTokens(this.amount, partialFee, this.selectedNetwork);
  }

  mounted() {
    this.selectedToken = this._selectedToken;

    this.$nextTick(() => {
      const index = this.optionsNetwork?.findIndex(({ value }) => value === this._selectedNetwork);

      this.selectedNetwork = index !== -1 ? this._selectedNetwork : this.optionsNetwork?.[0]?.value ?? '';
    });
  }

  async createTransferAndGetFee(amount?: string) {
    this.currentCurrency!.createSendTransfer(this.recipient, this.selectedNetwork, amount ?? this.amount);

    return await this.currentCurrency!.getPartialFee(this.addressByNetwork);
  }

  changeAmount(amount: string) {
    this.value = this.currentCurrency?.getCostOfTokens(amount).toString() ?? '';
  }

  changeValue(value: string) {
    this.amount = this.currentCurrency?.getCountTokensByPrice(value).toString() ?? '';
  }

  handlerBack() {
    this.step = 1;
  }

  sendingPopupClose() {
    this.showSendingPopup = false;

    this.closeForm();
  }

  async setMaxValue() {
    if (!this.currentCurrency) return;

    const maxTransferableCountTokens = this.currentCurrency?.getTransferableCountTokens(this.selectedNetwork);
    const partialFee = await this.createTransferAndGetFee(maxTransferableCountTokens);
    const transferableCountTokens = this.currentCurrency
      .getTransferableCountTokensMinusFee(partialFee, this.selectedNetwork)
      .toString();

    this.amount = transferableCountTokens;
    this.value = this.currentCurrency.getCostOfTokens(transferableCountTokens).toString();
  }

  async handlerButton() {
    if (this.step === 1) {
      this.step += 1;

      return;
    }

    this.showSendingPopup = true;
    this.sendingPopupLoading = true;

    await this.currentCurrency?.send(this.addressByNetwork, this.amount);

    this.sendingPopupLoading = false;
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

  .amount-block {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .max-button-amount {
      left: 180px;
    }

    .max-button-value {
      right: 35px;
    }
  }

  .transferrable {
    display: flex;
    justify-content: space-between;

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
    color: rgba(255, 255, 255, 0.75);
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
