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
            <RotateInput
              v-model="selectedAssetUpper"
              class="row"
              placeholder="assets.currency"
              :isActiveRotate="showSelectedAssetPopup"
              @click="toggleSelectPopupVisible(true, false, false)"
            />

            <RotateInput
              v-model="syncedSelectedNetwork"
              class="row"
              :placeholder="placeholderNetwork"
              :isActiveRotate="showSelectNetworkPopup"
              @click="toggleSelectPopupVisible(false, true, false)"
            />

            <Input
              v-if="extrinsicType === 'transfer'"
              v-model="syncedRecipient"
              placeholder="assets.sendTo"
              size="big"
              class="row"
            />

            <RotateInput
              v-else
              v-model="syncedDestNet"
              class="row"
              placeholder="assets.destNet"
              :isActiveRotate="showDestNetPopup"
              @click="toggleSelectPopupVisible(false, false, true)"
            />

            <AmountInputs
              class="row"
              :amount="syncedAmount"
              :value="syncedValue"
              :currency="currency"
              @setMaxValue="setMaxValue"
              @update:amount="updateAmount"
              @update:value="updateValue"
            />

            <div class="transferable row">
              <div class="transferable-part">
                <div class="transferable-label">{{ $t('assets.transferable') }}</div>

                <div class="transferable-descriptions">
                  <div class="transferable-amount">{{ $n(transferrableAmount, 'decimal') }}</div>
                  <div class="transferable-assets">{{ selectedAssetUpper }}</div>
                </div>
              </div>

              <div v-if="assetPrice" class="transferrable-part">
                <div class="transferrable-label">{{ $t('assets.transferrable') }}</div>

                <div class="transferable-descriptions">
                  <div class="transferable-amount">{{ fiatSymbol }}{{ transferableValue }}</div>
                </div>
              </div>
            </div>
          </template>

          <slot v-else-if="step === 2"></slot>
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

    <SelectPopup
      v-if="showSelectPopup"
      :placeholder="placeholderSelectPopup"
      verticalPlacement="top"
      class="transfer-select-popup"
      :value="selectPopupValue"
      :showBlur="false"
      :showBackground="false"
      :top="top"
      :left="left"
      :height="285"
      :options="options"
      :handlerFilter="handlerFilter"
      :toggleValue="toggleSelectedNetwork"
      :handlerClose="handlerCloseSelectPopup"
    />

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="currency"
      :amount="syncedAmount"
      :value="syncedValue"
      :tx="tx"
      :network="syncedSelectedNetwork"
      :firstIcon="firstIcon"
      :secondIcon="syncedDestNet"
      @close="confirmationPasswordPopupClose"
    />

    <ExistentialPopup
      v-if="showExistentialPopup"
      :handlerClose="handlerCloseExistentialPopup"
      :handlerAccept="handlerAcceptExistentialPopup"
    />

    <WarningAddressPopup
      v-if="showWarningAddressPopup"
      :handlerClose="handlerCloseWarningAddressPopup"
      :handlerAccept="handlerAcceptWarningAddress"
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
import WarningAddressPopup from './WarningAddressPopup.vue';
import RotateInput from './RotateInput.vue';
import type { GetAssetPrice } from '@/store';
import BaseApi from '@/util/BaseApi';
import FloatInput from '@/components/FloatInput.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store';
import { firstCharToUp } from '@/helpers/common';
import { getCurrencyOptions } from '@/helpers/currencies';
import { NATIVE_PARACHAINS, RELAY_CHAINS } from '@/consts/networks';
import { getCostOfAssets, getTransactionAddress } from '@/controllers/transferHelpers';
import { RequestCheckTransfer, TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { NetworkJsonOld } from '@/extension/background/extension-base/src/types';
import { checkTransfer } from '@/extension/messaging';

@Component({
  components: {
    MaxButton,
    FloatInput,
    RotateInput,
    AmountInputs,
    ExistentialPopup,
    WarningAddressPopup,
    ConfirmationPasswordPopup,
  },
})
export default class SendForm extends Vue {
  showSelectedAssetPopup = false;
  showSelectNetworkPopup = false;
  showDestNetPopup = false;
  isValidCountAssets = true;
  showExistentialPopup = false;
  showConfirmationPasswordPopup = false;
  filterValue = '';
  step = 1;

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) header!: string;
  @Prop(String) extrinsicType!: 'transfer' | 'teleport';
  @PropSync('recipient', { default: '' }) syncedRecipient!: string;
  @PropSync('selectedAssetId', { type: String }) syncedSelectedAssetId!: string;
  @PropSync('selectedNetwork', { type: String }) syncedSelectedNetwork!: string;
  @PropSync('destinationNetwork', { type: String, default: '' }) syncedDestNet!: string;
  @PropSync('amount', { type: String }) syncedAmount!: string;
  @PropSync('value', { type: String }) syncedValue!: string;
  @PropSync('partialFee', { type: String }) syncedPartialFee!: string;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Getter(AccountsGettersTypes.getBalances) currencies!: TokenBalance[];
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.getNetworks) getNetworks!: NetworkJsonOld[];

  get firstIcon() {
    return this.extrinsicType === 'transfer' ? this.syncedSelectedAssetId : this.syncedSelectedNetwork;
  }

  get placeholderSelectPopup() {
    return this.showSelectedAssetPopup ? 'common.searchAmongAssets' : 'common.searchNetwork';
  }

  get assetPrice() {
    if (this.currency?.assetId) return this.getAssetPrice(this.currency.assetId).price;

    return 0;
  }

  get placeholderNetwork() {
    return this.extrinsicType === 'transfer' ? 'assets.network' : 'assets.originNet';
  }

  get showSelectPopup() {
    return this.showSelectedAssetPopup || this.showSelectNetworkPopup || this.showDestNetPopup;
  }

  get showWarningAddressPopup() {
    if (!this.isValidRecipientAddress || this.syncedSelectedNetwork === '') return false;

    return !BaseApi.validateAddressByNetwork(this.syncedRecipient, this.syncedSelectedNetwork);
  }

  get top() {
    if (this.showSelectedAssetPopup) return 227;

    if (this.showSelectNetworkPopup) return 305;

    return 24;
  }

  get left() {
    return this.showSelectedAssetPopup || this.showSelectNetworkPopup ? -160 : 160;
  }

  get selectPopupValue() {
    if (this.showSelectedAssetPopup) return this.syncedSelectedAssetId;

    if (this.showSelectNetworkPopup) return this.syncedSelectedNetwork;

    return this.syncedDestNet;
  }

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
    if (!this.isOnline) return 'common.offlineStatus';

    if (!this.currency) return '';

    if (this.step === 2)
      return this.extrinsicType === 'transfer' ? 'assets.sendButtonText' : 'assets.teleportButtonText';

    if (this.extrinsicType === 'transfer' && this.syncedRecipient !== '' && !this.isValidRecipientAddress) {
      if (this.isSameAddress) return 'assets.isSameAddress';

      return 'assets.incorrectAddress';
    } else if (this.extrinsicType === 'teleport' && this.syncedDestNet !== '' && !this.isValidDirection)
      return 'assets.impossibleTeleport';

    if (!this.isValidCountAssets)
      return { text: 'assets.insufficientBalance', localeProps: { asset: this.selectedAssetUpper } };

    return 'common.continue';
  }

  get buttonDisabled() {
    if (!this.isOnline) return true;

    if (this.step === 2) return false;

    return !this.isAllFieldsCorrect || +this.syncedAmount === 0 || this.syncedPartialFee === '';
  }

  get isAllFieldsCorrect() {
    if (!this.currency) return false;

    const isValidMainFields =
      !!this.syncedSelectedAssetId && !!this.syncedSelectedNetwork && !!this.syncedAmount && this.isValidCountAssets;

    return isValidMainFields && (this.isValidRecipientAddress || !!this.syncedDestNet);
  }

  get isSameAddress() {
    return BaseApi.isSameAddress(this.selectedWallet, this.syncedRecipient, this.syncedSelectedNetwork);
  }

  get isValidRecipientAddress() {
    if (this.syncedRecipient === '') return false;

    return !this.isSameAddress && BaseApi.validateAddress(this.syncedRecipient, this.syncedSelectedNetwork);
  }

  get currency() {
    return this.currencies.find(
      ({ name, assetId: id }) => name === this.syncedSelectedAssetId || id === this.syncedSelectedAssetId
    );
  }

  get options() {
    const filter = this.filterValue.trim().toLowerCase();
    let options: { name: string; value: string; icon: string | undefined }[] = [];

    if (this.showSelectedAssetPopup) options = this.optionsCurrency;
    else if (this.showSelectNetworkPopup) options = this.optionsNetworks;
    else if (this.showDestNetPopup) options = this.optionsDestNet;

    return options.filter(({ name }) => name.toLowerCase().includes(filter));
  }

  get optionsNetworks() {
    const walletBalance = this.currency?.balances ?? [];

    return walletBalance.map(({ name, icon }) => {
      return {
        name: firstCharToUp(name),
        value: name,
        icon,
      };
    });
  }

  get optionsDestNet() {
    return this.optionsNetworks.filter(({ value }) => value !== this.syncedSelectedNetwork);
  }

  get transferrableAmount() {
    const count = +(
      this.currency?.balances.find((network) => network.name.toLowerCase() === this.syncedSelectedNetwork.toLowerCase())
        ?.total ?? 0
    );

    return count;
  }

  get transferrableValue() {
    const cost = getCostOfAssets(this.transferrableAmount, this.assetPrice) ?? 0;

    return this.$n(cost, 'price');
  }

  get selectedAssetUpper() {
    return this.currency!.name.toUpperCase();
  }

  get optionsCurrency() {
    return getCurrencyOptions(this.currencies);
  }

  @Watch('showSelectedAssetPopup')
  resetAssetPopupVisible(newValue: string) {
    if (newValue) {
      this.showSelectNetworkPopup = false;
      this.showDestNetPopup = false;
      this.filterValue = '';
    }
  }

  @Watch('showSelectNetworkPopup')
  resetOriginPopupVisible(newValue: string) {
    if (newValue) {
      this.showSelectedAssetPopup = false;
      this.showDestNetPopup = false;
      this.filterValue = '';
    }
  }

  @Watch('showDestNetPopup')
  resetDestPopupVisible(newValue: string) {
    if (newValue) {
      this.showSelectedAssetPopup = false;
      this.showSelectNetworkPopup = false;
      this.filterValue = '';
    }
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
  @Watch('syncedRecipient')
  @Watch('syncedAmount')
  async createTransfer() {
    this.syncedPartialFee = '';

    if (
      this.extrinsicType === 'transfer' &&
      (!this.isValidRecipientAddress || this.syncedSelectedNetwork === '')
      // ||  (this.extrinsicType === 'teleport' && (!this.isValidDirection || this.syncedSelectedNetwork === ''))
    ) {
      return;
    }

    const checkResponse = await this.verifyTransfer();
    this.syncedPartialFee = checkResponse.estimateFee ?? '0';
    // this.isValidCountAssets = this.currency!.validateCountAssets(
    //   this.syncedAmount,
    //   partialFee,
    //   this.syncedSelectedNetwork,
    //   this.selectedWallet
    // );
  }

  mounted() {
    this.$nextTick(() => {
      const index = this.optionsNetworks?.findIndex(({ value }) => value === this.syncedSelectedNetwork);

      if (index === -1) this.syncedSelectedNetwork = this.optionsNetworks?.[0]?.value ?? '';
    });
  }

  toggleSelectPopupVisible(isAsset: boolean, isOriginNet: boolean, isDestNet: boolean) {
    if (isAsset) {
      this.showSelectedAssetPopup = !this.showSelectedAssetPopup;
    }

    if (isOriginNet) {
      this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
    }

    if (this.extrinsicType === 'teleport' && isDestNet) {
      this.showDestNetPopup = !this.showDestNetPopup;
    }
  }

  toggleSelectedNetwork(value: string) {
    if (this.showSelectedAssetPopup) {
      this.syncedSelectedAssetId = value.toLowerCase();

      this.toggleSelectPopupVisible(true, false, false);

      return;
    }

    if (this.showSelectNetworkPopup) {
      this.syncedSelectedNetwork = value;

      this.toggleSelectPopupVisible(false, true, false);

      return;
    }

    this.syncedDestNet = value;

    this.toggleSelectPopupVisible(false, false, true);
  }

  async createTransferAndGetFee(amount?: string) {
    if (this.extrinsicType === 'transfer') {
      if (!this.isValidRecipientAddress || this.syncedSelectedNetwork === '') return '0';

      // this.currency!.createTransferExtrinsic(
      //   this.selectedWallet,
      //   this.syncedRecipient,
      //   amount ?? this.syncedAmount,
      //   this.syncedSelectedNetwork
      // );
    } else {
      if (!this.isValidDirection || this.syncedSelectedNetwork === '') return '0';

      // this.currency!.createTeleportExtrinsic(
      //   this.selectedWallet,
      //   this.syncedSelectedNetwork,
      //   this.syncedDestNet,
      //   amount ?? this.syncedAmount
      // );
    }

    // return this.currency!.extrinsicOptions.fee!;
  }

  updateAmount(value: string) {
    this.syncedAmount = value;
  }

  updateValue(value: string) {
    this.syncedValue = value;
  }

  handlerFilter(value: string) {
    this.filterValue = value;
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

    // const maxTransferableCountAssets = this.currency?.getTransferableCountAssets(
    //   this.selectedWallet,
    //   this.syncedSelectedNetwork
    // );
    // const partialFee = await this.createTransferAndGetFee(maxTransferableCountAssets);
    // const transferableCountAssets = this.currency
    //   .getTransferableCountAssetsMinusFee(partialFee, this.syncedSelectedNetwork, this.selectedWallet)
    //   .toString();

    // this.syncedAmount = transferableCountAssets;
    // this.syncedValue = getCostOfAssets(transferableCountAssets, this.assetPrice).toString();
  }
  get transactionAddress() {
    return getTransactionAddress(this.selectedWallet, this.syncedSelectedNetwork);
  }

  get tx(): RequestCheckTransfer {
    return {
      networkKey: this.syncedSelectedNetwork,
      from: this.transactionAddress,
      to: this.syncedRecipient,
      relayChain: this.currency?.relayChain,
      value: this.syncedAmount,
      transferAll: false,
      token: this.syncedSelectedAssetId,
    };
  }

  verifyTransfer() {
    return checkTransfer({
      networkKey: this.syncedSelectedNetwork,
      from: this.syncedRecipient,
      to: this.syncedRecipient,
      relayChain: this.currency?.relayChain,
      value: this.syncedAmount,
      transferAll: false,
      token: this.syncedSelectedAssetId,
    });
  }

  async handlerContinueButton(skipWarning = false) {
    if (!skipWarning && this.step === 1) {
      const checkResponse = await this.verifyTransfer();

      if (checkResponse.errors?.length) {
        this.showExistentialPopup = checkResponse.errors.some((error) => error.code === 'notEnoughExistentialDeposit');
        this.syncedPartialFee = checkResponse.estimateFee || '0';
      }

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

  handlerCloseSelectPopup() {
    this.toggleSelectPopupVisible(this.showSelectedAssetPopup, this.showSelectNetworkPopup, this.showDestNetPopup);
  }

  handlerCloseWarningAddressPopup() {
    const network = this.getNetworks.find(({ name }) => BaseApi.validateAddressByNetwork(this.syncedRecipient, name));

    this.syncedSelectedAssetId = network?.assets[0].assetId ?? ''; // [0] - is utility asset

    // nextTick needed to work after @Watch
    this.$nextTick(() => {
      this.syncedSelectedNetwork = network?.name ?? '';
    });
  }

  handlerAcceptWarningAddress() {
    this.syncedRecipient = BaseApi.formatAddress(
      {
        address: this.syncedRecipient,
        ethereumAddress: this.syncedRecipient,
      },
      this.syncedSelectedNetwork
    );
  }
}
</script>

<style lang="scss">
.transfer-form {
  .row {
    margin-top: 10px;

    &:first-child {
      margin-top: 0;
    }
  }
}
</style>

<style lang="scss" scoped>
.transfer-select-popup {
  z-index: 300 !important;
  text-transform: capitalize;
}

.transfer-form {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .transferable {
    display: flex;
    justify-content: space-between;

    .transferable-part {
      width: 235px;

      .transferable-label {
        font-size: 14px;
        color: $default-white;
        text-align: left;
      }

      .transferable-descriptions {
        display: flex;
        line-height: 25px;
      }

      .transferable-amount {
        font-weight: 600;
        font-size: 16px;
        color: $pink-lavender-color;
      }

      .transferable-assets {
        margin-left: 5px;
        color: rgba(255, 255, 255, 0.9);
      }
    }
  }

  .s-icon-arrows-arrow-right-24 {
    color: $default-white;
    font-size: 30px !important;
  }

  .summary {
    padding: 16px;
    background-color: $secondary-background-color !important;
    border: 1px solid $default-background-color !important;
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
        color: $gray-color;
      }

      .column {
        display: flex;
        flex-direction: column;
        align-items: flex-end;

        .value {
          color: $default-white;
          font-weight: 300;
          font-size: 12px;
          margin-top: 3px;
        }
      }
    }
  }
}
</style>
