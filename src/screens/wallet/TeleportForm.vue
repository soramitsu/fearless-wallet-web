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

          <Input v-model="amount" placeholder="Amount" size="big" styleInput="pink" type="number" class="row" />
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
      :value="1"
      :token="selectedToken"
      :firstNetwork="originalNetwork"
      :secondNetwork="destinationNetwork"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks } from '@/store/networks/types';
import { firstCharToUp } from '@/util/helpers';
import { Currency } from '@/interfaces/currencies';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import Loading from '@/components/Loading.vue';
import Select from '@/components/Select.vue';
import Input from '@/components/Input.vue';
import Popup from '@/components/Popup.vue';
import ActivityForm from './ActivityForm.vue';
import MaxButton from './MaxButton.vue';
import SendingPopup from './SendingPopup.vue';

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
  isValidCountTokens = false;
  selectedToken = '';
  originalNetwork = '';
  destinationNetwork = '';
  amount = '';

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) _originalNetwork!: string;
  @Prop(String) _selectedToken!: string;
  @Prop(Array) currencies!: Currency[];
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get buttonText() {
    if (!this.currentCurrency) return '';

    const { token } = this.currentCurrency;

    return this.isValidCountTokens ? `Insufficient balance ${token.toUpperCase()}` : 'Teleport';
  }

  get currentCurrency() {
    return this.currencies.find(({ token }) => token === this.selectedToken);
  }

  get buttonDisabled() {
    if (!this.currentCurrency) return true;

    const transferableTokens = this.currentCurrency.getTotalCountTokens();

    return !(+this.amount > transferableTokens)
      ? !(!!this.selectedToken && !!this.originalNetwork && !!this.destinationNetwork && !!this.amount)
      : true;
  }

  get optionsCurrency() {
    const token = this.currentCurrency?.token ?? '';

    return this.currentCurrency?.getAvailableInNetworks().map(() => ({
      label: token.toUpperCase(),
      value: token,
    }));
  }

  get optionsNetwork() {
    return this.networks.map(({ name }) => ({ label: firstCharToUp(name), value: name }));
  }

  get addressByNetwork() {
    const { address, ethereumAddress } = this.selectedWallet;
    const isEthereumNetwork = ETHEREUM_NETWORKS.includes(this.originalNetwork);
    const addressByNetwork = isEthereumNetwork ? ethereumAddress : address;

    return addressByNetwork;
  }

  @Watch('addressByNetwork')
  @Watch('amount')
  async validateCountTokens() {
    this.isValidCountTokens =
      ((await this.currentCurrency?.isValidCountTokens(+this.amount, this.addressByNetwork)) && this.amount !== '0') ??
      false;
  }

  mounted() {
    this.selectedToken = this._selectedToken;
    this.originalNetwork = this._originalNetwork;
  }

  async setMaxValue() {
    if (!this.currentCurrency) return;

    const transferableCountTokens =
      (await this.currentCurrency?.getTransferableCountTokensMinusFee(this.addressByNetwork))?.toString() ?? '';

    this.amount = transferableCountTokens;
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
