<template>
  <div>
    <ActivityForm
      class="send-form"
      header="Send Funds"
      :buttonText="buttonText"
      :handlerButton="send"
      :showBackIcon="showBackIcon"
      :handlerBack="handlerBack"
      :closeForm="closeForm"
      :buttonDisabled="buttonDisabled"
    >
      <div class="send-form-content">
        <template v-if="step === 1">
          <Select v-model="selectedNetwork" :options="optionsNetwork" placeholder="Network" size="big" class="row" />

          <Select v-model="selectedToken" :options="optionsCurrency" placeholder="Currency" size="big" class="row" />

          <Input v-model="recipient" placeholder="Send to" size="big" class="row" />

          <div class="row amount-block">
            <MaxButton class="max-button-amount" @click="setMaxValue" />
            <MaxButton v-show="!isReadonlyValueInput" class="max-button-value" @click="setMaxValue" />

            <Input
              v-model="amount"
              placeholder="Amount"
              size="big"
              styleInput="pink"
              type="number"
              @change="changeAmount"
            />

            <img src="@/assets/equals.svg" />

            <Input
              v-model="value"
              placeholder="Value"
              size="big"
              styleInput="pink"
              type="number"
              :readonly="isReadonlyValueInput"
              @change="changeValue"
            />
          </div>

          <div class="row transferrable">
            <div>
              <div class="transferrable-label">Transferrable</div>
              <div class="transferrable-descriptions">
                <div class="transferrable-amount">{{ transferrableAmount }}</div>
                <div class="transferrable-token">{{ selectedTokenUpper }}</div>
              </div>
            </div>

            <div class="transferrable-value">
              <div class="transferrable-label">Transferrable</div>
              <div class="transferrable-descriptions">
                <div class="transferrable-amount">${{ transferrableValue }}</div>
              </div>
            </div>
          </div>
        </template>
        <template v-else-if="step === 2">
          <div class="row direction">
            <Input v-model="selectedWallet.name" placeholder="From" size="big" :readonly="true" />

            <s-icon name="arrows-arrow-right-24" />

            <Input v-model="formattedAddressTo" placeholder="To" size="big" :readonly="true" />
          </div>

          <Corners size="big" class="row">
            <div class="summary">
              <div class="summary-label">Summary</div>
              <div class="summary-row">
                <div class="name">Coins</div>
                <div class="right-column">
                  <div>{{ amountString }}</div>
                  <div class="sub-value">{{ valueString }}</div>
                </div>
              </div>
              <div class="summary-row">
                <div class="name">Fee</div>
                <div class="right-column">
                  <div>{{ partialFeeString }}</div>
                  <div class="sub-value">{{ maxPartialFeeString }}</div>
                </div>
              </div>
              <div class="summary-row">
                <div class="name">Total</div>
                <div class="right-column">
                  <div>{{ totalString }}</div>
                  <div class="sub-value">{{ maxTotalString }}</div>
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
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as ApiGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks } from '@/store/networks/types';
import { firstCharToUp } from '@/util/helpers';
import { Currency } from '@/interfaces/currencies';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import Input from '@/components/Input.vue';
import Select from '@/components/Select.vue';
import Corners from '@/components/Corners.vue';
import ActivityForm from './ActivityForm.vue';
import SendingPopup from './SendingPopup.vue';
import MaxButton from './MaxButton.vue';

@Component({
  components: {
    ActivityForm,
    Input,
    Select,
    SendingPopup,
    Corners,
    MaxButton,
  },
})
export default class SendForm extends Vue {
  showSendingPopup = false;
  sendingPopupLoading = false;
  isValidCountTokens = false;
  selectedNetwork = '';
  selectedToken = '';
  recipient = '';
  amount = '';
  value = '';
  partialFee: number | undefined;
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

  get valueString() {
    return `$${this.value}`;
  }

  get partialFeeString() {
    return `${this.partialFee} ${this.selectedTokenUpper}`;
  }

