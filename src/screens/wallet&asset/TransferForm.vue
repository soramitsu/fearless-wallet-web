<template>
  <div>
    <AboveForm
      :header="formHeader"
      :fullScreen="true"
      :showBackIcon="showBackIcon"
      :handlerBack="handlerBack"
      :closeHandler="closeForm"
    >
      <Scroll>
        <div v-if="showMyWallets">
          <WalletInfo
            v-for="({ name, address, ethereumAddress, isMobile }, index) in filteredWallets"
            :key="name + index"
            :name="name"
            :isSelected="getStatusWallet(address, ethereumAddress)"
            :isMobile="isMobile"
            :address="address"
            :showMenu="false"
            class="wallet"
            @setWallet="setWallet(address, ethereumAddress)"
          />
        </div>

        <div v-else class="transfer-form">
          <div>
            <template v-if="step === 1">
              <InputWithIcon
                v-if="isTransfer"
                v-model="syncedNetwork"
                class="row"
                icon="rotate"
                :placeholder="placeholderNetwork"
                :isActiveRotate="showSelectNetworkPopup"
                @click="toggleNetworkPopupVisibility"
              />

              <Input
                v-else
                v-model="originNetwork"
                class="row"
                size="big"
                :placeholder="placeholderNetwork"
                :readonly="true"
              />

              <SelectInput
                class="row"
                text="assets.amount"
                :transferableAmount="transferableAmount"
                :value="syncedValue"
                :asset="sendAssetName"
                :assetId="syncedAssetId"
                :amount="syncedAmount"
                :isRotate="showSelectedAssetPopup"
                @update:amount="updateAmount"
                @setMax="setMax"
                @toggleSelectAssetPopupVisibility="toggleAssetPopupVisibility"
              />

              <InputWithIcon
                v-if="isCrossChain"
                v-model="syncedDestNet"
                class="row"
                icon="rotate"
                placeholder="assets.destNet"
                :isActiveRotate="showDestNetPopup"
                @click="toggleDestNetPopupVisibility"
              />

              <InputWithIcon
                v-model="syncedRecipient"
                class="row"
                icon="close"
                placeholder="assets.sendTo"
                :isActiveRotate="showDestNetPopup"
                @click="clearRecipient"
              />

              <div class="activity-buttons row">
                <button class="button" @click="openHistory">{{ $t('assets.history') }}</button>

                <button class="button" @click="paste">{{ $t('common.paste') }}</button>

                <button v-if="showMyWalletsButton" class="button" @click="toggleMyWalletsVisibility">
                  {{ $t('assets.myWallets') }}
                </button>
              </div>

              <InfoRow
                :text="`assets.${isTransfer ? 'networkFee' : 'originalNetworkFee'}`"
                :value="syncedFeeCut"
                class="original-network-fee"
              />

              <InfoRow v-if="isCrossChain" text="assets.crossChainFee" :value="destNetFeeCut" />
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
      </Scroll>
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
      :network="syncedNetwork"
      :firstIcon="firstIcon"
      :secondIcon="syncedDestNet"
      :extrinsicType="extrinsicType"
      :tx="tx"
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
import { FPNumber } from '@sora-substrate/util';
import ConfirmationPasswordPopup from './ConfirmationPasswordPopup.vue';
import MaxButton from './MaxButton.vue';
import ExistentialPopup from './ExistentialPopup.vue';
import WarningAddressPopup from './WarningAddressPopup.vue';
import InputWithIcon from './InputWithIcon.vue';
import type { GetAssetPrice } from '@/store';
import type { AccountJson } from '@/extension/background/extension-base/src/background/types/types';
import BaseApi from '@/util/BaseApi';
import FloatInput from '@/components/FloatInput.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store';
import { firstCharToUp } from '@/helpers/common';
import { getCurrencyOptions } from '@/helpers/currencies';
import { NATIVE_PARACHAINS, RELAY_CHAINS, VALID_SUBSTRATE_ADDRESS, VALID_ETHEREUM_ADDRESS } from '@/consts/networks';
import { getCostOfAssets, getTransactionAddress } from '@/controllers/transferHelpers';
import {
  RequestCheckTransfer,
  RequestCheckCrossChain,
  TokenBalance,
} from '@/extension/background/extension-base/src/background/types/types';
import { NetworkJsonOld } from '@/extension/background/extension-base/src/types';
import { checkTransfer, checkCrossChain } from '@/extension/messaging';
import WalletInfo from '@/screens/main/WalletInfo.vue';

