<template>
  <div>
    <ActivityForm
      header="Teleport"
      :buttonText="buttonText"
      :handlerButton="handlerButton"
      :showBackIcon="showBackIcon"
      :handlerBack="handlerBack"
      :closeForm="closeForm"
      :buttonDisabled="buttonDisabled"
      class="teleport-form"
    >
      <div class="teleport-form-content">
        <template v-if="step === 1">
          <Select v-model="selectedToken" :options="optionsCurrency" placeholder="Currency" size="big" class="row" />

          <Select
            v-model="originalNetwork"
            :options="optionsNetwork"
            placeholder="Original network"
            size="big"
            class="row"
          />

          <Select
            v-model="destinationNetwork"
            :options="optionsNetwork"
            placeholder="Destination network"
            size="big"
            class="row"
          />

          <div class="container-amount">
            <MaxButton class="max-button-amount" @click="setMaxValue" />

            <FloatInput v-model="amount" placeholder="Amount" size="big" styleInput="pink" type="number" class="row" />
          </div>

          <div class="row transferrable">
            <div class="transferrable-label">Transferrable</div>
            <div class="transferrable-descriptions">
              <div class="transferrable-amount">{{ transferrableAmount }}</div>
              <div class="transferrable-token">{{ selectedTokenUpper }}</div>
            </div>
          </div>
        </template>
        <template v-else-if="step === 2">
          <Corners size="big" class="row">
            <div class="summary">
              <div class="summary-label">Summary</div>
              <div class="summary-row">
                <div class="column column-left">
                  <div class="name">From</div>
                  <div class="network-name">{{ originalNetworkString }}</div>
                </div>

                <img src="@/assets/bold-arrow-right.svg" />

                <div class="column">
                  <div class="name">To</div>
                  <div class="network-name">{{ destinationNetworkString }}</div>
                </div>
              </div>
              <div class="summary-row">
                <div class="name">Assets Amount</div>
                <div class="column">
                  <div>{{ amountString }}</div>
                  <div class="sub-value">{{ valueString }}</div>
                </div>
              </div>
              <div class="summary-row">
                <div class="name">{{ originalNetworkString }} Fee</div>
                <div class="column">
                  <div>{{ originalNetworkPartialFeeString }}</div>
                </div>
              </div>
              <div class="summary-row">
                <div class="name">{{ destinationNetworkString }} Fee</div>
                <div class="column">
                  <div>{{ destinationNetworkPartialFeeString }}</div>
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
      header="Teleport"
      :popupLoading="sendingPopupLoading"
      :handlerClose="sendingPopupClose"
      :amount="amount"
      :value="value"
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
import FloatInput from '@/components/FloatInput.vue';
import Popup from '@/components/Popup.vue';
import ActivityForm from './ActivityForm.vue';
import MaxButton from './MaxButton.vue';
import SendingPopup from './SendingPopup.vue';
import Corners from '@/components/Corners.vue';

