<template>
  <div>
    <AboveForm
      :header="header"
      :blur="true"
      :showBackIcon="showBackIcon"
      :handlerBack="handlerBack"
      :closeHandler="closeForm"
    >
      <div class="transfer-form">
        <div>
          <template v-if="step === 1">
            <Select
              v-model="syncedSelectedAssetId"
              class="row"
              placeholder="CURRENCY"
              size="big"
              :options="optionsCurrency"
            />

            <Select
              v-model="syncedSelectedNetwork"
              :options="optionsNetworks"
              placeholder="NETWORK"
              size="big"
              class="row"
            />

            <slot></slot>

            <AmountInputs
              class="row"
              :amount="syncedAmount"
              :value="syncedValue"
              :currency="currency"
              @setMaxValue="setMaxValue"
              @update:amount="updateAmount"
              @update:value="updateValue"
            />

            <div class="transferrable row">
              <div class="transferrable-part">
                <div class="transferrable-label">Transferrable</div>
                <div class="transferrable-descriptions">
                  <div class="transferrable-amount">{{ transferrableAmount }}</div>
                  <div class="transferrable-assets">{{ selectedAssetUpper }}</div>
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
          <template v-else-if="step === 2"><slot name="stepTwo"></slot> </template>
        </div>

        <Button
          size="big"
          class="button"
          :text="buttonText"
          :disabled="buttonDisabled"
          @click="handlerContinueButton"
        />
      </div>
    </AboveForm>

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="currency"
      :amount="syncedAmount"
      :value="syncedValue"
      :address="addressByNetwork"
      :firstNetwork="syncedSelectedNetwork"
      :secondNetwork="syncedDestNet"
      @close="confirmationPasswordPopupClose"
    />

    <ExistentialPopup
      v-if="showExistentialPopup"
      :handlerClose="handlerCloseExistentialPopup"
      :handlerAcceptButton="handlerAcceptExistentialPopup"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch, PropSync } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import AmountInputs from './AmountInputs.vue';
import ConfirmationPasswordPopup from './ConfirmationPasswordPopup.vue';
import MaxButton from './MaxButton.vue';
import ExistentialPopup from './ExistentialPopup.vue';
import type { Currencies, Networks } from '@/interfaces';
import type { GetAssetName } from '@/store/networks/types';
import BaseApi from '@/util/BaseApi';
import Input from '@/components/Input.vue';
import FloatInput from '@/components/FloatInput.vue';
import Select from '@/components/Select.vue';
import Corners from '@/components/Corners.vue';
import NetworkLogo from '@/components/NetworkLogo.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { firstCharToUp } from '@/helpers/common';
import { formattedNumber, formattedPrice } from '@/helpers/numbers';
import { getCurrencyOptions } from '@/helpers/currencies';
import AboveForm from '@/components/AboveForm.vue';
import Button from '@/components/Button.vue';
import { NATIVE_PARACHAINS, RELAY_CHAINS } from '@/consts/networks';

