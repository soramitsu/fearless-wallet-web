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

          <AmountInputs
            class="row"
            :amount="amount"
            :value="value"
            :currency="currency"
            @setMaxValue="setMaxValue"
            @update:amount="updateAmount"
            @update:value="updateValue"
          />

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
                  <div v-if="showValue" class="value">{{ valueString }}</div>
                </div>
              </div>
              <div class="summary-row">
                <div class="name">{{ originalNetworkString }} Fee</div>
                <div>
                  {{ originalNetworkPartialFeeString }}
                </div>
              </div>
              <div class="summary-row">
                <div class="name">{{ destinationNetworkString }} Fee</div>
                <div>{{ destinationNetworkPartialFeeString }}</div>
              </div>
              <div class="summary-row">
                <div class="name">Total</div>
                <div>{{ totalString }}</div>
              </div>
            </div>
          </Corners>
        </template>
      </div>
    </ActivityForm>

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      header="Teleport"
      :currency="currency"
      :amount="amount"
      :value="value"
      :token="selectedToken"
      :address="addressByNetwork"
      :firstNetwork="originalNetwork"
      :secondNetwork="destinationNetwork"
      @close="confirmationPasswordPopupClose"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import ActivityForm from './ActivityForm.vue';
import MaxButton from './MaxButton.vue';
import ConfirmationPasswordPopup from './ConfirmationPasswordPopup.vue';
import AmountInputs from './AmountInputs.vue';
import type { Currencies } from '@/interfaces/currencies';
import type { Networks } from '@/interfaces/networks';
import Select from '@/components/Select.vue';
import FloatInput from '@/components/FloatInput.vue';
import Popup from '@/components/Popup.vue';
import Corners from '@/components/Corners.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { firstCharToUp } from '@/util/helpers';
import { addNumbers, formattedNumber, formattedPrice } from '@/util/numbers';