@Component({
  components: {
    ActivityForm,
    Select,
    Popup,
    Loading,
    SendingPopup,
    MaxButton,
    Corners,
    FloatInput,
  },
})
export default class TeleportForm extends Vue {
  isValidCountTokens = true;
  showSendingPopup = false;
  sendingPopupLoading = false;
  originalNetworkPartialFee = 0;
  destinationNetworkPartialFee = 0;
  selectedToken = '';
  originalNetwork = '';
  destinationNetwork = '';
  amount = '';
  step = 1;

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) _originalNetwork!: string;
  @Prop(String) _selectedToken!: string;
  @Prop(Array) currencies!: Currency[];
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get originalNetworkString() {
    return `${firstCharToUp(this.originalNetwork)}`;
  }

  get destinationNetworkString() {
    return `${firstCharToUp(this.destinationNetwork)}`;
  }

  get amountString() {
    return `${+this.amount} ${this.selectedTokenUpper}`;
  }

  get valueString() {
    return `$${this.value}`;
  }

  get value() {
    return this.currentCurrency?.getCostOfTokens(+this.amount).toString() ?? '';
  }

  get originalNetworkPartialFeeString() {
    return `${this.originalNetworkPartialFee} ${this.selectedTokenUpper}`;
  }

  get destinationNetworkPartialFeeString() {
    return `${this.destinationNetworkPartialFee} ${this.selectedTokenUpper}`;
  }

  get totalString() {
    const total = this.currentCurrency?.addNumbers([
      +this.amount,
      this.originalNetworkPartialFee,
      this.destinationNetworkPartialFee,
    ]);

    return `${total} ${this.selectedTokenUpper}`;
  }

  get transferrableAmount() {
    return this.currentCurrency?.getTransferableCountTokens() ?? 0;
  }

  get selectedTokenUpper() {
    return this.selectedToken.toUpperCase();
  }

  get buttonText() {
    if (this.step === 2) return 'Teleport';

    if (!this.currentCurrency) return '';

    const { token } = this.currentCurrency;

    if (this.destinationNetwork !== '' && !this.isValidTeleportDirection) return 'Impossible to teleport';
    else if (!this.isValidCountTokens) return `Insufficient balance ${token.toUpperCase()}`;

    return 'Next';
  }

  get currentCurrency() {
    return this.currencies.find(
      ({ token, mainNetwork }) => token === this.selectedToken && mainNetwork === this.originalNetwork
    );
  }

  get showBackIcon() {
    return this.step === 2;
  }

  get buttonDisabled() {
    if (this.step === 2) return false;

    return !this.isAllFieldsCorrect || +this.amount === 0 || this.originalNetworkPartialFee === 0;
  }

  get isValidTeleportDirection() {
    return this.currentCurrency?.getParaId(this.originalNetwork, this.destinationNetwork) !== undefined;
  }

  get isAllFieldsCorrect() {
    if (!this.currentCurrency) return false;

    return (
      !!this.selectedToken &&
      !!this.originalNetwork &&
      !!this.destinationNetwork &&
      !!this.amount &&
      this.isValidCountTokens
    );
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

  @Watch('originalNetwork')
  updateSelectedToken() {
    this.selectedToken = this.optionsCurrency?.[0]?.value ?? '';
  }

  @Watch('originalNetwork')
  @Watch('destinationNetwork')
  @Watch('selectedToken')
  @Watch('amount')
  async createTeleportTransfer() {
    this.originalNetworkPartialFee = 0;

    if (!this.isValidTeleportDirection) return;

    this.currentCurrency!.createTeleportTransfer(
      this.addressByNetwork,
      this.originalNetwork,
      this.destinationNetwork,
      this.selectedToken,
      this.amount
    );

    const partialFee = (await this.currentCurrency!.getPartialFee(this.addressByNetwork, true)) as number;

    this.originalNetworkPartialFee = partialFee;
    this.isValidCountTokens = this.currentCurrency!.isValidCountTokens(+this.amount, partialFee);
  }

  mounted() {
    this.selectedToken = this._selectedToken;
    this.originalNetwork = this._originalNetwork;
  }

  async setMaxValue() {
    if (!this.currentCurrency) return;

    this.amount = this.currentCurrency.getTransferableCountTokensMinusFee(this.originalNetworkPartialFee).toString();
  }

  sendingPopupClose() {
    this.showSendingPopup = false;

    this.closeForm();
  }

  handlerBack() {
    this.step = 1;
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

  .transferrable {
    display: flex;
    align-items: center;

    .transferrable-label {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.75);
      text-align: left;
    }

    .transferrable-descriptions {
      display: flex;
      margin-left: 5px;
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
        text-align: left;
      }

      .column {
        display: flex;
        flex-direction: column;
        align-items: flex-end;

        .sub-value {
          color: rgba(255, 255, 255, 0.75);
          font-weight: 300;
          font-size: 12px;
          margin-top: 3px;
        }

        .network-name {
          margin-top: 10px;
          color: $pink-lavender-color;
        }
      }

      .column-left {
        align-items: flex-start;
      }
    }
  }
}
</style>
