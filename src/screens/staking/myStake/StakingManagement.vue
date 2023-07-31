<template>
  <AboveForm :fullScreen="true" :header="header" :closeHandler="closeForm">
    <div class="staking-management">
      <div>
        <InputWithIcon
          v-model="selectedAccountName"
          placeholder="accounts.account"
          icon="rotate"
          :ref="selectAccountInputRef"
          :isActiveRotate="showSelectAccountPopup"
          @click="toggleSelectAccountPopupVisible"
        />

        <Input v-model="amount" size="big" placeholder="assets.amount" class="amount-input" />

        <StakingForm v-if="isStaking" />

        <UnstakingForm v-else-if="isUnstaking" :currency="currency" :fee="fee" />

        <RedeemForm v-else-if="isRedeeam" :currency="currency" :fee="fee" :rewards="rewards" />
      </div>

      <Button width="100%" text="common.confirm" size="big" fontSize="big" @click="confirm" />
    </div>

    <SelectPopup
      v-if="showSelectAccountPopup"
      placeholder="common.searchAccounts"
      verticalPlacement="top"
      horizontalPlacement="left"
      :value="selectedAddress"
      :showBlur="false"
      :showBackground="false"
      :top="148"
      :left="-160"
      :height="360"
      :options="accounts"
      :handlerFilter="handlerFilter"
      :toggleValue="toggleSelectedAccount"
      :handlerClose="toggleSelectAccountPopupVisible"
    />

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="currency"
      :amount="amount"
      :value="value"
      :firstIcon="assetId"
      extrinsicType="staking"
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
import StakingForm from '@/screens/staking/myStake/StakingForm.vue';
import RedeemForm from '@/screens/staking/myStake/RedeemForm.vue';
import UnstakingForm from '@/screens/staking/myStake/UnstakingForm.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';

@Component({
  components: {
    RedeemForm,
    StakingForm,
    UnstakingForm,
    ConfirmationPasswordPopup,
  },
})
export default class StakingManagement extends Vue {
  readonly selectAccountInputRef = 'selectAccountInput';
  showConfirmationPasswordPopup = false;
  amount = '';
  showSelectAccountPopup = false;
  selectedAddress = '';
  filterValue = '';
  fee = '1';
  rewards = '2';

  @Prop({ type: String }) assetId!: string;
  @Prop({ type: String }) type!: 'staking' | 'unstaking' | 'redeem';
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get header() {
    return `staking.${this.type}`;
  }

  get isStaking() {
    return this.type === 'staking';
  }

  get isUnstaking() {
    return this.type === 'unstaking';
  }

  get isRedeeam() {
    return this.type === 'redeem';
  }

  get currency() {
    return this.balances.find(({ assetId }) => assetId === this.assetId);
  }

  get assetPrice() {
    const priceId = this.currency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get value() {
    return (+this.amount * this.assetPrice).toString();
  }

  get accounts() {
    return (
      this.wallets
        .map(({ address, name }) => ({ name, value: address, iconType: 'address' }))
        .filter(({ name }) => name.toLowerCase().includes(this.filterValue.toLowerCase())) ?? []
    );
  }

  get selectedAccountName() {
    if (this.selectedAddress === '') return '';

    const { name } = this.accounts.find(({ value }) => value === this.selectedAddress)!;

    return name;
  }

  mounted() {
    this.selectedAddress = this.selectedWallet.address;
  }

  handlerFilter(value: string) {
    this.filterValue = value;
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

  toggleSelectedAccount(value: string) {
    this.selectedAddress = value;

    this.toggleSelectAccountPopupVisible();
  }

  toggleSelectAccountPopupVisible() {
    this.showSelectAccountPopup = !this.showSelectAccountPopup;
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