  get maxPartialFeeString() {
    return `max fee: ${this.partialFee} ${this.selectedTokenUpper}`;
  }

  get totalString() {
    const total = +this.amount + (this.partialFee ?? 0);

    return `${total} ${this.selectedTokenUpper}`;
  }

  get maxTotalString() {
    const total = +this.amount + (this.partialFee ?? 0);

    return `max total: ${total} ${this.selectedTokenUpper}`;
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

    return this.isValidCountTokens ? 'Continue' : `Insufficient balance ${token.toUpperCase()}`;
  }

  get buttonDisabled() {
    if (this.step === 2) return false;

    return !this.isAllFieldsCorrect || this.partialFee === undefined;
  }

  get isAllFieldsCorrect() {
    if (!this.currentCurrency) return false;

    return this.isValidCountTokens
      ? !!this.selectedNetwork && !!this.selectedToken && !!this.recipient && !!this.amount
      : false;
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
    return this.currencies.find(({ mainNetwork }) => mainNetwork === this.selectedNetwork);
  }

  get optionsNetwork() {
    return this.networks.map(({ name }) => {
      return { label: firstCharToUp(name), value: name };
    });
  }

  get transferrableAmount() {
    return this.currentCurrency?.getTransferableCountTokens() ?? 0;
  }

  get transferrableValue() {
    return this.currentCurrency?.getCostOfTokens(this.transferrableAmount);
  }

  get selectedTokenUpper() {
    return this.selectedToken.toUpperCase();
  }

  get optionsCurrency() {
    const token = this.currentCurrency?.token ?? '';

    return this.currentCurrency?.getAvailableInNetworks().map(() => ({
      label: token.toUpperCase(),
      value: `${token}`,
    }));
  }

  @Watch('selectedNetwork')
  updateSelectedToken() {
    this.selectedToken = this.optionsCurrency?.[0]?.value ?? '';
  }

  @Watch('selectedNetwork')
  @Watch('selectedToken')
  @Watch('recipient')
  @Watch('amount')
  async createTransfer() {
    // TODO: validate recipient address
    if (this.recipient === '') {
      this.currentCurrency!.resetTransfer();

      return;
    }

    this.partialFee = undefined;

    const transferСreated = this.currentCurrency!.createTransfer(
      this.recipient,
      this.selectedNetwork,
      this.selectedToken,
      this.amount
    );

    if (!transferСreated) return;

    const partialFee = (await this.currentCurrency!.getPartialFee(this.addressByNetwork, true)) as number;

    this.partialFee = partialFee;
  }

  @Watch('recipient')
  @Watch('amount')
  async validateCountTokens() {
    this.isValidCountTokens =
      ((await this.currentCurrency?.isValidCountTokens(+this.amount, this.addressByNetwork)) && this.amount !== '0') ??
      false;
  }

  mounted() {
    this.selectedNetwork = this._selectedNetwork;
    this.selectedToken = this._selectedToken;
  }

  changeAmount(amount: string) {
    this.value = this.currentCurrency?.getCostOfTokens(+amount).toString() ?? '';
  }

  changeValue(value: string) {
    this.amount = this.currentCurrency?.getCountsTokensByPrice(+value).toString() ?? '';
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

    const transferableCountTokens =
      (await this.currentCurrency.getTransferableCountTokensMinusFee(this.addressByNetwork)).toString() ?? '';

    this.amount = transferableCountTokens;
    this.value = this.currentCurrency.getCostOfTokens(+transferableCountTokens).toString() ?? '';
  }

  async send() {
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
      color: #bb77ff;
    }

    .transferrable-token {
      margin-left: 5px;
      color: rgba(255, 255, 255, 0.9);
    }

    .transferrable-value {
      margin-left: 163px;
    }
  }

  .direction {
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

      .right-column {
        display: flex;
        flex-direction: column;
        align-items: flex-end;

        .sub-value {
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
