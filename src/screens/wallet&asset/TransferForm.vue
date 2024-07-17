<template>
  <div>
    <AboveForm
      :header="formHeader"
      :fullScreen="true"
      :showBackIcon="showBackIcon"
      @handlerBack="handlerBack"
      @closeHandler="$emit('closeForm')"
    >
      <Scroll>
        <EditAddressBook
          v-if="showEditAddressBook"
          :network="targetNetwork"
          :_address="newAddress"
          @setAddress="setAddress"
        />

        <HistoryBook
          v-else-if="showHistoryBook"
          :network="targetNetwork"
          :assetId="syncedAssetId"
          @toggleHistoryBookVisibility="toggleHistoryBookVisibility"
          @setRecipient="setRecipient"
          @setAddress="setAddress"
        />

        <div v-else-if="showMyWallets">
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
                :value="syncedNetwork"
                class="row"
                icon="rotate"
                :placeholder="placeholderNetwork"
                :isActiveRotate="showSelectNetworkPopup"
                data-testid="transferNetwork"
                @click="toggleValue('showSelectNetworkPopup')"
              />

              <FInput
                v-else
                :value="syncedNetwork"
                class="row"
                size="big"
                :placeholder="placeholderNetwork"
                :readonly="true"
                data-testid="network"
              />

              <SelectInput
                class="row"
                text="assets.amount"
                :totalAmount="transferableAmount"
                :value="syncedValue"
                :asset="sendAssetName"
                :assetId="syncedAssetId"
                :amount="syncedAmount"
                :isRotate="showSelectedAssetPopup"
                @update:amount="updateAmount"
                @setMax="setMax"
                @togglePopupVisibility="toggleValue('showSelectedAssetPopup')"
              />

              <InputWithIcon
                v-if="isCrossChain"
                :value="syncedDestNet"
                class="row"
                icon="rotate"
                placeholder="assets.destNet"
                data-testid="destNet"
                :isActiveRotate="showDestNetPopup"
                @click="toggleValue('showDestNetPopup')"
              />

              <InputWithIcon
                :value="recipientCut"
                class="row"
                icon="close"
                placeholder="assets.sendTo"
                data-testid="sendToInput"
                @click="setRecipient"
              />

              <div class="activity-buttons row">
                <BadgeButton text="assets.history" data-testid="historyBtn" @click="toggleHistoryBookVisibility" />

                <BadgeButton text="common.paste" data-testid="pasteBtn" @click="paste" />

                <BadgeButton
                  v-if="showMyWalletsButton"
                  text="assets.myWallets"
                  data-testid="myWalletsBtn"
                  @click="toggleMyWalletsVisibility"
                />
              </div>

              <Alert v-if="isScamAddress" :message="scamMessage" headerText="common.warning" />

              <slot name="step1Warning"></slot>

              <InfoRow
                :text="`assets.${isTransfer ? 'networkFee' : 'originalNetworkFee'}`"
                :value="syncedFeeCut"
                :price="fiatFeeCut"
                :iconClasses="['origin-fee']"
                :isLoading="isFetchingFees"
                icon="info"
              />

              <InfoRow
                v-if="isCrossChain"
                text="assets.crossChainFee"
                :value="destNetFeeCut"
                :price="destNetFiatFeeCut"
                :iconClasses="['cross-chain-fee']"
                icon="info"
              />

              <Tooltip text="assets.feeDescription" target=".origin-fee" placement="right" />
              <Tooltip text="assets.feeDescription" target=".cross-chain-fee" placement="right" />
            </template>

            <slot name="step2" v-else-if="step === 2"></slot>
          </div>

          <FButton
            size="big"
            class="button"
            :disabled="buttonDisabled"
            :iconName="isFetchingFees ? 'loader' : ''"
            :iconType="isFetchingFees ? 'loading' : ''"
            :text="isFetchingFees ? '' : buttonText"
            data-testid="continueBtn"
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
      @handlerFilter="handlerFilter"
      @toggleValue="toggleSelectedNetwork"
      @handlerClose="handlerCloseSelectPopup"
    />

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="currency"
      :amount="syncedAmount"
      :value="syncedValue"
      :firstIcon="firstIcon"
      :secondIcon="syncedDestNet"
      :extrinsicType="extrinsicType"
      :tx="tx"
      @close="confirmationPasswordPopupClose"
    />

    <ExistentialPopup
      v-if="showExistentialPopup"
      @handlerClose="handlerCloseExistentialPopup"
      @handlerAccept="handlerAcceptExistentialPopup"
    />

    <WarningAddressPopup
      v-if="!isValidAddressByNetwork"
      @handlerAccept="formatAddress"
      @handlerClose="handlerCloseWarningAddressPopup"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch, PropSync } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { FPNumber } from '@sora-substrate/util';
