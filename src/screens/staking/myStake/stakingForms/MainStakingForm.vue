<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :header="header"
    @handlerBack="handlerBack"
    @closeHandler="closeForm"
  >
    <div class="staking-management">
      <Scroll>
        <EditAddressBook
          v-if="showEditAddressBook"
          :network="network"
          :_address="newAddress"
          @toggleEditBook="toggleEditBook"
        />

        <HistoryBook
          v-else-if="showHistoryBook"
          :network="network"
          :assetId="stakingAssetId"
          @toggleHistoryBookVisibility="toggleHistoryBookVisibility"
          @setRecipient="setRecipient"
          @toggleEditBook="toggleEditBook"
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

        <template v-else>
          <div v-if="showWalletName" class="controller-description row" data-testid="controllerDescription">
            {{ $t('staking.separateAccountController') }}
          </div>

          <FInput
            v-if="showWalletName"
            :value="accountName"
            placeholder="accounts.account"
            size="big"
            data-testid="accountName"
            :readonly="true"
          />

          <SelectInput
            v-if="showAmountInput"
            class="amount-input"
            text="assets.amount"
            data-testid="inputAmount"
            :totalAmount="totalAmount"
            :value="amountValue"
            :asset="stakingAssetName"
            :assetId="stakingAssetId"
            :amount="amount"
            :showIcon="false"
            :readonly="isRedeem"
            @update:amount="updateAmount"
            @setMax="setMax"
          />

          <BondExtra v-if="isBondExtra" :stakingCurrency="stakingCurrency" :fee="fee" />

          <Unbond v-else-if="isUnbond" :stakingCurrency="stakingCurrency" :stakingNetwork="stakingNetwork" :fee="fee" />

          <WithdrawUnbonded v-else-if="isRedeem" :stakingCurrency="stakingCurrency" :fee="fee" />

          <Rebond v-else-if="isRebond" :stakingCurrency="stakingCurrency" :fee="fee" :amount="amount" />

          <ControllerAccount
            v-else-if="isControllerAccount"
            :step="step"
            :fee="fee"
            :network="network"
            :stakingNetwork="stakingNetwork"
            :stakingCurrency="stakingCurrency"
            :controllerAddress="controllerAddress"
            :isValidController="isValidController"
            @update:controllerAddress="updateControllerAddress"
          >
            <div class="activity-buttons">
              <BadgeButton text="assets.history" data-testid="historyBtn" @click="toggleHistoryBookVisibility" />

              <BadgeButton text="common.paste" data-testid="pasteBtn" @click="paste" />

              <BadgeButton
                v-if="showMyWalletsButton"
                text="assets.myWallets"
                data-testid="myWalletsBtn"
                @click="toggleMyWalletsVisibility"
              />
            </div>
          </ControllerAccount>

          <Payee
            v-else-if="isPayee"
            :step="step"
            :fee="fee"
            :network="network"
            :stakingNetwork="stakingNetwork"
            :stakingCurrency="stakingCurrency"
            :payoutAddress="payoutAddress"
            @update:payoutAddress="setPayoutAddress"
          >
            <div class="activity-buttons">
              <BadgeButton text="assets.history" data-testid="historyBtn" @click="toggleHistoryBookVisibility" />

              <BadgeButton text="common.paste" data-testid="pasteBtn" @click="paste" />

              <BadgeButton
                v-if="showMyWalletsButton"
                text="assets.myWallets"
                data-testid="myWalletsBtn"
                @click="toggleMyWalletsVisibility"
              />
            </div>
          </Payee>
        </template>
      </Scroll>

      <FButton
        v-if="showBtn"
        width="100%"
        size="big"
        fontSize="big"
        data-testid="confirmBtn"
        :text="btnText"
        :disabled="confirmBtnDisabled"
        @click="confirm"
      />
    </div>

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="stakingCurrency"
      :amount="amount"
      :value="amountValue"
      :fee="fee"
      :feeValue="feeValue"
      :firstIcon="stakingAssetId"
      :extrinsicType="type"
      :tx="tx"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkParams } from '@/stores';
