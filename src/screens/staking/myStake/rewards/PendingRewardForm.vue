<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :header="header"
    :closeHandler="closeForm"
    :handlerBack="handlerBack"
  >
    <div class="pending-rewards">
      <div>
        <ContentForm v-if="step === 1" :height="380" :isStaticHeight="true" :bottomRightCorner="true">
          <div class="form-layout">
            <Scroll>
              <div class="descriptions">{{ $t('staking.validatorsPayoutRewards') }}</div>

              <ValidatorItem
                v-for="validator in myValidators"
                :key="validator.address"
                :validator="validator"
                :rewardedCurrency="rewardedCurrency"
                @openValidatorInfo="$emit('openValidatorInfo', $event)"
              />
            </Scroll>
          </div>
        </ContentForm>

        <div v-else-if="step === 2">
          <Input v-model="selectedAccountName" placeholder="accounts.account" size="big" :readonly="true" />

          <SelectInput
            class="amount-input"
            text="assets.amount"
            :value="amountPriceValue"
            :asset="stakingAssetName"
            :assetId="stakingAssetId"
            :amount="summaryRewards"
            :showRotateIcon="false"
            :showBalance="false"
            :readonly="true"
          />

          <Input v-model="destinationAccount" placeholder="staking.rewardsDestination" size="big" />
        </div>

        <InfoRow
          text="assets.networkFee"
          :value="`${fee} ${stakingAssetName}`"
          :price="feeValueString"
          borderType="default"
          icon="info"
          textSize="mini"
          :iconClasses="['network-fee']"
        />

        <Tooltip text="assets.networkFee" target=".network-fee" placement="right" />
      </div>

      <Button width="100%" size="big" fontSize="big" :text="btnText" @click="confirm" />
    </div>

    <WarningPopup v-if="showWarningPopup" :handlerAccept="handlerAccept" :handlerClose="closeWarningPopup" />

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="stakingCurrency"
      :amount="summaryRewards"
      :value="amountPriceValue"
      :firstIcon="stakingAssetId"
      extrinsicType="staking"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { myValidators } from '../validators/mock';
import type { GetAssetPrice, SelectedWallet } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import StakingForm from '@/screens/staking/myStake/stakingForms/StakingForm.vue';
import RedeemForm from '@/screens/staking/myStake/stakingForms/RedeemForm.vue';
import UnstakingForm from '@/screens/staking/myStake/stakingForms/UnstakingForm.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import ValidatorItem from '@/screens/staking/myStake/rewards/ValidatorItem.vue';
import WarningPopup from '@/screens/staking/myStake/rewards/WarningPopup.vue';

@Component({
  components: {
    RedeemForm,
    StakingForm,
    WarningPopup,
    ValidatorItem,
    UnstakingForm,
    ConfirmationPasswordPopup,
  },
})
export default class StakingManagement extends Vue {
  showConfirmationPasswordPopup = false;
  showWarningPopup = false;
  myValidators = myValidators;
  destinationAccount = '';
  amount = '';
  step = 1;
  fee = '0.7';

  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: Object }) rewardedCurrency!: TokenBalance;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;

  get selectedAccountName() {
    return this.selectedWallet.name;
  }

  get btnText() {
    if (this.step === 1) return 'staking.payoutAll';

    return 'common.confirm';
  }

  get summaryRewards() {
    return this.myValidators
      .reduce((result, { rewards }) => {
        result += +rewards;

        return result;
      }, 0)
      .toString();
  }

  get feeValueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get stakingAssetName() {
    return this.stakingCurrency?.symbol;
  }

  get showBackIcon() {
    return this.step !== 1;
  }

  get header() {
    if (this.step === 1) return 'staking.pendingRewards';

    if (this.step === 2) return 'common.confirmation';

    return '';
  }

  get stakingAssetId() {
    return this.stakingCurrency!.assetId;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get amountPriceValue() {
    return getCostOfAssets(this.summaryRewards, this.stakingAssetPrice).toString();
  }

  closeForm() {
    this.$emit('closeForm');
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) this.closeForm();
  }

  handlerBack() {
    this.step -= 1;
  }

  handlerAccept() {
    this.step = 2;

    this.closeWarningPopup();
  }

  closeWarningPopup() {
    this.showWarningPopup = false;
  }

  confirm() {
    if (this.step === 1 && +this.summaryRewards <= +this.fee) {
      this.showWarningPopup = true;

      return;
    } else if (this.step === 2) this.showConfirmationPasswordPopup = true;
    else this.step += 1;
  }
}
</script>

<style lang="scss" scoped>
.pending-rewards {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .descriptions {
    font-size: 14px;
    color: $default-white;
    text-align: left;
    margin-bottom: 5px;
  }

  .form-layout {
    height: 100%;
    padding: $default-padding;
  }

  .amount-input {
    margin: 10px 0;
  }
}
</style>