import { getMoonbeamMoonriverAssetName, getNativeAssetName } from '@extension-base/background/utils/utils';
import {
  type RequestCheckTransfer,
  type RequestCheckCrossChain,
  type TokenGroup,
  type AccountJson,
  type ResponseCheckTransfer,
  type ResponseCheckCrossChain,
  TransferErrorCode,
} from '@extension-base/background/types/types';
import { Reasons, type ScamInfo } from '@extension-base/services/scam-service/types';
import ConfirmationPasswordPopup from './ConfirmationPasswordPopup.vue';
import ExistentialPopup from './ExistentialPopup.vue';
import WarningAddressPopup from './WarningAddressPopup.vue';
import type { NetworkJson } from '@extension-base/types';
import type { GetAssetPrice, GetNetwork, SelectedWallet } from '@/store';
import EditAddressBook from '@/screens/wallet&asset/EditAddressBook.vue';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import {
  getCurrencyOptions,
  calcTransferableSendMinusFee,
  isValidAmountAsset,
  getUtilityAsset,
} from '@/helpers/currencies';
import { cut, getClipboard } from '@/helpers';
import {
  VALID_SUBSTRATE_ADDRESS,
  VALID_ETHEREUM_ADDRESS,
  CHAIN_IDS,
  POPULAR_NETWORKS,
  FAVORITE_NETWORKS,
} from '@/consts/networks';
import { getCostOfAssets, getTransactionAddress } from '@/controllers/transferHelpers';
import { checkTransfer, checkCrossChain, checkScamAddress } from '@/extension/messaging';
import WalletInfo from '@/screens/main/WalletInfo.vue';
import { isNetworkGroup } from '@/helpers/common';

@Component({
  components: {
    WalletInfo,
    HistoryBook,
    EditAddressBook,
    ExistentialPopup,
    WarningAddressPopup,
    ConfirmationPasswordPopup,
  },
})
export default class TransferForm extends Vue {
  readonly isPopup = BaseApi.useIsPopup();

  timeoutSubscription: NodeJS.Timeout | undefined;
  timeoutSetMax: NodeJS.Timeout | undefined;
  showSelectedAssetPopup = false;
  showSelectNetworkPopup = false;
  showDestNetPopup = false;
  showExistentialPopup = false;
  showConfirmationPasswordPopup = false;
  showMyWallets = false;
  showHistoryBook = false;
  newAddress = '';
  filterValue = '';
  isFetchingFees = false;
  estimateFeeError = false;
  isScamAddress = false;
  scamInfo: Nullable<ScamInfo> = null;
  step = 1;