import type { StakingOperation, StakingOperationParams } from '@/interfaces';
import WithdrawUnbonded from '@/screens/staking/myStake/stakingForms/WithdrawUnbonded.vue';
import Unbond from '@/screens/staking/myStake/stakingForms/Unbond.vue';
import Rebond from '@/screens/staking/myStake/stakingForms/Rebond.vue';
import BondExtra from '@/screens/staking/myStake/stakingForms/BondExtra.vue';
import ControllerAccount from '@/screens/staking/myStake/stakingForms/ControllerAccount.vue';
import Payee from '@/screens/staking/myStake/stakingForms/Payee.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { calcTransferableSendMinusFee, isValidAmountAsset } from '@/helpers/currencies';
import BaseApi from '@/util/BaseApi';
import { checkController, fetchBalance } from '@/extension/messaging';
import WalletInfo from '@/screens/main/WalletInfo.vue';
import EditAddressBook from '@/screens/wallet&asset/EditAddressBook.vue';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import { getClipboard } from '@/helpers';
import { useStakingStore } from '@/stores/staking';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component({
  components: {
    Payee,
    Rebond,
    Unbond,
    BondExtra,
    WalletInfo,
    HistoryBook,
    EditAddressBook,
    WithdrawUnbonded,
    ControllerAccount,
    ConfirmationPasswordPopup,
  },
})
export default class MainStakingForm extends Vue {
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();
  stakingStore = useStakingStore();
  showConfirmationPasswordPopup = false;
  isSuggested = false;
  showHistoryBook = false;
  showMyWallets = false;
  isValidController = true;
  showEditAddressBook = false;
  amount = '';
  stashBalance = '0';
  step = 1;
  controllerAddress = '';
  payoutAddress = '';
  newAddress = '';

  @Prop({ type: Object }) stakingCurrency!: TokenGroup;
  @Prop({ type: Object }) rewardedCurrency!: TokenGroup;
  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @Prop({ type: String }) type!: StakingOperation;

  get fee() {
    if (!this.networksStore.soraFees) return '';

    const {
      StakingBondExtra,
      StakingRebond,
      StakingUnbond,
      StakingSetController,
      StakingWithdrawUnbonded,
      StakingSetPayee,
    } = this.networksStore.soraFees;

    if (this.isBondExtra) return StakingBondExtra;
    else if (this.isUnbond) return StakingUnbond;
    else if (this.isRebond) return StakingRebond;
    else if (this.isRedeem) return StakingWithdrawUnbonded;
    else if (this.isControllerAccount) return StakingSetController;
    else if (this.isPayee) return StakingSetPayee;

    return '';
  }

  get showMyWalletsButton() {
    return this.filteredWallets.length !== 0;
  }

  get showBtn() {
    return !this.showHistoryBook && !this.showEditAddressBook && !this.showMyWallets;
  }

  get showBackIcon() {
    return this.showMyWallets || this.showHistoryBook || this.showEditAddressBook;
  }

  get network() {
    return this.stakingNetwork.network;
  }

  get btnText() {
    if (this.isControllerAccount || this.isPayee) {
      if (this.step === 1) return 'common.edit';
      else if (
        (this.controllerAddress !== '' && !this.isValidControllerAddress) ||
        (this.payoutAddress !== '' && !this.isValidPayoutAddress)
      )
        return this.$t('accounts.invalidAccountAddress');
    } else if (!this.isValidAmountAsset)
      return { text: 'assets.insufficientBalance', localeProps: { asset: this.stakingAssetName.toUpperCase() } };

    return 'common.confirm';
  }

  get showAmountInput() {
    if (this.isControllerAccount || this.isPayee) return false;

    return this.step === 1;
  }

  get header() {
    if (this.showEditAddressBook) return 'assets.addContact';

    if (this.showHistoryBook) return 'assets.chooseFromHistory';

    if (this.showMyWallets) return 'assets.wallets';

    return `staking.${this.type}`;
  }

  get isBondExtra() {
    return this.type === 'bondExtra';
  }

  get isUnbond() {
    return this.type === 'unbond';
  }

