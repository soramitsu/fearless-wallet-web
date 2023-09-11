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
        <FInput
          v-if="step === 1"
          v-model="selectedAccountName"
          placeholder="accounts.account"
          size="big"
          :readonly="true"
        />

        <SelectInput
          v-if="step === 1"
          class="amount-input"
          text="assets.amount"
          :transferableAmount="transferableAmount"
          :value="amountPriceValue"
          :asset="stakingAssetName"
          :assetId="stakingAssetId"
          :amount="amount"
          :readonly="assetInputReadonly"
          @update:amount="updateAmount"
          @setMax="setMax"
        />

        <Bond
          v-if="isBond"
          :step="step"
          :stakingCurrency="stakingCurrency"
          :rewardedCurrency="rewardedCurrency"
          :fee="fee"
          :amount="amount"
          :network="network"
          @openValidatorList="openValidatorList"
        />

        <Unbond v-else-if="isUnbond" :stakingCurrency="stakingCurrency" :fee="fee" />

        <Redeem v-else-if="isRedeeam" :stakingCurrency="stakingCurrency" :fee="fee" :rewards="rewards" />

        <Rebond v-else-if="isRebond" :stakingCurrency="stakingCurrency" :fee="fee" :amount="amount" />
      </Scroll>

      <FButton
        v-if="showConfirmButton"
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
      :value="amountPriceValue"
      :firstIcon="stakingAssetId"
      :extrinsicType="type"
      :tx="tx"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetPrice, SelectedWallet } from '@/store';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { AccountJson, TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import Bond from '@/screens/staking/myStake/stakingForms/Bond.vue';
import Redeem from '@/screens/staking/myStake/stakingForms/Redeem.vue';
import Unbond from '@/screens/staking/myStake/stakingForms/Unbond.vue';
import Rebond from '@/screens/staking/myStake/stakingForms/Rebond.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { NetworkName } from '@/interfaces';
import { calcTransferableSendMinusFee, isValidAmountAsset } from '@/helpers/currencies';
import { checkStaking } from '@/extension/messaging';
import { RequestCheckStaking } from '@/extension/background/extension-base/src/services/staking-service/types';

@Component({
  components: {
    Bond,
    Rebond,
    Redeem,
    Unbond,
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

  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: Object }) rewardedCurrency!: TokenBalance;
  @Prop({ type: String }) network!: NetworkName;
  @Prop({ type: String }) type!: 'bond' | 'bondExtra' | 'unbond' | 'rebond' | 'redeem';
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get btnText() {
    if (this.isBond) {
      if (this.step === 1) return 'common.next';

      if (this.step === 3) return 'common.iAgree';
    }

    return 'common.confirm';
  }

  get showConfirmButton() {
    return this.step !== 2;
  }

  get showBackIcon() {
    if (this.isRedeeam || this.isUnbond) return false;

    return this.step !== 1;
  }

  get header() {
    if (this.isBond) {
      if (this.step === 2) return 'staking.validators';

      if (this.step === 3) return 'common.warning';

      if (this.step === 4) return 'staking.recommended';

      if (this.step === 5) return 'staking.yourself';

      if (this.step === 6) return 'common.confirmation';
    }

    return `staking.${this.type}`;
  }

  get assetInputReadonly() {
    if (this.isRebond) return true;

    return this.step !== 1;
  }

  get isBond() {
    return this.type === 'bond';
  }

  get isBondExtra() {
    return this.type === 'bondExtra';
  }

  get isUnbond() {
    return this.type === 'unbond';
  }

  get isRedeeam() {
    return this.type === 'redeem';
  }

  get isRebond() {
    return this.type === 'rebond';
  }

  get confirmBtnDisabled() {
    if (this.step === 1) return this.amount === '' || +this.amount === 0 || !this.isValidAmountAsset;

    return false;
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
    return +(this.stakingCurrencyBalance?.transferable ?? 0);
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get amountPriceValue() {
    return getCostOfAssets(this.amount, this.stakingAssetPrice).toString();
  }

  get selectedAccountName() {
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

  @Watch('amount')
  async calculateEstimates() {
    const { fee } = await this.verifyTx();

    this.fee = fee ?? '0';
  }

  async verifyTx(_amount?: string) {
    const amount = _amount ?? (this.amount !== '' && this.amount !== '0') ? this.amount : '1';

    const ex = await checkStaking(this.type, {
      networkName: this.network,
      from: this.selectedWallet.address,
      amount,
      controller: '',
      stashAccount: '',
    });

    return ex;
  }

  get lastUnstake() {
    return '1.1'; // текущее количество в анбонде
  }

  mounted() {
    if (this.isRebond) this.amount = this.lastUnstake;
  }

  async getSoraFees() {
    // const { StakingBond, StakingBondExtra, StakingRebond, StakingUnbond } = await getSoraFees();
    // if (this.isBond) {
    //   this.fee = StakingBond;
    // } else if (this.isBondExtra) {
    //   this.fee = StakingBondExtra;
    // } else if (this.isRebond) {
    //   this.fee = StakingRebond;
    // } else if (this.isUnbond) {
    //   this.fee = StakingUnbond;
    // }
  }

  closeForm() {
    this.$emit('closeForm');
  }

  openValidatorList(isSuggested: boolean) {
    this.isSuggested = isSuggested;

    this.step = isSuggested ? 3 : 5;
  }

  confirm() {
    if (this.isBond) {
      if (this.step === 4) this.step += 1;

      if (this.step === 6) this.showConfirmationPasswordPopup = true;
      else this.step += 1;
    } else {
      this.showConfirmationPasswordPopup = true;
    }
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) this.closeForm();
  }

  updateAmount(amount: string) {
    this.amount = amount;
  }

  calcTransferableSendMinusFee(fee: string) {
    return calcTransferableSendMinusFee(this.stakingCurrency, this.network, fee);
  }

  async setMax() {
    if (!this.stakingCurrency) return;

    const { fee } = await this.verifyTx(this.transferableAmount.toString());

    this.amount = this.calcTransferableSendMinusFee(fee ?? '0');
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
}
</style>
