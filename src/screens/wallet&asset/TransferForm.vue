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
          @toggleEditBook="toggleEditBook"
        />

        <HistoryBook
          v-else-if="showHistoryBook"
          :network="targetNetwork"
          :assetId="syncedAssetId"
          @toggleHistoryBookVisibility="toggleHistoryBookVisibility"
          @setRecipient="setRecipient"
          @toggleEditBook="toggleEditBook"
        />

        <div v-else-if="showMyWallets">
          <WalletInfo
            v-for="(wallet, index) in acountsEcosystem"
            :key="wallet.name + index"
            :name="wallet.name"
            :isSelected="getStatusWallet(wallet)"
            :isMobile="wallet.isMobile"
            :address="wallet.address"
            :showMenu="false"
            class="wallet"
            @setWallet="setWallet(wallet)"
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
import { defineComponent } from 'vue';

import { FPNumber } from '@sora-substrate/util';
import { getNativeAssetName, getSubstrateEvmAssetName } from '@extension-base/background/handlers/utils';
import { TransferErrorCode } from '@extension-base/background/types/types';
import { Reasons } from '@extension-base/services/scam-service/types';
import ConfirmationPasswordPopup from './ConfirmationPasswordPopup.vue';
import ExistentialPopup from './ExistentialPopup.vue';
import WarningAddressPopup from './WarningAddressPopup.vue';
import type {
  AccountJson,
  RequestCheckTransfer,
  RequestCheckCrossChain,
} from '@extension-base/background/types/types';
import EditAddressBook from '@/screens/wallet&asset/EditAddressBook.vue';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import BaseApi from '@/util/BaseApi';
import {
  getCurrencyOptions,
  calcTransferableSendMinusFee,
  isValidAmountAsset,
  getUtilityAsset,
} from '@/helpers/currencies';
import { cut, getClipboard, isSameString, isTonNetwork } from '@/helpers';
import {
  VALID_SUBSTRATE_ADDRESS,
  VALID_ETHEREUM_ADDRESS,
  CHAIN_IDS,
  POPULAR_NETWORKS,
  FAVORITE_NETWORKS,
} from '@/consts/networks';
import {
  getCostOfAssets,
  getTransactionAddress,
  getTransferWalletRecipient,
  isTransferWalletRecipient,
} from '@/helpers/transfers';
import { getTransferErrorLocaleKey } from '@/helpers/transferErrors';
import { checkTransfer, checkCrossChain, checkScamAddress } from '@/extension/messaging';
import WalletInfo from '@/screens/main/WalletInfo.vue';
import { isNetworkGroup } from '@/helpers/common';
import { IS_POPUP } from '@/consts/globalClient';
import { IS_EXTENSION } from '@/consts/global';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const VALID_BITCOIN_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const VALID_BITCOIN_TESTNET_ADDRESS = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

