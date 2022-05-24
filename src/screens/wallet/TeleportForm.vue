<template>
  <div>
    <ActivityForm
      header="Teleport"
      :buttonText="buttonText"
      :handlerButton="teleport"
      :closeForm="closeForm"
      :buttonDisabled="buttonDisabled"
      class="teleport-form"
    >
      <div class="teleport-form-content">
        <Select v-model="selectedToken" :options="optionsCurrency" placeholder="Currency" size="big" class="row" />

        <Select
          v-model="originalNetwork"
          :options="optionsNetwork"
          placeholder="Original network"
          size="big"
          class="row"
        />

        <div class="container-amount">
          <MaxButton class="max-button-amount" @click="setMaxValue" />

          <Input v-model="amount" placeholder="Amount" size="big" styleInput="pink" class="row" />
        </div>

        <Select
          v-model="destinationNetwork"
          :options="optionsNetwork"
          placeholder="Destination network"
          size="big"
          class="row"
        />
      </div>
    </ActivityForm>

    <SendingPopup
      v-if="showSendingPopup"
      header="Teleport"
      :popupLoading="sendingPopupLoading"
      :handlerClose="sendingPopupClose"
      :amount="amount"
      :token="selectedToken"
      :firstNetwork="originalNetwork"
      :secondNetwork="destinationNetwork"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Networks } from '@/store/networks/types';
import { Currency } from '@/interfaces/currencies';
import { firstCharToUp } from '@/util/stringHelper';
import Loading from '@/components/Loading.vue';
import Select from '@/components/Select.vue';
import Input from '@/components/Input.vue';
import Popup from '@/components/Popup.vue';
import ActivityForm from './ActivityForm.vue';
import MaxButton from './MaxButton.vue';
import SendingPopup from './SendingPopup.vue';
import CurrencyController from '@/controllers/currencyController';

@Component({
  components: {
    ActivityForm,
    Input,
    Select,
    Popup,
    Loading,
    SendingPopup,
    MaxButton,
  },
})
export default class TeleportForm extends Vue {
  showSendingPopup = false;
  sendingPopupLoading = false;
  selectedToken = '';
  originalNetwork = '';
  destinationNetwork = '';
  amount = '';

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) selectedNetwork!: string;
  @Prop(String) token!: string;
  @Prop(Array) currencies!: Currency[];
  @Getter(NetworksGettersTypes.getNetworksInfo) networksInfo!: Networks;

  get buttonText() {
    if (!this.currentCurrencyController) return '';

    const { totalCountTokens, token } = this.currentCurrencyController.getCurrencyInfo();

    return +this.amount > totalCountTokens ? `Insufficient balance ${token.toUpperCase()}` : 'Teleport';
  }

  get currentCurrency() {
    return this.currencies.find(({ token }) => token === this.selectedToken);
  }

  get currentCurrencyController() {
    if (!this.currentCurrency) return null;

    return new CurrencyController(this.currentCurrency);
  }

  get buttonDisabled() {
    if (!this.currentCurrencyController) return true;

    const { totalCountTokens } = this.currentCurrencyController.getCurrencyInfo();

    return !(+this.amount > totalCountTokens)
      ? !(!!this.selectedToken && !!this.originalNetwork && !!this.destinationNetwork && !!this.amount)
      : true;
  }

  get optionsCurrency() {
    return this.currencies.map(({ token, mainNetwork }) => ({
      label: `${firstCharToUp(mainNetwork)} (${token})`,
      value: token,
    }));
  }

  get feeValueDollars() {
    return 2.45;
  }

  get optionsNetwork() {
    return this.networksInfo.map(({ name }) => ({ label: firstCharToUp(name), value: name }));
  }

  mounted() {
    this.selectedToken = this.token;
    this.originalNetwork = this.selectedNetwork;
  }

  setMaxValue() {
    if (!this.currentCurrencyController) return;

    const { totalCountTokens } = this.currentCurrencyController.getCurrencyInfo();

    this.amount = totalCountTokens.toString();
  }

  sendingPopupClose() {
    this.showSendingPopup = false;
  }

  teleport() {
    this.showSendingPopup = true;
    this.sendingPopupLoading = true;

    setTimeout(() => {
      this.sendingPopupLoading = false;
    }, 2000);
  }
}
</script>

<style lang="scss" scoped>
.teleport-form {
  .teleport-form-content {
    .row {
      margin-top: 16px;

      &:first-child {
        margin-top: 0;
      }
    }
  }

  .container-amount {
    position: relative;

    .max-button-amount {
      right: 25px;
      top: 20px;
    }
  }

  .fee {
    font-weight: 300;
    font-size: 15px;
  }
}
</style>