  @Prop(String) header!: string;
  @Prop(String) extrinsicType!: 'transfer' | 'crossChain';
  @Prop({ default: false }) isDisableBtn!: boolean;
  @PropSync('recipient', { default: '' }) syncedRecipient!: string;
  @PropSync('assetId', { type: String }) syncedAssetId!: string;
  @PropSync('selectedNetwork', { type: String }) syncedNetwork!: string;
  @PropSync('destinationNetwork', { type: String, default: '' }) syncedDestNet!: string;
  @PropSync('amount', { type: String }) syncedAmount!: string;
  @PropSync('value', { type: String }) syncedValue!: string;
  @PropSync('partialFee', { type: String }) syncedFee!: string;
  @PropSync('destNetFee', { type: String, default: '0' }) syncedDestNetFee!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.selectedNetwork) selectedNetworkInManagement!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get scamMessage() {
    const key =
      this.scamInfo?.reason === Reasons.Donation
        ? 'isDonationAddress'
        : this.scamInfo?.reason === Reasons.Exchange
        ? 'isExchangeAddress'
        : this.scamInfo?.reason === Reasons.Sanctions
        ? 'isSanctionsAddress'
        : 'isScamAddress';

    return {
      text: `assets.${key}`,
      localeProps: { asset: this.sendAssetName.toUpperCase() },
    };
  }

  get recipientCut() {
    return cut(this.syncedRecipient);
  }

  get showEditAddressBook() {
    return this.newAddress !== '';
  }

  get filteredWallets() {
    if (this.isCrossChain) return this.wallets;

    return this.wallets.filter(({ active }) => !active);
  }

  get formHeader() {
    if (this.showHistoryBook) return 'assets.chooseFromHistory';

    if (this.showMyWallets) return 'assets.wallets';

    if (this.showEditAddressBook) return 'assets.addContact';

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

  get originalUtilityId() {
    return this.originNet?.assets[0].id ?? ''; // [0] - is utility asset
  }

  get originalNetworkUtilityAsset() {
    const currency = this.balances.find(({ balances }) => balances.some(({ id }) => id === this.originalUtilityId));

    return currency?.symbol ?? '';
  }

  get originalAssetPrice() {
    const currency = this.balances.find(({ balances }) => balances.some(({ id }) => id === this.originalUtilityId));
    const priceId = currency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get syncedFeeCut() {
    return `${this.$n(+this.syncedFee, 'decimalPrecise')} ${this.originalNetworkUtilityAsset.toUpperCase()}`;
  }

  get fiatFeeCut() {
    return `${this.fiatSymbol}${this.$n(+this.syncedFee * this.originalAssetPrice, 'price')}`;
  }

  get destNetFeeCut() {
    return `${this.$n(+this.syncedDestNetFee, 'decimalPrecise')} ${this.sendAssetName?.toUpperCase()}`;
  }

  get destNetFiatFeeCut() {
    return `${this.fiatSymbol}${this.$n(+this.syncedDestNetFee * this.assetPrice, 'price')}`;
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

  get isValidAddressByNetwork() {
    if (!this.isValidRecipientAddress || this.syncedNetwork === '') return true;

    return BaseApi.validateAddressByNetwork(this.syncedRecipient, this.targetNetwork);
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
    return this.step === 2 || this.showHistoryBook || this.showMyWallets || this.showEditAddressBook;
  }

  get buttonText() {
    if (!navigator.onLine) return 'common.offlineStatus';

    if (!this.currency) return '';

    if (this.step === 2) {
      if (this.isTransfer) return 'assets.sendButtonText';

      return 'common.confirm';
    }

    if (this.estimateFeeError) return 'estimateFeeError';

    if (this.isSameAddress) return 'assets.isSameAddress';

    if (!this.isValidRecipientAddress && this.syncedRecipient !== '') return 'assets.incorrectAddress';

    if (!this.isValidSendAsset)
      return { text: 'assets.insufficientBalance', localeProps: { asset: this.sendAssetName?.toUpperCase() } };

    if (!this.isValidTransferByUtility)
      return { text: 'assets.insufficientBalance', localeProps: { asset: this.utilityAssetName.toUpperCase() } };

    return 'common.continue';
  }

  get utilityAsset() {
    return getUtilityAsset(this.balances, this.syncedNetwork);
  }

  get utilityAssetName() {
    return this.utilityAsset.symbol.toLowerCase();
  }

  get buttonDisabled() {
    if (this.isDisableBtn) return true;

    if (this.isFetchingFees || this.estimateFeeError) return true;

    if (!navigator.onLine) return true;

    if (this.step === 2) return false;

    return !this.isAllFieldsCorrect || +this.syncedAmount === 0 || this.syncedFee === '';
  }

  get isAllFieldsCorrect() {
    if (!this.currency) return false;

    return (
      !!this.syncedAssetId &&
      !!this.syncedNetwork &&
      !!this.syncedAmount &&
      this.isValidSendAsset &&
      this.isValidTransferByUtility &&
      this.isValidRecipientAddress
    );
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
    return this.balances?.find(({ balances }) =>
      balances.some((el) => el.id.toLowerCase() === this.syncedAssetId.toLowerCase())
    );
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

  get isSelectedNetworkGroup() {
    return isNetworkGroup(this.selectedNetworkInManagement);
  }

  get assetWithActiveNetworks() {
    const result = this.balances.filter(({ balances }) => {
      const prepBalances = balances ?? [];

      return prepBalances.some(({ name }) => {
        const { active, rank, favorite } = this.getNetwork(name);

        if (!active) return false;

        if (this.isSelectedNetworkGroup) {
          if (this.selectedNetworkInManagement === POPULAR_NETWORKS && rank) return true;

          const isNetworkInFavorites = favorite.some((el) => el === this.selectedWallet.address);

          if (this.selectedNetworkInManagement === FAVORITE_NETWORKS && isNetworkInFavorites) return true;
        }

        return this.selectedNetworkInManagement.toLowerCase() === name.toLowerCase();
      });
    });

    return result;
  }

  get optionsCurrency() {
    const { xcm, parentId } = this.networks.find(
      ({ name }) => name.toLowerCase() === this.syncedNetwork.toLowerCase()
    )!;
    const relay = (CHAIN_IDS[parentId!] ?? this.syncedNetwork).toLowerCase();
    const balances = this.isTransfer
      ? this.balances
      : this.balances.filter(
          ({ symbol, relayChain }) =>
            xcm?.availableAssets.some(({ symbol: _symbol }) => {
              const assetName = getMoonbeamMoonriverAssetName(_symbol, this.syncedNetwork);

              return assetName === symbol.toLowerCase();
            }) && relayChain.toLowerCase() === relay
        );

    return getCurrencyOptions(balances);
  }

  get optionsNetworks() {
    // used only for transfer
    const walletBalance = this.currency?.balances ?? [];

    return walletBalance.flatMap(({ name, icon }) => {
      const network = this.getNetwork(name);

      if (!network.active) return [];

      return [
        {
          name: network.name,
          value: network.name,
          icon,
        },
      ];
    });
  }

  get originNet() {
    return this.getNetwork(this.syncedNetwork);
  }

  get optionsDestNet() {
    // used only for crossChain
    if (this.isTransfer || !this.sendAssetName) return [];

    const asset = getNativeAssetName(this.sendAssetName);

    return this.originNet.xcm!.availableDestinations.flatMap(({ assets, chainId }) => {
      if (!assets.some(({ symbol }) => symbol.toLowerCase() === asset)) return [];

      const { name, icon } = this.getNetwork(chainId);

      return {
        name: name,
        value: name,
        icon,
      };
    });
  }

  get sendAssetName() {
    return this.currency?.symbol ?? '';
  }

  get isValidSendAsset() {
    return isValidAmountAsset(
      this.currency,
      this.syncedNetwork,
      this.syncedFee ?? '0',
      this.syncedAmount,
      this.isCrossChain, // проверяем ED для crossChain транзакций
      this.syncedDestNetFee ?? '0'
    );
  }

  get isValidTransferByUtility() {
    if (this.syncedFee === '') return false;

    // этот кейс проверяется в this.isValidSendAsset, когда sendAsset это utility asset для сети
    if (this.sendAssetName?.toLowerCase() === this.utilityAssetName) return true;

    const precision = this.currencyBalance?.precision;

    const ed = FPNumber.fromCodecValue(this.currencyBalance?.existentialDeposit ?? '0', precision).mul(
      new FPNumber(1.1, precision)
    );

    const checkValue = this.isCrossChain
      ? new FPNumber(this.syncedFee, precision).add(ed)
      : new FPNumber(this.syncedFee, precision);

    // проверяем, что utility balance достаточно на оплату fee и ED
    return FPNumber.gte(new FPNumber(this.calcTransferableUtility(), precision), checkValue);
  }

  get transactionAddress() {
    return getTransactionAddress(this.selectedWallet, this.syncedNetwork);
  }

  get tx() {
    const baseRequest = {
      to: this.syncedRecipient,
      from: this.transactionAddress,
      relayChain: this.currency?.relayChain,
      assetId: this.syncedAssetId,
      amount: this.syncedAmount,
    };

    if (this.isTransfer)
      return {
        ...baseRequest,
        networkKey: this.syncedNetwork,
      } as RequestCheckTransfer;

    return {
      ...baseRequest,
      originNet: this.syncedNetwork,
      destinationNet: this.syncedDestNet,
    } as RequestCheckCrossChain;
  }

  @Watch('syncedRecipient')
  async checkScam() {
    if (this.isValidRecipientAddress && this.isValidAddressByNetwork) {
      const { value, info } = await checkScamAddress({ address: this.syncedRecipient, network: this.targetNetwork });

      this.isScamAddress = value;
      this.scamInfo = info;
    } else {
      this.isScamAddress = false;
      this.scamInfo = null;
    }
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
    if (newValue.toLowerCase() === this.syncedDestNet.toLowerCase()) this.syncedDestNet = prevValue;
  }

  @Watch('syncedAssetId')
  updateSelectedNetwork() {
    this.syncedAmount = '';
    this.syncedDestNet = this.optionsDestNet?.[0]?.value ?? '';
    this.syncedValue = '';

    if (this.isTransfer) this.syncedNetwork = this.optionsNetworks?.[0]?.value ?? '';
  }

  @Watch('syncedDestNet')
  async clearRecipient() {
    this.$nextTick(() => {
      if (!this.isValidRecipientAddress) this.setRecipient();
    });
  }

  @Watch('syncedAssetId')
  @Watch('syncedNetwork')
  @Watch('syncedDestNet')
  @Watch('syncedRecipient')
  @Watch('syncedAmount')
  calculateFee() {
    if (!this.currency) return;

    clearTimeout(this.timeoutSubscription);

    this.timeoutSubscription = setTimeout(() => this.calculateEstimates(), 2000);
  }

  created() {
    this.calculateEstimates();
  }

  async calculateEstimates() {
    if (!this.currency) return;

    try {
      const { estimateFee, destEstimateFee, errors } = await this.verifyTx();

      if (errors) {
        errors.forEach((error) => {
          if (error.code === TransferErrorCode.TRANSFER_ERROR) this.estimateFeeError = true;
          else this.estimateFeeError = false;
        });
      }

      this.syncedFee = estimateFee ?? '';
      this.syncedDestNetFee = destEstimateFee ?? '';
    } catch (e) {
      this.syncedFee = '';
      this.syncedDestNetFee = '';
    }
  }

  toggleValue(value: 'showSelectedAssetPopup' | 'showSelectNetworkPopup' | 'showDestNetPopup') {
    this[value] = !this[value];
  }

  setRecipient(address = '') {
    this.syncedRecipient = BaseApi.formatAddress({ address, ethereumAddress: address }, this.targetNetwork);
  }

  toggleSelectedNetwork(value: string) {
    if (this.showSelectedAssetPopup) {
      this.syncedAssetId = value;

      this.toggleValue('showSelectedAssetPopup');
    } else if (this.showSelectNetworkPopup) {
      this.syncedNetwork = value;

      this.toggleValue('showSelectNetworkPopup');
    } else {
      this.syncedDestNet = value;

      this.toggleValue('showDestNetPopup');
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
    if (this.showHistoryBook) this.toggleHistoryBookVisibility();
    else if (this.showEditAddressBook) this.setAddress('', true);
    else if (this.showMyWallets) this.toggleMyWalletsVisibility();
    else this.step -= 1;
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) this.$emit('closeForm');
  }

  getStatusWallet(address: string, ethereumAddress: string) {
    const currentAddress = BaseApi.formatAddress({ address, ethereumAddress }, this.syncedNetwork);
    const currentRecipientAddress = BaseApi.formatAddress(
      { address: this.syncedRecipient, ethereumAddress: this.syncedRecipient },
      this.syncedNetwork
    );

    return currentAddress === currentRecipientAddress;
  }

  calcTransferableUtility() {
    const balance = this.utilityAsset.balances.find(
      ({ isUtility, name }) => isUtility && name.toLowerCase() === this.syncedNetwork.toLowerCase()
    )!;

    return balance?.transferable?.toString() ?? '0';
  }

  calcTransferableSendMinusFee(fee: string) {
    return calcTransferableSendMinusFee(
      this.currency,
      this.syncedNetwork,
      fee,
      this.isCrossChain, // проверяем ED для crossChain транзакций
      this.syncedDestNetFee
    );
  }

  async setMax() {
    if (!this.currency) return;

    const setMax = async () => {
      const { estimateFee } = await this.verifyTx(this.transferableAmount.toString());
      const transferable = this.calcTransferableSendMinusFee(estimateFee!);

      this.syncedAmount = transferable.toString();
      this.syncedValue = getCostOfAssets(transferable, this.assetPrice).toString();
    };

    if (this.syncedFee === '' || this.syncedFee === '0') {
      clearTimeout(this.timeoutSetMax);

      this.timeoutSetMax = setTimeout(setMax, 2000);
    } else setMax();
  }

  toggleLoading(value = true) {
    this.isFetchingFees = value;
  }

  async verifyTx(_amount?: string): Promise<ResponseCheckTransfer | ResponseCheckCrossChain> {
    this.toggleLoading();

    // комиссия не зависит от адреса получателя, поэтому подставляем всегда мок
    const to = BaseApi.formatAddress(
      { address: VALID_SUBSTRATE_ADDRESS, ethereumAddress: VALID_ETHEREUM_ADDRESS },
      this.targetNetwork
    );

    const amount = _amount ?? (this.syncedAmount !== '' && this.syncedAmount !== '0' ? this.syncedAmount : '1');

    if (this.isTransfer) {
      const ex = await checkTransfer({
        networkKey: this.syncedNetwork,
        from: this.transactionAddress,
        to,
        relayChain: this.currency?.relayChain,
        amount,
        assetId: this.syncedAssetId,
      });

      this.toggleLoading(false);

      return ex;
    }

    const ex = await checkCrossChain({
      originNet: this.syncedNetwork,
      destinationNet: this.syncedDestNet,
      from: this.transactionAddress,
      to,
      relayChain: this.currency?.relayChain,
      amount,
      assetId: this.syncedAssetId,
    });

    this.toggleLoading(false);

    return ex;
  }

  async handlerContinueButton() {
    if (this.step === 2) {
      this.showConfirmationPasswordPopup = true;

      return;
    }

    this.step += 1;
    this.showSelectedAssetPopup = false;
    this.showSelectNetworkPopup = false;
    this.showDestNetPopup = false;
  }

  handlerCloseExistentialPopup() {
    this.showExistentialPopup = false;
  }

  handlerAcceptExistentialPopup() {
    this.handlerContinueButton();
    this.handlerCloseExistentialPopup();
  }

  handlerCloseSelectPopup() {
    if (this.showSelectedAssetPopup) this.toggleValue('showSelectedAssetPopup');
    else if (this.showSelectNetworkPopup) this.toggleValue('showSelectNetworkPopup');
    else this.toggleValue('showDestNetPopup');
  }

  handlerCloseWarningAddressPopup() {
    this.syncedRecipient = '';
  }

  formatAddress() {
    this.syncedRecipient = BaseApi.formatAddress(
      {
        address: this.syncedRecipient,
        ethereumAddress: this.syncedRecipient,
      },
      this.targetNetwork
    );
  }

  paste() {
    this.syncedRecipient = getClipboard();
  }

  setWallet(address: string, ethereumAddress: string) {
    const network = this.isTransfer || this.syncedDestNet === '' ? this.syncedNetwork : this.syncedDestNet;

    this.syncedRecipient = BaseApi.formatAddress({ address, ethereumAddress }, network);

    this.toggleMyWalletsVisibility();
  }

  toggleMyWalletsVisibility() {
    this.showMyWallets = !this.showMyWallets;
  }

  toggleHistoryBookVisibility() {
    this.showHistoryBook = !this.showHistoryBook;
  }

  setAddress(address: string, showHistoryBook = false) {
    this.newAddress = address;
    this.showHistoryBook = showHistoryBook;
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

  .activity-buttons {
    display: flex;
    user-select: none;
    margin-bottom: 30px;
  }
}
</style>
