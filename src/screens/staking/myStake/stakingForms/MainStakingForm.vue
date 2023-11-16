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
          @setAddress="setAddress"
        />

        <HistoryBook
          v-else-if="showHistoryBook"
          :network="network"
          :assetId="stakingAssetId"
          @toggleHistoryBookVisibility="toggleHistoryBookVisibility"
          @setRecipient="setPayoutAddress"
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

        <template v-else>
          <div v-if="showWalletName" class="controller-description row">
            {{ $t('staking.separateAccountController') }}
          </div>

          <FInput
            v-if="showWalletName"
            v-model="accountName"
            placeholder="accounts.account"
            size="big"
            :readonly="true"
          />

          <SelectInput
            v-if="showAmountInput"
            class="amount-input"
            text="assets.amount"
            :totalAmount="totalAmount"
            :value="amountValue"
            :asset="stakingAssetName"
            :assetId="stakingAssetId"
            :amount="amount"
            :showIcon="false"
            :readonly="isRebond"
            @update:amount="updateAmount"
            @setMax="setMax"
          />

          <BondExtra v-if="isBondExtra" :stakingCurrency="stakingCurrency" :fee="fee" />

          <Unbond v-else-if="isUnbond" :stakingCurrency="stakingCurrency" :fee="fee" />

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
            :isInvalidController="isInvalidController"
            @update:controllerAddress="updateControllerAddress"
          >
            <div class="activity-buttons">
              <BadgeButton text="assets.history" @click="toggleHistoryBookVisibility" />

              <BadgeButton text="common.paste" @click="paste" />

              <BadgeButton v-if="showMyWalletsButton" text="assets.myWallets" @click="toggleMyWalletsVisibility" />
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
              <BadgeButton text="assets.history" @click="toggleHistoryBookVisibility" />

              <BadgeButton text="common.paste" @click="paste" />

              <BadgeButton v-if="showMyWalletsButton" text="assets.myWallets" @click="toggleMyWalletsVisibility" />
            </div>
          </Payee>
        </template>
      </Scroll>

      <FButton
        v-if="showBtn"
        width="100%"
        size="big"
        fontSize="big"
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
import { Getter, Action } from 'vuex-class';
import { AccountJson, TokenBalance } from '@extension-base/background/types/types';
import type { GetAssetPrice, GetStakingNetwork, GetStakingNetworkProps, NetworkParams, SelectedWallet } from '@/store';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
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
import { checkController, getSoraFees } from '@/extension/messaging';
import { GettersTypes as StakingGettersTypes } from '@/store/staking/getters';
import { ActionTypes as StakingActionTypes } from '@/store/staking/actions';
import { AsyncFn, StakingOperation, StakingOperationParams } from '@/interfaces';
import WalletInfo from '@/screens/main/WalletInfo.vue';
import EditAddressBook from '@/screens/wallet&asset/EditAddressBook.vue';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import { getClipboard } from '@/helpers';

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
  showConfirmationPasswordPopup = false;
  isSuggested = false;
  showHistoryBook = false;
  showMyWallets = false;
  isInvalidController = false;
  amount = '';
  fee = '0';
  step = 1;
  controllerAddress = '';
  payoutAddress = '';
  newAddress = '';

  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: Object }) rewardedCurrency!: TokenBalance;
  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @Prop({ type: String }) type!: StakingOperation;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(StakingGettersTypes.getStakingNetwork) getStakingNetwork!: GetStakingNetwork;
  @Action(StakingActionTypes.GET_MY_STAKING_INFO) getMyStakingInfo!: AsyncFn<GetStakingNetworkProps>;

  get showMyWalletsButton() {
    return this.filteredWallets.length !== 0;
  }

  get showBtn() {
    return !this.showHistoryBook && !this.showEditAddressBook && !this.showMyWallets;
  }

  get showBackIcon() {
    return this.showMyWallets || this.showHistoryBook || this.showEditAddressBook;
  }

  get showEditAddressBook() {
    return this.newAddress !== '';
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
    }

    return 'common.confirm';
  }

  get showAmountInput() {
    if (this.isControllerAccount || this.isPayee) return false;

    return this.step === 1;
  }

  get header() {
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
    if (this.isPayee || this.isControllerAccount) return this.wallets;

    return this.wallets.filter(({ active }) => !active);
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
    if (!this.isValidAmountAsset) return false;

    if (this.isControllerAccount) {
      if (this.step === 1) return this.isInvalidController;

      return !this.isValidControllerAddress;
    }

    if (this.isPayee) {
      if (this.step === 1) return false;

      return !this.isValidPayoutAddress;
    }

    return this.amount === '' || +this.amount === 0;
  }

  get isValidAmountAsset() {
    // комиссия по всем операциям списывается с transferable баланса
    // по этому amount важен только при операции bondExtra
    // в остальных случаях amount-это значение не относящееся к transferable балансу
    // а значение уже залоченных токенов(bond, unbond, rebond)
    const amount = this.isBondExtra ? this.amount : '0';

    // TODO staking проверять баланс на комиссию у стеша
    return isValidAmountAsset(this.stakingCurrency, this.network, this.fee ?? '0', amount);
  }

  get stakingAssetId() {
    return this.stakingCurrency?.assetId;
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

    return this.getAssetPrice(priceId).price;
  }

  get feeValue() {
    return getCostOfAssets(this.fee, this.stakingAssetPrice).toString();
  }

  get amountValue() {
    return getCostOfAssets(this.amount, this.stakingAssetPrice).toString();
  }

  get accountName() {
    return this.selectedWallet.name;
  }

  get tx() {
    return {
      amount: this.amount,
      from: this.selectedWallet.address,
      networkName: this.network,
      controllerAddress: this.controllerAddress,
      payee: this.payoutAddress,
    } as StakingOperationParams;
  }

  @Watch('controllerAddress')
  async checkController(value: string) {
    this.isInvalidController = !(await checkController({ address: value }));
  }

  mounted() {
    if (this.isRebond) {
      const unlocking = this.stakingNetwork.unbond.unlocking;
      const lastUnbond = unlocking[unlocking.length - 1].value;

      this.amount = lastUnbond;
    } else if (this.isRedeem) this.amount = this.stakingNetwork.redeemAmount;

    this.getSoraFees();
  }

  async getSoraFees() {
    const {
      StakingBondExtra,
      StakingRebond,
      StakingUnbond,
      StakingSetController,
      StakingWithdrawUnbonded,
      StakingSetPayee,
    } = await getSoraFees();

    if (this.isBondExtra) this.fee = StakingBondExtra;
    else if (this.isUnbond) this.fee = StakingUnbond;
    else if (this.isRebond) this.fee = StakingRebond;
    else if (this.isRedeem) this.fee = StakingWithdrawUnbonded;
    else if (this.isControllerAccount) this.fee = StakingSetController;
    else if (this.isPayee) this.fee = StakingSetPayee;
  }

  updateControllerAddress(value: string) {
    this.controllerAddress = value;
  }

  handlerBack() {
    this.showMyWallets = false;
    this.showHistoryBook = false;
    this.newAddress = '';
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
      if (this.isUnbond || this.isRebond) this.getMyStakingInfo({ network: this.network });

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
    this.payoutAddress = getClipboard();
  }

  setAddress(address: string, showHistoryBook = false) {
    this.newAddress = address;
    this.showHistoryBook = showHistoryBook;
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
    font-size: 14px;
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