@Component({
  components: {
    Popup,
    Select,
    Corners,
    MaxButton,
    FloatInput,
    ActivityForm,
    AmountInputs,
    ConfirmationPasswordPopup,
  },
})
export default class TeleportForm extends Vue {
  isValidCountTokens = true;
  showConfirmationPasswordPopup = false;
  originalNetworkPartialFee = '';
  destinationNetworkPartialFee = '';
  selectedToken = '';
  originalNetwork = '';
  destinationNetwork = '';
  amount = '';
  value = '';
  step = 1;

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) _originalNetwork!: string;
  @Prop(String) _selectedToken!: string;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get showFiatSymbol() {
    return this.value !== '';
  }

  get showValue() {
    return this.value !== '0';
  }

  get showValueInput() {
    return this.currency?.price !== 0;
  }

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
    return `${this.fiatSymbol}${formattedPrice(+this.value)}`;
  }

  get originalNetworkPartialFeeString() {
    return `${formattedNumber(+this.originalNetworkPartialFee, 7)} ${this.selectedTokenUpper}`;
  }

  get destinationNetworkPartialFeeString() {
    return `${formattedNumber(+this.destinationNetworkPartialFee)} ${this.selectedTokenUpper}`;
  }

  get totalString() {
    const total = +addNumbers([this.amount, this.originalNetworkPartialFee, this.destinationNetworkPartialFee]);

    return `${formattedNumber(total, 7)} ${this.selectedTokenUpper}`;
  }

  get transferrableAmount() {
    const count = +(this.currency?.getTransferableCountTokens(this.originalNetwork, this.selectedWallet) ?? 0);

    return formattedNumber(count, 4);
  }

  get selectedTokenUpper() {
    return this.selectedToken.toUpperCase();
  }

  get buttonText() {
    if (this.step === 2) return 'Teleport';

    if (!this.currency) return '';

    const { token } = this.currency;

    if (this.destinationNetwork !== '' && !this.isValidTeleportDirection) return 'Impossible to teleport';
    else if (!this.isValidCountTokens) return `Insufficient balance ${token.toUpperCase()}`;

    return 'Next';
  }

  get currency() {
    return this.currencies.find(({ token }) => token === this.selectedToken);
  }

  get showBackIcon() {
    return this.step === 2;
  }

  get buttonDisabled() {
    if (this.step === 2) return false;

    return !this.isAllFieldsCorrect || +this.amount === 0 || this.originalNetworkPartialFee === '';
  }

  get isValidTeleportDirection() {
    return this.currency?.getParaId(this.originalNetwork, this.destinationNetwork) !== undefined;
  }

  get isAllFieldsCorrect() {
    if (!this.currency) return false;

    return (
      !!this.selectedToken &&
      !!this.originalNetwork &&
      !!this.destinationNetwork &&
      !!this.amount &&
      this.isValidCountTokens
    );
  }

  get optionsCurrency() {
    return this.currencies.map(({ token }) => ({ label: token.toUpperCase(), value: token }));
  }

  get optionsNetwork() {
    const availableInNetworks = this.currency?.getAvailableInNetworks(this.selectedWallet);

    return availableInNetworks?.map(({ network }) => ({
      label: firstCharToUp(network),
      value: `${network}`,
    }));
  }

  get addressByNetwork() {
    return this.currency?.getTransactionAddress(this.selectedWallet, this.originalNetwork) ?? '';
  }

  @Watch('selectedToken')
  updateSelectedNetwork() {
    this.originalNetwork = this.optionsNetwork?.[0]?.value ?? '';
    this.destinationNetwork = '';
    this.amount = '';
  }

  @Watch('originalNetwork')
  @Watch('destinationNetwork')
  @Watch('selectedToken')
  @Watch('amount')
  async createTeleportTransfer() {
    this.originalNetworkPartialFee = '';

    if (!this.isValidTeleportDirection) return;

    const partialFee = await this.createTransferAndGetFee();

    this.originalNetworkPartialFee = partialFee;
    this.isValidCountTokens = this.currency!.isValidCountTokens( // eslint-disable-line
      this.amount,
      partialFee,
      this.originalNetwork,
      this.selectedWallet
    );
  }

  mounted() {
    this.selectedToken = this._selectedToken;

    this.$nextTick(() => {
      const index = this.optionsNetwork?.findIndex(({ value }) => value === this._originalNetwork);

      this.originalNetwork = index !== -1 ? this._originalNetwork : this.optionsNetwork?.[0]?.value ?? '';
    });
  }

  updateAmount(value: string) {
    this.amount = value;
  }

  updateValue(value: string) {
    this.value = value;
  }

  async createTransferAndGetFee(amount?: string) {
    this.currency!.createTeleportTransfer( // eslint-disable-line
      this.selectedWallet,
      this.originalNetwork,
      this.destinationNetwork,
      amount ?? this.amount
    );

    return await this.currency!.getPartialFee(this.addressByNetwork); // eslint-disable-line
  }

  async setMaxValue() {
    if (!this.currency) return;

    const maxTransferableCountTokens = this.currency?.getTransferableCountTokens(
      this.originalNetwork,
      this.selectedWallet
    );
    const partialFee = await this.createTransferAndGetFee(maxTransferableCountTokens);

    this.amount = this.currency
      .getTransferableCountTokensMinusFee(partialFee, this.originalNetwork, this.selectedWallet)
      .toString();
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) this.closeForm();
  }

  changeAmount(amount: string) {
    this.value = this.currency?.getCostOfTokens(amount).toString() ?? '';
  }

  changeValue(value: string) {
    this.amount = this.currency?.getCountTokensByPrice(value).toString() ?? '';
  }

  handlerBack() {
    this.step = 1;
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

  .transferrable {
    display: flex;
    align-items: center;

    .transferrable-label {
      font-size: 14px;
      color: $default-white;
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
    padding: $default-padding;
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

        .value {
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
