<template>
  <div>
    <ActivityForm
      header="Teleport"
      buttonText="Teleport"
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

        <Input v-model="amount" placeholder="Amount" size="big" styleInput="pink" class="row" />

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
import { GettersTypes as ApisGettersTypes } from '@/store/networks/getters';
import { Networks } from '@/store/networks/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Currencies } from '@/interfaces/currencies';
import { firstCharToUp } from '@/util/stringHelper';
import Loading from '@/components/Loading.vue';
import Select from '@/components/Select.vue';
import Input from '@/components/Input.vue';
import Popup from '@/components/Popup.vue';
import ActivityForm from './ActivityForm.vue';
import SendingPopup from './SendingPopup.vue';
import currencyMock from '@/mocks/currency';

@Component({
  components: {
    ActivityForm,
    Input,
    Select,
    Popup,
    Loading,
    SendingPopup,
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
  @Getter(ApisGettersTypes.getNetworksInfo) networksInfo!: Networks;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get currencies(): Currencies {
    // TODO: fix as ''
    return currencyMock[this.selectedWallet.address as ''];
  }

  get buttonDisabled() {
    return !(!!this.selectedToken && !!this.originalNetwork && !!this.destinationNetwork && !!this.amount);
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

  .fee {
    font-weight: 300;
    font-size: 15px;
  }
}
</style>