@Component({
  components: {
    MaxButton,
    WalletInfo,
    FloatInput,
    InputWithIcon,
    ExistentialPopup,
    WarningAddressPopup,
    ConfirmationPasswordPopup,
  },
})
export default class SendForm extends Vue {
  readonly isPopup = BaseApi.useIsPopup();

  showSelectedAssetPopup = false;
  showSelectNetworkPopup = false;
  showDestNetPopup = false;
  showExistentialPopup = false;
  showConfirmationPasswordPopup = false;
  showMyWallets = false;
  filterValue = '';
  step = 1;

  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) header!: string;
  @Prop(String) extrinsicType!: 'transfer' | 'crossChain';
  @PropSync('recipient', { default: '' }) syncedRecipient!: string;
  @PropSync('assetId', { type: String }) syncedAssetId!: string;
  @PropSync('selectedNetwork', { type: String }) syncedNetwork!: string;
  @PropSync('destinationNetwork', { type: String, default: '' }) syncedDestNet!: string;
  @PropSync('amount', { type: String }) syncedAmount!: string;
  @PropSync('value', { type: String }) syncedValue!: string;
  @PropSync('partialFee', { type: String }) syncedFee!: string;
  @PropSync('destNetFee', { type: String }) syncedDestNetFee!: string;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJsonOld[];
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: (value: string) => NetworkJsonOld;

  get originNetwork() {
    return firstCharToUp(this.syncedNetwork);
  }

  get filteredWallets() {
    if (this.isCrossChain) return this.wallets;

    return this.wallets.filter(({ active }) => !active);
  }

  get formHeader() {
    if (this.showMyWallets) return 'assets.wallets';

    return this.header;
  }

  get showMyWalletsButton() {
    return this.filteredWallets.length !== 0;
  }

  get isTransfer() {
    return this.extrinsicType === 'transfer';
  }

  get isCrossChain() {
    return this.extrinsicType === 'crossChain';
  }

  get originalNetworkUtilityAsset() {
    const utilityId = this.originNet?.assets[0].assetId ?? ''; // [0] - is utility asset
    const currency = this.balances.find(({ balances }) => balances.some(({ id }) => id === utilityId));

    return currency?.name ?? '';
  }

  get syncedFeeCut() {
    return `${this.$n(+this.syncedFee, 'decimal')} ${this.originalNetworkUtilityAsset.toUpperCase()}`;
  }

  get destNetFeeCut() {
    return `${this.$n(+this.syncedDestNetFee, 'decimal')} ${this.sendAssetName.toUpperCase()}`;
  }

  get firstIcon() {
    return this.isTransfer ? this.syncedAssetId : this.syncedNetwork;
  }

  get placeholderSelectPopup() {
    return this.showSelectedAssetPopup ? 'common.searchAmongAssets' : 'common.searchNetwork';
  }

  get assetPrice() {
    const priceId = this.currency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get placeholderNetwork() {
    return this.isTransfer ? 'assets.network' : 'assets.originNet';
  }

  get showSelectPopup() {
    return this.showSelectedAssetPopup || this.showSelectNetworkPopup || this.showDestNetPopup;
  }

  get targetNetwork() {
    return this.isTransfer ? this.syncedNetwork : this.syncedDestNet;
  }

  get showWarningAddressPopup() {
    if (!this.isValidRecipientAddress || this.syncedNetwork === '') return false;

    return !BaseApi.validateAddressByNetwork(this.syncedRecipient, this.targetNetwork);
  }

  get top() {
    if (this.showSelectedAssetPopup) return 220;

    if (this.showSelectNetworkPopup) return 150;

    return this.isPopup ? 42 : 332;
  }

  get left() {
    if (this.showSelectedAssetPopup || (this.showDestNetPopup && this.isPopup)) return 160;

    return -160;
  }

  get selectPopupValue() {
    if (this.showSelectedAssetPopup) return this.syncedAssetId;

    if (this.showSelectNetworkPopup) return this.syncedNetwork;

    return this.syncedDestNet;
  }

  get showBackIcon() {
    return this.step === 2 || this.showMyWallets;
  }

  get isValidDirection() {
    // TODO: fix; from native parachains only to the relay chain
    if (NATIVE_PARACHAINS.includes(this.syncedNetwork) && !RELAY_CHAINS.includes(this.syncedDestNet)) return false;

    return !!this.currency && this.syncedNetwork !== '' && this.syncedDestNet !== '';
  }

  get buttonText() {
    if (!this.isOnline) return 'common.offlineStatus';

    if (!this.currency) return '';

    if (this.step === 2) {
      if (this.isTransfer) return 'assets.sendButtonText';

      return 'common.confirm';
    }

    if (this.isTransfer && this.syncedRecipient !== '' && !this.isValidRecipientAddress) {
      if (this.isSameAddress) return 'assets.isSameAddress';

      return 'assets.incorrectAddress';
    } else if (this.isCrossChain && this.syncedDestNet !== '' && !this.isValidDirection)
      return 'assets.impossibleCrossChain';

    if (!this.isValidSendAsset)
      return { text: 'assets.insufficientBalance', localeProps: { asset: this.sendAssetName.toUpperCase() } };

    return 'common.continue';
  }

  get buttonDisabled() {
    if (!this.isOnline) return true;

    if (this.step === 2) return false;

    return !this.isAllFieldsCorrect || +this.syncedAmount === 0 || this.syncedFee === '';
  }

  get isAllFieldsCorrect() {
    if (!this.currency) return false;

    const isValidMainFields =
      !!this.syncedAssetId && !!this.syncedNetwork && !!this.syncedAmount && this.isValidSendAsset;

    return isValidMainFields && (this.isValidRecipientAddress || !!this.syncedDestNet);
  }

  get isSameAddress() {
    // для CrossChain транзакций эта проверка не нужна, поэтому всегда возвращаем false
    if (this.isCrossChain) return false;

    return BaseApi.isSameAddress(this.selectedWallet, this.syncedRecipient, this.syncedNetwork);
  }

  get isValidRecipientAddress() {
    if (this.syncedRecipient === '') return false;

    if (this.isSameAddress) return false;

    if (this.isCrossChain && this.syncedDestNet === '') return false;

    return BaseApi.validateAddress(this.syncedRecipient, this.targetNetwork);
  }

  get currency() {
    return this.balances.find(({ name, assetId }) => name === this.syncedAssetId || assetId === this.syncedAssetId);
  }

  get currencyBalance() {
    return this.currency?.balances.find(({ name }) => name.toLowerCase() === this.syncedNetwork.toLowerCase());
  }

  get transferableAmount() {
    return +(this.currencyBalance?.transferable ?? 0);
  }

  get options() {
    const filter = this.filterValue.trim().toLowerCase();
    let options: { name: string; value: string; icon: string | undefined }[] = [];

    if (this.showSelectedAssetPopup) options = this.optionsCurrency;
    else if (this.showSelectNetworkPopup) options = this.optionsNetworks;
    else if (this.showDestNetPopup) options = this.optionsDestNet;

    return options.filter(({ name }) => name.toLowerCase().includes(filter));
  }

  get optionsCurrency() {
    const { xcm } = this.networks.find(({ name }) => name.toLowerCase() === this.syncedNetwork.toLowerCase())!;
    const balances = this.isTransfer
      ? this.balances
      : this.balances.filter(({ name }) =>
          xcm?.availableAssets.some((assetName) => assetName.toLowerCase() === name.toLowerCase())
        );

    return getCurrencyOptions(balances);
  }

  get optionsNetworks() {
    // used only for transfer
    const walletBalance = this.currency?.balances ?? [];

    return walletBalance.map(({ name, icon }) => {
      return {
        name: firstCharToUp(name),
        value: name,
        icon,
      };
    });
  }

  get originNet() {
    return this.networks.find(({ name }) => name.toLowerCase() === this.syncedNetwork.toLowerCase())!;
  }

  get optionsDestNet() {
    // used only for crossChain
    return this.originNet
      .xcm!.availableDestinations.filter(({ assets }) =>
        assets.some((assetName) => assetName.toLowerCase() === this.sendAssetName.toLowerCase())
      )
      .map(({ chainId }) => {
        const { name, icon } = this.getNetwork(chainId);

        return {
          name: firstCharToUp(name),
          value: name,
          icon,
        };
      });
  }

  get sendAssetName() {
    return this.currency!.name;
  }

  get isValidSendAsset() {
    const maxSendFP = new FPNumber(this.calcTransferableSendMinusFee(this.syncedFee ?? '0'));

    // если количество токенов равно нулю, тотранзакция невалидна,
    // для xor количество токенов за вычетом комиссии
    if (FPNumber.isEqualTo(maxSendFP, FPNumber.ZERO)) return false;

    // если syncedAmount меньше или равен максимальному количеству токенов, то транзакция валидна
    return FPNumber.lte(new FPNumber(this.syncedAmount), maxSendFP);
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

  @Watch('syncedNetwork')
  resetDestNetwork(newValue: string, prevValue: string) {
    if (newValue === this.syncedDestNet) this.syncedDestNet = prevValue;
  }

  @Watch('syncedAssetId')
  updateSelectedNetwork() {
    this.syncedAmount = '';
    this.syncedDestNet = this.optionsDestNet?.[0]?.value ?? '';
    this.syncedValue = '';
  }

  @Watch('syncedAssetId')
  @Watch('syncedNetwork')
  @Watch('syncedDestNet')
  @Watch('syncedRecipient')
  @Watch('syncedAmount')
  async createTransfer() {
    this.syncedFee = '';

    if (
      (this.isTransfer && (!this.isValidRecipientAddress || this.syncedNetwork === '')) ||
      (this.isCrossChain && (!this.isValidDirection || this.syncedNetwork === ''))
    )
      return;

    const { estimateFee, destEstimateFee } = await this.verifyTx();

    this.syncedFee = estimateFee ?? '0';
    this.syncedDestNetFee = destEstimateFee ?? '0';
  }

  toggleAssetPopupVisibility() {
    this.showSelectedAssetPopup = !this.showSelectedAssetPopup;
  }

  toggleNetworkPopupVisibility() {
    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
  }

  toggleDestNetPopupVisibility() {
    this.showDestNetPopup = !this.showDestNetPopup;
  }

  clearRecipient() {
    this.syncedRecipient = '';
  }

  toggleSelectedNetwork(value: string) {
    if (this.showSelectedAssetPopup) {
      this.syncedAssetId = value.toLowerCase();

      this.toggleAssetPopupVisibility();
    } else if (this.showSelectNetworkPopup) {
      this.syncedNetwork = value;

      this.toggleNetworkPopupVisibility();
    } else {
      this.syncedDestNet = value;

      this.toggleDestNetPopupVisibility();
    }
  }

  updateAmount(amount: string) {
    const value = getCostOfAssets(+amount, this.assetPrice).toString() ?? '';

    this.syncedAmount = amount;
    this.syncedValue = value;
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }

  handlerBack() {
    if (this.showMyWallets) this.toggleMyWalletsVisibility();
    else this.step -= 1;
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) this.closeForm();
  }

  getStatusWallet(address: string, ethereumAddress: string) {
    const currentAddress = BaseApi.formatAddress({ address, ethereumAddress }, this.syncedNetwork);
    const currentRecipientAddress = BaseApi.formatAddress(
      { address: this.syncedRecipient, ethereumAddress: this.syncedRecipient },
      this.syncedNetwork
    );

    return currentAddress === currentRecipientAddress;
  }

  calcTransferableSendMinusFee(fee: string) {
    if (this.currency === undefined) return 0;

    // Для Utility ассета вычитаем комиссию, тк комиссия всегда списывается в Utility токене
    if (this.currencyBalance?.isUtility) {
      const result = new FPNumber(this.transferableAmount).sub(new FPNumber(fee));

      return FPNumber.lt(result, FPNumber.ZERO) ? 0 : result.toNumber();
    }

    return this.transferableAmount;
  }

  async setMax() {
    if (!this.currency) return;

    const { estimateFee } = await this.verifyTx(this.transferableAmount.toString(), true);

    const transferableCountAssets = this.calcTransferableSendMinusFee(estimateFee ?? '0');

    this.syncedAmount = transferableCountAssets.toString();
    this.syncedValue = getCostOfAssets(transferableCountAssets, this.assetPrice).toString();
  }

  get transactionAddress() {
    return getTransactionAddress(this.selectedWallet, this.syncedNetwork);
  }

  get tx() {
    if (this.isTransfer)
      return {
        networkKey: this.syncedNetwork,
        from: this.transactionAddress,
        to: this.syncedRecipient,
        relayChain: this.currency?.relayChain,
        value: this.syncedAmount,
        transferAll: false,
        tokenId: this.syncedAssetId,
      } as RequestCheckTransfer;

    return {
      originNet: this.syncedNetwork,
      destinationNet: this.syncedDestNet,
      amount: this.syncedAmount,
      from: this.transactionAddress,
      to: this.syncedRecipient,
      relayChain: this.currency?.relayChain,
      transferAll: false,
      tokenId: this.syncedAssetId,
    } as RequestCheckCrossChain;
  }

  verifyTx(amount?: string, isMockTo = false) {
    if (this.isTransfer) {
      const to = isMockTo
        ? BaseApi.formatAddress(
            { address: VALID_SUBSTRATE_ADDRESS, ethereumAddress: VALID_ETHEREUM_ADDRESS },
            this.syncedNetwork
          )
        : this.syncedRecipient;

      return checkTransfer({
        networkKey: this.syncedNetwork,
        from: this.transactionAddress,
        to,
        relayChain: this.currency?.relayChain,
        value: amount ?? this.syncedAmount,
        transferAll: false,
        tokenId: this.syncedAssetId,
      });
    }

    const to = BaseApi.formatAddress(
      { address: VALID_SUBSTRATE_ADDRESS, ethereumAddress: VALID_ETHEREUM_ADDRESS },
      this.syncedDestNet
    );

    return checkCrossChain({
      originNet: this.syncedNetwork,
      destinationNet: this.syncedDestNet,
      from: this.transactionAddress,
      to,
      relayChain: this.currency?.relayChain,
      amount: amount ?? this.syncedAmount,
      tokenId: this.syncedAssetId,
    });
  }

  async handlerContinueButton(skipWarning = false) {
    if (!skipWarning && this.step === 1) {
      const { errors, estimateFee, destEstimateFee } = await this.verifyTx();

      if (errors?.length) {
        this.showExistentialPopup = errors.some(({ code }) => code === 'notEnoughExistentialDeposit');
        this.syncedFee = estimateFee || '0';
        this.syncedDestNetFee = destEstimateFee || '0';
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
    if (this.showSelectedAssetPopup) this.toggleAssetPopupVisibility();
    else if (this.showSelectNetworkPopup) this.toggleNetworkPopupVisibility();
    else this.toggleDestNetPopupVisibility();
  }

  handlerCloseWarningAddressPopup() {
    const network = this.networks.find(({ name }) => BaseApi.validateAddressByNetwork(this.syncedRecipient, name));

    this.syncedAssetId = network?.assets[0].assetId ?? ''; // [0] - is utility asset

    // nextTick needed to work after @Watch
    this.$nextTick(() => {
      if (this.isTransfer) this.syncedNetwork = network?.name ?? '';
      else {
        this.syncedNetwork = this.syncedDestNet;
        this.syncedDestNet = network?.name ?? '';
      }
    });
  }

  handlerAcceptWarningAddress() {
    this.syncedRecipient = BaseApi.formatAddress(
      {
        address: this.syncedRecipient,
        ethereumAddress: this.syncedRecipient,
      },
      this.targetNetwork
    );
  }

  openHistory() {
    console.info('openHistory');
  }

  async paste() {
    this.syncedRecipient = await navigator.clipboard.readText();
  }

  setWallet(address: string, ethereumAddress: string) {
    const network = this.isTransfer || this.syncedDestNet === '' ? this.syncedNetwork : this.syncedDestNet;

    this.syncedRecipient = BaseApi.formatAddress({ address, ethereumAddress }, network);

    this.toggleMyWalletsVisibility();
  }

  toggleMyWalletsVisibility() {
    this.showMyWallets = !this.showMyWallets;
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

.wallet {
  margin-bottom: 12px !important;
}

.transfer-form {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .s-icon-arrows-arrow-right-24 {
    color: $default-white;
    font-size: 30px !important;
  }

  .balance {
    font-size: 22px;
    line-height: 28px;
    max-width: 245px;
  }

  .original-network-fee {
    margin-top: 30px;
  }

  .activity-buttons {
    display: flex;
    user-select: none;

    .button {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 5px 15px;
      height: 30px;
      background: $secondary-background-color;
      border-radius: 30px;
      font-weight: 700;
      font-size: 12px;
      text-transform: uppercase;
      color: $gray-color;
      margin: 5px 14px 0 0;
      border: none;
      cursor: pointer;

      &:hover {
        background: $default-background-color;
      }
    }
  }
}
</style>
