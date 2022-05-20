<template>
  <div>
    <ActivityForm
      class="send-form"
      header="Send Funds"
      :buttonText="buttonText"
      :handlerButton="handler"
      :closeForm="closeForm"
      :buttonDisabled="buttonDisabled"
    >
      <div class="send-form-content">
        <template v-if="step === 1">
          <Select v-model="network" :options="optionsNetwork" placeholder="Network" size="big" class="row" />

          <Select v-model="selectedToken" :options="optionsCurrency" placeholder="Currency" size="big" class="row" />

          <Input v-model="recipient" placeholder="Send to" size="big" class="row" />

          <div class="row amount">
            <MaxButton class="max-button-amount" @click="setMaxValue" />
            <MaxButton class="max-button-value" @click="setMaxValue" />

            <Input v-model="amount" placeholder="Amount" size="big" styleInput="pink" />

            <img src="@/assets/equals.svg" />

            <Input v-model="value" placeholder="Value" size="big" styleInput="pink" />
          </div>
        </template>
        <template v-else-if="step === 2">
          <div class="row direction">
            <Input :value="selectedWallet.name" placeholder="From" size="big" :readonly="true" />

            <s-icon name="arrows-arrow-right-24" />

            <Input :value="formattedAddressTo" placeholder="To" size="big" :readonly="true" />
          </div>

          <Corners size="big" class="row">
            <div class="summary">
              <div class="summary-label">Summary</div>
              <div class="summary-row">
                <div class="name">Coins</div>
                <div class="right-column">
                  <div>{{ amount }} {{ selectedToken }}</div>
                  <div class="sub-value">${{ value }}</div>
                </div>
              </div>
              <div class="summary-row">
                <div class="name">Fee</div>
                <div class="right-column">
                  <div>{{ fee }} {{ selectedToken }}</div>
                  <div class="sub-value">max fee: {{ fee }} {{ selectedToken }}</div>
                </div>
              </div>
              <div class="summary-row">
                <div class="name">Total</div>
                <div class="right-column">
                  <div>{{ total }} {{ selectedToken }}</div>
                  <div class="sub-value">max total: {{ value }} {{ selectedToken }}</div>
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
      :token="selectedToken"
      :firstNetwork="network"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as ApiGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks } from '@/store/networks/types';
import { Currencies } from '@/interfaces/currencies';
import { firstCharToUp } from '@/util/stringHelper';
import Input from '@/components/Input.vue';
import Select from '@/components/Select.vue';
import Corners from '@/components/Corners.vue';
import ActivityForm from './ActivityForm.vue';
import SendingPopup from './SendingPopup.vue';
import MaxButton from './MaxButton.vue';
import CurrencyController from '@/controllers/currencyController';

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
  step = 1;
  network = '';
  selectedToken = '';
  recipient = '';
  amount = '';

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) selectedNetwork!: string;
  @Prop(String) token!: string;
  @Prop(Array) currencies!: Currencies;
  @Getter(ApiGettersTypes.getNetworksInfo) networksInfo!: Networks;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get fee() {
    return 0.0015;
  }

  get total() {
    return +this.amount + this.fee;
  }

  get headerSendingPopup() {
    return this.sendingPopupLoading ? 'Send Funds' : 'Successful sending';
  }

  get buttonText() {
    if (this.step === 2) return 'Send';

    if (!this.currentCurrencyController) return '';

    const { countTokens, token } = this.currentCurrencyController.getCurrencyInfo();

    return +this.amount > countTokens ? `Insufficient balance ${token.toUpperCase()}` : 'Continue';
  }

  get buttonDisabled() {
    if (this.step === 2) return false;

    if (!this.currentCurrencyController) return true;

    const { countTokens } = this.currentCurrencyController.getCurrencyInfo();

    return !(+this.amount > countTokens)
      ? !(!!this.network && !!this.selectedToken && !!this.recipient && !!this.amount)
      : true;
  }

  get formattedAddressTo() {
    return `${this.recipient.slice(0, 7)}...${this.recipient.slice(-8)}`;
  }

  get optionsNetwork() {
    return this.networksInfo.map(({ name }) => {
      return { label: firstCharToUp(name), value: name };
    });
  }

  get optionsCurrency() {
    return this.currencies.map(({ token, mainNetwork }) => ({
      label: `${firstCharToUp(mainNetwork)} (${token})`,
      value: token,
    }));
  }

  get currentCurrency() {
    return this.currencies.find(({ token }) => token === this.selectedToken);
  }

  get currentCurrencyController() {
    if (!this.currentCurrency) return null;

    return new CurrencyController(this.currentCurrency);
  }

  get tokenPrice() {
    return this.currentCurrency?.price ?? 1;
  }

  get value() {
    if (!this.currentCurrencyController) return 0;

    return this.currentCurrencyController.getCostOfTokens(+this.amount);
  }

  set value(value) {
    if (!this.currentCurrencyController) return;

    this.amount = this.currentCurrencyController?.getCountsTokensByPrice(+value).toString();
  }

  mounted() {
    this.network = this.selectedNetwork ?? '';
    this.selectedToken = this.token;
  }

  setMaxValue() {
    if (!this.currentCurrencyController) return;

    const { countTokens } = this.currentCurrencyController.getCurrencyInfo();

    this.amount = countTokens.toString();
  }

  sendingPopupClose() {
    this.showSendingPopup = false;
  }

  handler() {
    if (this.step === 1) this.step += 1;
    else if (this.step === 2) {
      this.showSendingPopup = true;
      this.sendingPopupLoading = true;

      setTimeout(() => {
        this.sendingPopupLoading = false;
      }, 2000);
    }
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

  .amount {
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