  get isRedeem() {
    return this.type === 'redeem';
  }

  get isRebond() {
    return this.type === 'rebond';
  }

  get isControllerAccount() {
    return this.type === 'setController';
  }

  get showWalletName() {
    if (this.isControllerAccount || this.isPayee) return this.step === 2;

    return this.step === 1;
  }

  get filteredWallets() {
    if (this.isPayee || this.isControllerAccount) return this.accountsStore.accounts;

    return this.accountsStore.accounts.filter(({ active }) => !active);
  }

  get isPayee() {
    return this.type === 'setPayee';
  }

  get isValidControllerAddress() {
    if (this.controllerAddress === '') return false;

    return BaseApi.validateAddress(this.controllerAddress, this.network);
  }

  get isValidPayoutAddress() {
    if (this.payoutAddress === '') return false;

    return BaseApi.validateAddress(this.payoutAddress, this.network);
  }

  get confirmBtnDisabled() {
    if (this.isControllerAccount) {
      if (this.step === 2) return !this.isValidController || !this.isValidControllerAddress;

      return false;
    }

    if (this.isPayee) {
      if (this.step === 1) return false;

      return !this.isValidPayoutAddress;
    }

    if (this.amount === '' || +this.amount === 0) return true;

    return !this.isValidAmountAsset;
  }

  get isValidAmountAsset() {
    // для isRebond подменяем на сумму unbond`ов
    // для isUnbond подменяем на суммарный стейк(activeStake)
    // для isRedeem можно не подменять данные, тк инпут всегда isDisabled и значение подставляется автоматически и оно всегда корректное
    const currencyByTypeOperation: TokenGroup = this.isRebond
      ? {
          ...this.stakingCurrency,
          balances: this.stakingCurrency.balances.map((item) => ({
            ...item,
            transferable: this.stakingNetwork.unbond.sum,
          })),
        }
      : this.isUnbond
      ? {
          ...this.stakingCurrency,
          balances: this.stakingCurrency.balances.map((item) => ({
            ...item,
            transferable: this.stakingNetwork.activeStake,
          })),
        }
      : this.stakingCurrency;

    // Проверяем корерктно ли значение amount, которое ввел юзер
    const isValid = isValidAmountAsset(currencyByTypeOperation, this.network, '0', this.amount);

    if (!isValid) return false;

    // Далее проверка на то, хватает ли Utility на оплату комиссии
    // Для controller аккаунта подставляем баланс stash аккаунта, потому что комиссия списывается со stash
    const stakingCurrency: TokenGroup = this.stakingNetwork.isController
      ? {
          ...this.stakingCurrency,
          balances: this.stakingCurrency.balances.map((item) => ({
            ...item,
            transferable: this.stashBalance,
          })),
        }
      : this.stakingCurrency;

    // при этом для bondExtra проверяется то, что transferable баланса хватает на оплату и amount и fee
    // комиссия по всем операциям списывается с transferable баланса
    // по этому amount важен только при операции bondExtra
    // в остальных случаях amount-это значение не относящееся к transferable балансу(мы проверили его выше)
    // а значение уже залоченных токенов(unbond, rebond)
    const amount = this.isBondExtra ? this.amount : '0';

    return isValidAmountAsset(stakingCurrency, this.network, this.fee ?? '0', amount);
  }

  get stakingAssetId() {
    return this.stakingCurrency?.groupId;
  }

  get stakingAssetName() {
    return this.stakingCurrency?.symbol;
  }

  get totalAmount() {
    if (this.isUnbond) return this.stakingNetwork.activeStake;

    if (this.isRebond) return this.stakingNetwork.unbond.sum;

    if (this.isRedeem) return this.stakingNetwork.redeemAmount;

    // isBondExtra;
    return this.stakingNetwork.transferableAmount;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.networksStore.getAssetPrice(priceId).price;
  }

  get feeValue() {
    return getCostOfAssets(this.fee, this.stakingAssetPrice).toString();
  }

  get amountValue() {
    return getCostOfAssets(this.amount, this.stakingAssetPrice).toString();
  }

  get accountName() {
    return this.accountsStore.selectedWallet.name;
  }