@Component({
  components: {
    Input,
    Select,
    Button,
    Corners,
    MaxButton,
    AboveForm,
    FloatInput,
    NetworkLogo,
    AmountInputs,
    ExistentialPopup,
    ConfirmationPasswordPopup,
  },
})
export default class SendForm extends Vue {
  isValidCountAssets = true;
  showExistentialPopup = false;
  showConfirmationPasswordPopup = false;
  step = 1;

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) header!: string;
  @Prop(String) extrinsicType!: 'transfer' | 'teleport';
  @Prop({ default: '' }) recipient!: string;
  @PropSync('selectedAssetId', { type: String }) syncedSelectedAssetId!: string;
  @PropSync('selectedNetwork', { type: String }) syncedSelectedNetwork!: string;
  @PropSync('destinationNetwork', { type: String, default: '' }) syncedDestNet!: string;
  @PropSync('amount', { type: String }) syncedAmount!: string;
  @PropSync('value', { type: String }) syncedValue!: string;
  @PropSync('partialFee', { type: String }) syncedPartialFee!: string;
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(NetworksGettersTypes.getAssetName) getAssetName!: GetAssetName;

  get showBackIcon() {
    return this.step === 2;
  }

  get isValidDirection() {
    // TODO: fix; from native parachains only to the relay chain
    if (NATIVE_PARACHAINS.includes(this.syncedSelectedNetwork) && !RELAY_CHAINS.includes(this.syncedDestNet))
      return false;

    return !!this.currency && this.syncedSelectedNetwork !== '' && this.syncedDestNet !== '';
  }

  get buttonText() {
    if (!this.currency) return '';

    if (this.step === 2) {
      if (this.extrinsicType === 'transfer') return 'Send';

      return 'Teleport';
    }

    if (this.extrinsicType === 'transfer' && this.recipient !== '' && !this.isValidRecipientAddress)
      return 'Incorrect address';
    else if (this.extrinsicType === 'teleport' && this.syncedDestNet !== '' && !this.isValidDirection)
      return 'Impossible to teleport';

    if (!this.isValidCountAssets) return `Insufficient balance ${this.selectedAssetUpper}`;

    return 'Continue';
  }

  get buttonDisabled() {
    if (this.step === 2) return false;

    return !this.isAllFieldsCorrect || +this.syncedAmount === 0 || this.syncedPartialFee === '';
  }

  get isAllFieldsCorrect() {
    if (!this.currency) return false;

    const isValidMainFields =
      !!this.syncedSelectedAssetId && !!this.syncedSelectedNetwork && !!this.syncedAmount && this.isValidCountAssets;

    return isValidMainFields && (this.isValidRecipientAddress || !!this.syncedDestNet);
  }

  get isValidRecipientAddress() {
    return BaseApi.validateAddress(this.recipient);
  }

  get addressByNetwork() {
    return this.currency?.getTransactionAddress(this.selectedWallet, this.syncedSelectedNetwork) ?? '';
  }

  get currency() {
    return this.currencies.find(({ assetId }) => assetId === this.syncedSelectedAssetId);
  }

  get optionsNetworks() {
    const availableInNetworks = this.currency?.getAvailableInNetworks(this.selectedWallet);

    return availableInNetworks?.map(({ network, precision, type }) => ({
      label: firstCharToUp(network),
      value: `${network}`,
      precision,
      type,
    }));
  }

  get transferrableAmount() {
    const count = +(this.currency?.getTransferableCountAssets(this.syncedSelectedNetwork, this.selectedWallet) ?? 0);

    return formattedNumber(count, 4, false, true);
  }

  get transferrableValue() {
    const cost = +(this.currency?.getCostOfAssets(this.transferrableAmount) ?? 0);

    return formattedPrice(cost);
  }

  get selectedAsset() {
    return this.getAssetName(this.syncedSelectedAssetId);
  }

  get selectedAssetUpper() {
    return this.selectedAsset.toUpperCase();
  }

  get optionsCurrency() {
    return getCurrencyOptions(this.currencies);
  }

  @Watch('syncedSelectedNetwork')
  resetDestNetwork(newValue: string, prevValue: string) {
    if (newValue === this.syncedDestNet) this.syncedDestNet = prevValue;
  }

  @Watch('syncedSelectedAssetId')
  updateSelectedNetwork() {
    this.syncedSelectedNetwork = this.optionsNetworks?.[0]?.value ?? '';
    this.syncedAmount = '';
    this.syncedDestNet = '';
  }

  @Watch('syncedSelectedAssetId')
  @Watch('syncedSelectedNetwork')
  @Watch('syncedDestNet')
  @Watch('recipient')
  @Watch('syncedAmount')
  async createSendTransfer() {
    this.syncedPartialFee = '';

    if (
      (this.extrinsicType === 'transfer' && (!this.isValidRecipientAddress || this.syncedSelectedNetwork === '')) ||
      (this.extrinsicType === 'teleport' && (!this.isValidDirection || this.syncedSelectedNetwork === ''))
    )
      return;

    const partialFee = await this.createTransferAndGetFee();

    this.syncedPartialFee = partialFee;
    this.isValidCountAssets = this.currency!.validateCountAssets(
      this.syncedAmount,
      partialFee,
      this.syncedSelectedNetwork,
      this.selectedWallet
    );
  }

  mounted() {
    this.$nextTick(() => {
      const index = this.optionsNetworks?.findIndex(({ value }) => value === this.syncedSelectedNetwork);

      if (index === -1) this.syncedSelectedNetwork = this.optionsNetworks?.[0]?.value ?? '';
    });
  }

  createTransferAndGetFee(amount?: string) {
    const networkProps = this.optionsNetworks!.find(({ value }) => value === this.syncedSelectedNetwork)!;

    if (this.extrinsicType === 'transfer') {
      if (!this.isValidRecipientAddress || this.syncedSelectedNetwork === '') return '0';

      this.currency!.createTransferExtrinsic(this.recipient, amount ?? this.syncedAmount, networkProps);
    } else {
      if (!this.isValidDirection || this.syncedSelectedNetwork === '') return '0';

      this.currency!.createTeleportExtrinsic(
        this.selectedWallet,
        this.syncedDestNet,
        amount ?? this.syncedAmount,
        networkProps
      );
    }

    return this.currency!.getPartialFee(this.addressByNetwork, networkProps);
  }

  updateAmount(value: string) {
    this.syncedAmount = value;
  }

  updateValue(value: string) {
    this.syncedValue = value;
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

    const maxTransferableCountAssets = this.currency?.getTransferableCountAssets(
      this.syncedSelectedNetwork,
      this.selectedWallet
    );
    const partialFee = await this.createTransferAndGetFee(maxTransferableCountAssets);
    const transferableCountAssets = this.currency
      .getTransferableCountAssetsMinusFee(partialFee, this.syncedSelectedNetwork, this.selectedWallet)
      .toString();

    this.syncedAmount = transferableCountAssets;
    this.syncedValue = this.currency.getCostOfAssets(transferableCountAssets).toString();
  }

  handlerContinueButton(skipWarning = false) {
    if (!skipWarning && this.step === 1) {
      this.showExistentialPopup = !this.currency!.validateExistentialDeposit(
        this.selectedWallet,
        this.syncedSelectedNetwork,
        this.syncedAmount,
        this.syncedPartialFee
      );

      if (this.showExistentialPopup) return;
    }

    if (this.step === 2) {
      this.showConfirmationPasswordPopup = true;

      return;
    }

    this.step += 1;
  }

  handlerCloseExistentialPopup() {
    this.showExistentialPopup = false;
  }

  handlerAcceptExistentialPopup() {
    this.handlerContinueButton(true);
    this.handlerCloseExistentialPopup();
  }
}
</script>

<style lang="scss">
.transfer-form {
  .row {
    margin-top: 16px;

    &:first-child {
      margin-top: 0;
    }
  }
}
</style>

<style lang="scss" scoped>
.transfer-form {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

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

      .transferrable-assets {
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