export default defineComponent({ name: 'TransferForm',
  components: {
    WalletInfo,
    HistoryBook,
    EditAddressBook,
    ExistentialPopup,
    WarningAddressPopup,
    ConfirmationPasswordPopup,
  },
  props: {
    header: String,
    extrinsicType: String,
    isDisableBtn: { default: false },
    recipient: { default: '' },
    assetId: { type: String },
    selectedNetwork: { type: String },
    destinationNetwork: { type: String, default: '' },
    amount: { type: String },
    value: { type: String },
    partialFee: { type: String },
    destNetFee: { type: String, default: '0' },
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      timeoutSubscription: undefined as ReturnType<typeof setTimeout> | undefined,
      timeoutSetMax: undefined as ReturnType<typeof setTimeout> | undefined,
      showSelectedAssetPopup: false,
      showSelectNetworkPopup: false,
      showDestNetPopup: false,
      showExistentialPopup: false,
      showConfirmationPasswordPopup: false,
      showMyWallets: false,
      showHistoryBook: false,
      showEditAddressBook: false,
      newAddress: '',
      filterValue: '',
      isFetchingFees: false,
      estimateFeeError: false,
      estimateFeeErrorMessage: '',
      isScamAddress: false,
      scamInfo: null,
      step: 1,
    };
  },
  computed: {
    scamMessage() {
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
    },
    recipientCut() {
      return cut(this.syncedRecipient);
    },
    acountsEcosystem() {
      if (this.isCrossChain) return this.accountsStore.accounts;

          return this.accountsStore.acountsEcosystem;
    },
    formHeader() {
      if (this.showEditAddressBook) return 'assets.addContact';

          if (this.showHistoryBook) return 'assets.chooseFromHistory';

          if (this.showMyWallets) return 'assets.wallets';

          return this.header;
    },
    showMyWalletsButton() {
      return this.acountsEcosystem.length !== 0;
    },
    isTransfer() {
      return this.extrinsicType === 'transfer';
    },
    isCrossChain() {
      return this.extrinsicType === 'crossChain';
    },
    originalUtilityId() {
      return this.originNet?.assets[0].id ?? ''; // [0] - is utility asset
    },
    originalNetworkUtilityAsset() {
      const currency = this.accountsStore.balances.find(({ balances }) =>
            balances.some(({ id }) => id === this.originalUtilityId)
          );

          return currency?.symbol ?? '';
    },
    originalAssetPrice() {
      const currency = this.accountsStore.balances.find(({ balances }) =>
            balances.some(({ id }) => id === this.originalUtilityId)
          );
          const priceId = currency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    syncedFeeCut() {
      const text = this.isTonNetwork ? `< ` : '';

          return `${text}${this.$n(+this.syncedFee, 'decimalPrecise')} ${this.originalNetworkUtilityAsset.toUpperCase()}`;
    },
    fiatFeeCut() {
      return `${this.accountsStore.fiatSymbol}${this.$n(+this.syncedFee * this.originalAssetPrice, 'price')}`;
    },
    destNetFeeCut() {
      return `${this.$n(+this.syncedDestNetFee, 'decimalPrecise')} ${this.sendAssetName?.toUpperCase()}`;
    },
    destNetFiatFeeCut() {
      return `${this.accountsStore.fiatSymbol}${this.$n(+this.syncedDestNetFee * this.assetPrice, 'price')}`;
    },
    firstIcon() {
      return this.isTransfer ? this.syncedAssetId : this.syncedNetwork;
    },
    placeholderSelectPopup() {
      return this.showSelectedAssetPopup ? 'common.searchAmongAssets' : 'common.searchNetwork';
    },
    assetPrice() {
      const priceId = this.currency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    placeholderNetwork() {
      return this.isTransfer ? 'assets.network' : 'assets.originNet';
    },
    showSelectPopup() {
      return this.showSelectedAssetPopup || this.showSelectNetworkPopup || this.showDestNetPopup;
    },
    targetNetwork() {
      return this.isTransfer ? this.syncedNetwork : this.syncedDestNet;
    },
    isValidAddressByNetwork() {
      if (!this.isValidRecipientAddress || this.syncedNetwork === '') return true;

          return BaseApi.validateAddressByNetwork(this.syncedRecipient, this.targetNetwork);
    },
    top() {
      if (!IS_EXTENSION) return 120;

          if (this.showSelectedAssetPopup) return 220;

          if (this.showSelectNetworkPopup) return 150;

          return IS_POPUP ? 42 : 332;
    },
    left() {
      if (!IS_EXTENSION) return 0;

          if (this.showSelectedAssetPopup || (this.showDestNetPopup && IS_POPUP)) return 160;

          return -160;
    },
    selectPopupValue() {
      if (this.showSelectedAssetPopup) return this.syncedAssetId;

          if (this.showSelectNetworkPopup) return this.syncedNetwork;

          return this.syncedDestNet;
    },
    showBackIcon() {
      return this.step === 2 || this.showHistoryBook || this.showMyWallets || this.showEditAddressBook;
    },
    buttonText() {
      if (!navigator.onLine) return 'common.offlineStatus';

          if (!this.currency) return '';

          if (this.step === 2) {
            if (this.isTransfer) return 'assets.sendButtonText';

            return 'common.confirm';
          }

          if (this.estimateFeeError) return this.estimateFeeErrorMessage || 'estimateFeeError';

          if (this.isSameAddress) return 'assets.isSameAddress';

          if (!this.isValidRecipientAddress && this.syncedRecipient !== '') return 'assets.incorrectAddress';

          if (!this.isValidSendAsset)
            return { text: 'assets.insufficientBalance', localeProps: { asset: this.sendAssetName?.toUpperCase() } };

          if (!this.isValidTransferByUtility)
            return { text: 'assets.insufficientBalance', localeProps: { asset: this.utilityAssetName.toUpperCase() } };

          return 'common.continue';
    },
    utilityAsset() {
      return getUtilityAsset(this.accountsStore.balances, this.syncedNetwork);
    },
    utilityAssetName() {
      return this.utilityAsset.symbol.toLowerCase();
    },
    isTonNetwork() {
      return isTonNetwork(this.syncedNetwork);
    },
    buttonDisabled() {
      if (this.isDisableBtn) return true;

          if (this.isFetchingFees || this.estimateFeeError) return true;

          if (!navigator.onLine) return true;

          if (this.step === 2) return false;

          return !this.isAllFieldsCorrect || +this.syncedAmount === 0 || this.syncedFee === '';
    },
    isAllFieldsCorrect() {
      if (!this.currency) return false;

          return (
            !!this.syncedAssetId &&
            !!this.syncedNetwork &&
            !!this.syncedAmount &&
            this.isValidSendAsset &&
            this.isValidTransferByUtility &&
            this.isValidRecipientAddress
          );
    },
    isSameAddress() {
      if (this.isTonNetwork) return isSameString(this.accountsStore.selectedWallet.address, this.syncedRecipient);

          // для CrossChain транзакций эта проверка не нужна, поэтому всегда возвращаем false
          if (this.isCrossChain) return false;

          return BaseApi.isSameAddress(this.accountsStore.selectedWallet, this.syncedRecipient, this.syncedNetwork);
    },
    isValidRecipientAddress() {
      if (this.isSameAddress) return false;

          if (this.isTonNetwork) return true;

          if (this.syncedRecipient === '') return false;

          if (this.isCrossChain && this.syncedDestNet === '') return false;

          return BaseApi.validateAddress(this.syncedRecipient, this.targetNetwork);
    },
    currency() {
      return this.accountsStore.balances?.find(({ balances }) =>
            balances.some((el) => isSameString(el.id, this.syncedAssetId))
          );
    },
    currencyBalance() {
      return this.currency?.balances.find(({ name }) => isSameString(name, this.syncedNetwork));
    },
    transferableAmount() {
      return +(this.currencyBalance?.transferable ?? 0);
    },
    options() {
      const filter = this.filterValue.trim().toLowerCase();

          let options: { name: string; value: string; icon: string | undefined }[] = [];

          if (this.showSelectedAssetPopup) options = this.optionsAssets;
          else if (this.showSelectNetworkPopup) options = this.optionsNetworks;
          else if (this.showDestNetPopup) options = this.optionsDestNet;

          return options.filter(({ name }) => name.toLowerCase().includes(filter));
    },
    isSelectedNetworkGroup() {
      return isNetworkGroup(this.accountsStore.selectedNetwork);
    },
    assetWithActiveNetworks() {
      const result = this.accountsStore.balances.filter(({ balances }) => {
            const prepBalances = balances ?? [];

            return prepBalances.some(({ name }) => {
              const { active, rank, favorite } = this.networksStore.getNetwork(name);

              if (!active) return false;

              if (this.isSelectedNetworkGroup) {
                if (this.accountsStore.selectedNetwork === POPULAR_NETWORKS && rank) return true;

                const isNetworkInFavorites = favorite.some((el) => el === this.accountsStore.selectedWallet.address);

                if (this.accountsStore.selectedNetwork === FAVORITE_NETWORKS && isNetworkInFavorites) return true;
              }

              return isSameString(this.accountsStore.selectedNetwork, name);
            });
          });

          return result;
    },
    optionsAssets() {
      const { xcm, parentId } = this.networksStore.networks.find(
            ({ name }) => name.toLowerCase() === this.syncedNetwork.toLowerCase()
          )!;
          const relay = (CHAIN_IDS[parentId!] ?? this.syncedNetwork).toLowerCase();

          if (this.isTransfer) return getCurrencyOptions(this.accountsStore.balances);

          const balances = this.accountsStore.balances.filter(({ symbol, relayChain }) => {
            if (relayChain.toLowerCase() !== relay) return false;

            return xcm?.availableAssets.some(({ symbol: _symbol }) => {
              const assetName = getSubstrateEvmAssetName(_symbol, this.syncedNetwork);

              return isSameString(assetName, symbol);
            });
          });

          return getCurrencyOptions(balances);
    },
    optionsNetworks() {
      // used only for transfer
          const walletBalance = this.currency?.balances ?? [];

          return walletBalance.flatMap(({ name, icon }) => {
            const network = this.networksStore.getNetwork(name);

            if (!network.active) return [];

            return [
              {
                name: network.name,
                value: network.name,
                icon,
              },
            ];
          });
    },
    originNet() {
      return this.networksStore.getNetwork(this.syncedNetwork);
    },
    optionsDestNet() {
      // used only for crossChain
          if (this.isTransfer || !this.sendAssetName) return [];

          const asset = getNativeAssetName(this.sendAssetName);

          return this.originNet.xcm!.availableDestinations.flatMap(({ assets, chainId }) => {
            if (!assets.some(({ symbol }) => symbol.toLowerCase() === asset)) return [];

            const { name, icon } = this.networksStore.getNetwork(chainId);

            return {
              name: name,
              value: name,
              icon,
            };
          });
    },
    sendAssetName() {
      return getNativeAssetName(this.currency?.symbol);
    },
    isValidSendAsset() {
      return isValidAmountAsset(
            this.currency,
            this.syncedNetwork,
            this.syncedFee ?? '0',
            this.syncedAmount,
            this.isCrossChain, // проверяем ED для crossChain транзакций
            this.syncedDestNetFee ?? '0'
          );
    },
    isValidTransferByUtility() {
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
    },
    transactionAddress() {
      return getTransactionAddress(this.accountsStore.selectedWallet, this.syncedNetwork);
    },
    tx() {
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
    },
    syncedRecipient: {
      get() {
        return this.recipient;
      },
      set(value) {
        this.$emit('update:recipient', value);
      },
    },
    syncedAssetId: {
      get() {
        return this.assetId;
      },
      set(value) {
        this.$emit('update:assetId', value);
      },
    },
    syncedNetwork: {
      get() {
        return this.selectedNetwork;
      },
      set(value) {
        this.$emit('update:selectedNetwork', value);
      },
    },
    syncedDestNet: {
      get() {
        return this.destinationNetwork;
      },
      set(value) {
        this.$emit('update:destinationNetwork', value);
      },
    },
    syncedAmount: {
      get() {
        return this.amount;
      },
      set(value) {
        this.$emit('update:amount', value);
      },
    },
    syncedValue: {
      get() {
        return this.value;
      },
      set(value) {
        this.$emit('update:value', value);
      },
    },
    syncedFee: {
      get() {
        return this.partialFee;
      },
      set(value) {
        this.$emit('update:partialFee', value);
      },
    },
    syncedDestNetFee: {
      get() {
        return this.destNetFee;
      },
      set(value) {
        this.$emit('update:destNetFee', value);
      },
    },
  },
  watch: {
    "syncedRecipient": ['checkScam', 'calculateFee'],
    "showSelectedAssetPopup": 'resetAssetPopupVisible',
    "showSelectNetworkPopup": 'resetOriginPopupVisible',
    "showDestNetPopup": 'resetDestPopupVisible',
    "syncedNetwork": ['resetDestNetwork', 'calculateFee'],
    "syncedAssetId": ['updateSelectedNetwork', 'calculateFee'],
    "syncedDestNet": ['clearRecipient', 'calculateFee'],
    "syncedAmount": 'calculateFee',
  },
  created() {
    this.calculateEstimates();
  },
  methods: {
    async checkScam() {
      if (this.isValidRecipientAddress && this.isValidAddressByNetwork) {
            const { value, info } = await checkScamAddress({ address: this.syncedRecipient, network: this.targetNetwork });

            this.isScamAddress = value;
            this.scamInfo = info;
          } else {
            this.isScamAddress = false;
            this.scamInfo = null;
          }
    },
    resetAssetPopupVisible(newValue: string) {
      if (newValue) {
            this.showSelectNetworkPopup = false;
            this.showDestNetPopup = false;
            this.filterValue = '';
          }
    },
    resetOriginPopupVisible(newValue: string) {
      if (newValue) {
            this.showSelectedAssetPopup = false;
            this.showDestNetPopup = false;
            this.filterValue = '';
          }
    },
    resetDestPopupVisible(newValue: string) {
      if (newValue) {
            this.showSelectedAssetPopup = false;
            this.showSelectNetworkPopup = false;
            this.filterValue = '';
          }
    },
    resetDestNetwork(newValue: string, prevValue: string) {
      if (newValue.toLowerCase() === this.syncedDestNet.toLowerCase()) this.syncedDestNet = prevValue;
    },
    updateSelectedNetwork() {
      this.syncedAmount = '';
          this.syncedDestNet = this.optionsDestNet?.[0]?.value ?? '';
          this.syncedValue = '';

          if (this.isTransfer) this.syncedNetwork = this.optionsNetworks?.[0]?.value ?? '';
    },
    async clearRecipient() {
      this.$nextTick(() => {
            if (!this.isValidRecipientAddress) this.setRecipient();
          });
    },
    calculateFee() {
      if (!this.currency) return;

          clearTimeout(this.timeoutSubscription);

          this.timeoutSubscription = setTimeout(() => this.calculateEstimates(), 2000);
    },
    async calculateEstimates() {
      if (!this.currency) return;

          try {
            this.estimateFeeError = false;
            this.estimateFeeErrorMessage = '';

            const { estimateFee, destEstimateFee, errors } = await this.verifyTx();
            const transferError = errors?.find((error) => error.code === TransferErrorCode.TRANSFER_ERROR);

            if (transferError) {
              this.estimateFeeError = true;
              this.estimateFeeErrorMessage = getTransferErrorLocaleKey(transferError.message);
            }

            this.syncedFee = estimateFee ?? '';
            this.syncedDestNetFee = destEstimateFee ?? '';
          } catch {
            this.syncedFee = '';
            this.syncedDestNetFee = '';
          }
    },
    toggleEditBook(address: string = '') {
      this.showEditAddressBook = !this.showEditAddressBook;
          this.showHistoryBook = !this.showHistoryBook;
          this.newAddress = address;
    },
    toggleValue(value: 'showSelectedAssetPopup' | 'showSelectNetworkPopup' | 'showDestNetPopup' | 'showEditAddressBook') {
      this[value] = !this[value];
    },
    setRecipient(address = '') {
      this.syncedRecipient = BaseApi.formatAddress({ address, ethereumAddress: address }, this.targetNetwork);
    },
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
    },
    updateAmount(amount: string) {
      const value = getCostOfAssets(+amount, this.assetPrice).toString() ?? '';

          this.syncedAmount = amount;
          this.syncedValue = value;
    },
    handlerFilter(value: string) {
      this.filterValue = value;
    },
    handlerBack() {
      if (this.showHistoryBook) this.toggleHistoryBookVisibility();
          else if (this.showEditAddressBook) this.toggleEditBook();
          else if (this.showMyWallets) this.toggleMyWalletsVisibility();
          else this.step -= 1;
    },
    confirmationPasswordPopupClose(closeForm: boolean) {
      this.showConfirmationPasswordPopup = false;

          if (closeForm) this.$emit('closeForm');
    },
    getRecipientNetwork() {
      return this.isTransfer || this.syncedDestNet === '' ? this.syncedNetwork : this.syncedDestNet;
    },
    getStatusWallet(wallet: AccountJson) {
      return isTransferWalletRecipient(wallet, this.syncedRecipient, this.getRecipientNetwork());
    },
    calcTransferableUtility() {
      const balance = this.utilityAsset.balances.find(
            ({ isUtility, name }) => isUtility && name.toLowerCase() === this.syncedNetwork.toLowerCase()
          )!;

          return balance?.transferable?.toString() ?? '0';
    },
    calcTransferableSendMinusFee(fee: string) {
      return calcTransferableSendMinusFee(
            this.currency,
            this.syncedNetwork,
            fee,
            this.isCrossChain, // проверяем ED для crossChain транзакций
            this.syncedDestNetFee
          );
    },
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
    },
    toggleLoading(value = true) {
      this.isFetchingFees = value;
    },
    async verifyTx(_amount?: string) {
      this.toggleLoading();

          // комиссия не зависит от адреса получателя, поэтому подставляем всегда мок
          const to = this.getFeeEstimateRecipient();

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
    },
    getFeeEstimateRecipient() {
      if (BaseApi.isBitcoinNetwork(this.targetNetwork)) {
            return BaseApi.validateAddress(VALID_BITCOIN_TESTNET_ADDRESS, this.targetNetwork)
              ? VALID_BITCOIN_TESTNET_ADDRESS
              : VALID_BITCOIN_ADDRESS;
          }

          return BaseApi.formatAddress(
            { address: VALID_SUBSTRATE_ADDRESS, ethereumAddress: VALID_ETHEREUM_ADDRESS },
            this.targetNetwork
          );
    },
    async handlerContinueButton() {
      if (this.step === 2) {
            this.showConfirmationPasswordPopup = true;

            return;
          }

          this.step += 1;
          this.showSelectedAssetPopup = false;
          this.showSelectNetworkPopup = false;
          this.showDestNetPopup = false;
    },
    handlerCloseExistentialPopup() {
      this.showExistentialPopup = false;
    },
    handlerAcceptExistentialPopup() {
      this.handlerContinueButton();
          this.handlerCloseExistentialPopup();
    },
    handlerCloseSelectPopup() {
      if (this.showSelectedAssetPopup) this.toggleValue('showSelectedAssetPopup');
          else if (this.showSelectNetworkPopup) this.toggleValue('showSelectNetworkPopup');
          else this.toggleValue('showDestNetPopup');
    },
    handlerCloseWarningAddressPopup() {
      this.syncedRecipient = '';
    },
    formatAddress() {
      this.syncedRecipient = BaseApi.formatAddress(
            {
              address: this.syncedRecipient,
              ethereumAddress: this.syncedRecipient,
            },
            this.targetNetwork
          );
    },
    paste() {
      this.syncedRecipient = getClipboard();
    },
    setWallet(wallet: AccountJson) {
      this.syncedRecipient = getTransferWalletRecipient(wallet, this.getRecipientNetwork());

          this.toggleMyWalletsVisibility();
    },
    toggleMyWalletsVisibility() {
      this.showMyWallets = !this.showMyWallets;
    },
    toggleHistoryBookVisibility() {
      this.showHistoryBook = !this.showHistoryBook;
    },
  },
});
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
    font-size: 1.875em !important;
  }

  .balance {
    font-size: 1.375em;
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
