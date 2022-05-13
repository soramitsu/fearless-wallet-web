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

          <div class="row value">
            <Input v-model="amount" placeholder="Amount" size="big" styleInput="pink" />

            <div class="equals">=</div>

            <Input v-model="value" placeholder="Value" size="big" styleInput="pink" />
          </div>
        </template>
        <template v-else-if="step === 2">
          <div class="row direction">
            <Input :value="selectedWallet.name" placeholder="From" size="big" :readonly="true" />

            <s-icon name="arrows-arrow-right-24" />

            <Input :value="formattedAddressTo" placeholder="To" size="big" :readonly="true" />
          </div>

          <div class="row summary">
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
import { GettersTypes as ApiGettersTypes } from '@/store/api/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks } from '@/store/api/types';
import { Currency } from '@/interfaces/currencies';
import { firstCharToUp } from '@/util/stringHelper';
import Input from '@/components/Input.vue';
import Select from '@/components/Select.vue';
import ActivityForm from './ActivityForm.vue';
import SendingPopup from './SendingPopup.vue';
import currencyMock from '@/mocks/currency';

@Component({
  components: {
    ActivityForm,
    Input,
    Select,
    SendingPopup,
  },
})
export default class extends Vue {
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
  @Getter(ApiGettersTypes.getNetworksInfo) networksInfo!: Networks;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get currencies(): Currency[] {
    // TODO: fix as ''
    return currencyMock[this.selectedWallet.address as ''];
  }

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
    return this.step === 1 ? 'Continue' : 'Send';
  }

  get buttonDisabled() {
    return this.step === 1 ? !(!!this.network && !!this.selectedToken && !!this.recipient && !!this.amount) : false;
  }

  get formattedAddressTo() {
    return `${this.recipient.slice(0, 7)}...${this.recipient.slice(-8)}`;
  }

  get optionsNetwork() {
    return Object.keys(this.networksInfo).map((network) => {
      return { label: firstCharToUp(network), value: network };
    });
  }

  get optionsCurrency() {
    return this.currencies.map(({ token, mainNetwork }) => ({
      label: `${firstCharToUp(mainNetwork)} (${token})`,
      value: token,
    }));
  }

  get tokenInfo() {
    return this.currencies.find(({ token }) => token === this.selectedToken);
  }

  get tokenPrice() {
    return this.tokenInfo?.price ?? 1;
  }

  get value() {
    return (this.tokenPrice * +this.amount).toString();
  }

  set value(value) {
    this.amount = (+value / this.tokenPrice).toString();
  }

  mounted() {
    this.network = this.selectedNetwork ?? '';
    this.selectedToken = this.token;
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

  .value {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .equals {
      font-size: 50px;
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
    clip-path: var(--big-clip-path-left-top-and-right-bottom);
    border-radius: var(--default-border-radius);

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