  get tx() {
    return {
      amount: this.amount,
      from: this.accountsStore.selectedWallet.address,
      networkName: this.network,
      controllerAddress: this.controllerAddress,
      payee: this.payoutAddress,
    } as StakingOperationParams;
  }

  @Watch('controllerAddress')
  async checkController(value: string) {
    this.isValidController = await checkController({ address: value });
  }

  async mounted() {
    if (this.isRebond) {
      const unlocking = this.stakingNetwork.unbond.unlocking;
      const lastUnbond = unlocking[unlocking.length - 1].value;

      this.amount = lastUnbond;
    } else if (this.isRedeem) this.amount = this.stakingNetwork.redeemAmount;

    if (this.stakingNetwork.isController)
      this.stashBalance = await fetchBalance({
        address: this.stakingNetwork.stashAddress,
        networkName: this.stakingNetwork.network,
      });
  }

  toggleEditBook(address: string = '') {
    this.showEditAddressBook = !this.showEditAddressBook;
    this.showHistoryBook = !this.showHistoryBook;
    this.newAddress = address;
  }

  updateControllerAddress(value: string) {
    this.controllerAddress = value;
  }

  handlerBack() {
    if (this.showHistoryBook) this.toggleHistoryBookVisibility();
    else if (this.showEditAddressBook) this.toggleEditBook();
    else if (this.showMyWallets) this.toggleMyWalletsVisibility();
  }

  closeForm() {
    this.$emit('closeForm');
  }

  confirm() {
    if (this.isControllerAccount && this.step === 1) this.step += 1;
    else if (this.isPayee && this.step === 1) this.step += 1;
    else this.showConfirmationPasswordPopup = true;
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) {
      this.stakingStore.getMyStakingInfo({ network: this.network });
      this.closeForm();
    }
  }

  updateAmount(amount: string) {
    this.amount = amount;
  }

  calcTransferableSendMinusFee() {
    return calcTransferableSendMinusFee(this.stakingCurrency, this.network, this.fee);
  }

  async setMax() {
    if (!this.stakingCurrency) return;

    if (this.isBondExtra) this.amount = this.calcTransferableSendMinusFee();

    if (this.isUnbond) this.amount = this.stakingNetwork.activeStake;

    if (this.isRebond) this.amount = this.stakingNetwork.unbond.sum;

    if (this.isRedeem) this.amount = this.stakingNetwork.redeemAmount;
  }

  toggleHistoryBookVisibility() {
    this.showHistoryBook = !this.showHistoryBook;
  }

  paste() {
    this.setRecipient(getClipboard());
  }

  toggleMyWalletsVisibility() {
    this.showMyWallets = !this.showMyWallets;
  }

  getStatusWallet(address: string, ethereumAddress: string) {
    const currentAddress = BaseApi.formatAddress({ address, ethereumAddress }, this.network);
    const currentRecipientAddress = BaseApi.formatAddress(
      { address: this.payoutAddress, ethereumAddress: this.payoutAddress },
      this.network
    );

    return currentAddress === currentRecipientAddress;
  }

  setWallet(address: string, ethereumAddress: string) {
    const value = BaseApi.formatAddress({ address, ethereumAddress }, this.network);

    if (this.isPayee) this.payoutAddress = value;
    else if (this.isControllerAccount) this.controllerAddress = value;

    this.toggleMyWalletsVisibility();
  }

  setPayoutAddress(value = '') {
    this.payoutAddress = value;
  }

  setRecipient(value = '') {
    if (this.isControllerAccount) this.controllerAddress = value;
    else if (this.isPayee) this.payoutAddress = value;
  }
}
</script>

<style lang="scss" scoped>
.staking-management {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .amount-input {
    margin-top: 10px;
  }

  .controller-description {
    font-size: 0.875em;
    text-align: left;
    color: $default-white;
    margin-bottom: 15px;
    margin-left: 15px;
  }

  .wallet {
    margin-bottom: 12px !important;
  }

  .activity-buttons {
    display: flex;
    user-select: none;
    margin-bottom: 15px;
  }
}
</style>
