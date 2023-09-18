<template>
  <AboveForm :fullScreen="true" :header="header" @closeHandler="closeForm">
    <div class="staking-management">
      <Scroll>
        <div v-if="isControllerAccount" class="controller-description row">
          {{ $t('staking.separateAccountController') }}
        </div>

        <FInput v-if="step === 1" v-model="accountName" placeholder="accounts.account" size="big" :readonly="true" />

        <SelectInput
          v-if="showAmountInput"
          class="amount-input"
          text="assets.amount"
          :transferableAmount="transferableAmount"
          :value="amountPriceValue"
          :asset="stakingAssetName"
          :assetId="stakingAssetId"
          :amount="amount"
          @update:amount="updateAmount"
          @setMax="setMax"
        />

        <BondExtra v-if="isBondExtra" :stakingCurrency="stakingCurrency" :fee="fee" />

        <Unbond v-else-if="isUnbond" :stakingCurrency="stakingCurrency" :fee="fee" />

        <WithdrawUnbonded
          v-else-if="isWithdrawUnbonded"
          :stakingCurrency="stakingCurrency"
          :fee="fee"
          :rewards="rewards"
        />

        <Rebond v-else-if="isRebond" :stakingCurrency="stakingCurrency" :fee="fee" :amount="amount" />

        <ControllerAccount
          v-else-if="isControllerAccount"
          :network="network"
          :controllerAccount="controllerAccount"
          @update:controllerAccount="updateControllerAccount"
        />
      </Scroll>

      <FButton width="100%" size="big" fontSize="big" :text="btnText" :disabled="confirmBtnDisabled" @click="confirm" />
    </div>

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="stakingCurrency"
      :amount="amount"
      :value="amountPriceValue"
      :firstIcon="stakingAssetId"
      :extrinsicType="type"
      :tx="tx"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetPrice, SelectedWallet } from '@/store';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { AccountJson, TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import WithdrawUnbonded from '@/screens/staking/myStake/stakingForms/WithdrawUnbonded.vue';
import Unbond from '@/screens/staking/myStake/stakingForms/Unbond.vue';
import Rebond from '@/screens/staking/myStake/stakingForms/Rebond.vue';
import BondExtra from '@/screens/staking/myStake/stakingForms/BondExtra.vue';
import ControllerAccount from '@/screens/staking/myStake/stakingForms/ControllerAccount.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { NetworkName } from '@/interfaces';
import { calcTransferableSendMinusFee, isValidAmountAsset } from '@/helpers/currencies';
import {
  RequestCheckStaking,
  StakingOperation,
} from '@/extension/background/extension-base/src/services/staking-service/types';
import BaseApi from '@/util/BaseApi';
import { getSoraFees } from '@/extension/messaging';

@Component({
  components: {
    Rebond,
    Unbond,
    BondExtra,
    WithdrawUnbonded,
    ControllerAccount,
    ConfirmationPasswordPopup,
  },
})
export default class MainStakingForm extends Vue {
  showConfirmationPasswordPopup = false;
  isSuggested = false;
  amount = '';
  fee = '0';
  rewards = '2';
  step = 1;
  controllerAccount = '';

  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: Object }) rewardedCurrency!: TokenBalance;
  @Prop({ type: String }) network!: NetworkName;
  @Prop({ type: String }) type!: StakingOperation;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get btnText() {
    if (this.isControllerAccount) {
      if (this.controllerAccount !== '' && !this.isValidControllerAddress)
        return this.$t('accounts.invalidAccountAddress');
    }

    return 'common.confirm';
  }

  get showAmountInput() {
    if (this.isControllerAccount) return false;

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

  get isWithdrawUnbonded() {
    return this.type === 'withdrawUnbonded';
  }

  get isRebond() {
    return this.type === 'rebond';
  }

  get isControllerAccount() {
    return this.type === 'controllerAccount';
  }

  get isValidControllerAddress() {
    if (this.controllerAccount === '') return false;

    return BaseApi.validateAddress(this.controllerAccount, this.network);
  }

  get confirmBtnDisabled() {
    if (this.isControllerAccount) return !this.isValidControllerAddress;

    return this.amount === '' || +this.amount === 0 || !this.isValidAmountAsset;
  }

  get isValidAmountAsset() {
    return isValidAmountAsset(this.stakingCurrency, this.network, this.fee ?? '0', this.amount);
  }

  get stakingAssetId() {
    return this.stakingCurrency?.assetId;
  }

  get stakingAssetName() {
    return this.stakingCurrency?.symbol;
  }

  get stakingCurrencyBalance() {
    return this.stakingCurrency?.balances.find(({ name }) => name.toLowerCase() === this.network.toLowerCase());
  }

  get transferableAmount() {
    // TODO: количество токенов в находящихся стейкинге
    if (this.isUnbond) return 1;

    // TODO: общее количество токенов в находящихся в анбонде и не заклеймленных
    if (this.isRebond) return 1;

    // TODO: общее количество токенов в находящихся в анбонде, срок которых истек и их можно заклеймить
    if (this.isWithdrawUnbonded) return 1;

    // isBondExtra;
    return +(this.stakingCurrencyBalance?.transferable ?? 0);
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get amountPriceValue() {
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
      stashAccount: '',
      controller: '',
    } as RequestCheckStaking;
  }

  get lastUnbond() {
    return '1.1'; // текущее количество в анбонде
  }

  mounted() {
    if (this.isRebond) this.amount = this.lastUnbond;

    this.getSoraFees();
  }

  async getSoraFees() {
    const { StakingBondExtra, StakingRebond, StakingUnbond, StakingSetController, StakingWithdrawUnbonded } =
      await getSoraFees();

    if (this.isBondExtra) this.fee = StakingBondExtra;
    else if (this.isUnbond) this.fee = StakingUnbond;
    else if (this.isRebond) this.fee = StakingRebond;
    else if (this.isWithdrawUnbonded) this.fee = StakingWithdrawUnbonded;
    else if (this.isControllerAccount) this.fee = StakingSetController;
  }

  updateControllerAccount(value: string) {
    this.controllerAccount = value;
  }

  closeForm() {
    this.$emit('closeForm');
  }

  confirm() {
    this.showConfirmationPasswordPopup = true;
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) this.closeForm();
  }

  updateAmount(amount: string) {
    this.amount = amount;
  }

  calcTransferableSendMinusFee() {
    return calcTransferableSendMinusFee(this.stakingCurrency, this.network, this.fee);
  }

  async setMax() {
    if (!this.stakingCurrency) return;

    this.amount = this.calcTransferableSendMinusFee().toString();
  }

  handlerBack() {
    if (this.step === 6 && this.isSuggested) this.step -= 1;
    else if (this.step === 5) this.step -= 2;

    this.step -= 1;
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
}
</style>
