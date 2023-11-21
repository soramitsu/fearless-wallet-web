<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :header="header"
    @handlerBack="handlerBack"
    @closeHandler="closeForm"
  >
    <div class="pending-rewards">
      <div>
        <ContentForm v-if="step === 1" :height="380" :isStaticHeight="true" :bottomRightCorner="true">
          <Loader v-if="showLoader" />

          <div v-show="!showLoader" class="form-layout">
            <Scroll>
              <div class="descriptions">{{ $t('staking.validatorsPayoutRewards') }}</div>

              <ValidatorItem
                v-for="validator in myValidatorRewards"
                :key="validator.address"
                :validator="validator"
                :rewardedCurrency="rewardedCurrency"
                @openValidatorInfo="$emit('openValidatorInfo', $event)"
              />
            </Scroll>
          </div>
        </ContentForm>

        <div v-else-if="step === 2">
          <FInput v-model="selectedAccountName" placeholder="accounts.account" size="big" :readonly="true" />

          <SelectInput
            class="amount-input"
            text="assets.amount"
            :value="summaryRewardsValue"
            :asset="rewardedAssetName"
            :assetId="rewardedAssetId"
            :amount="summaryRewards"
            :showBalance="false"
            :readonly="true"
          />

          <FInput v-model="payeeName" :readonly="true" placeholder="staking.setPayee" size="big" />
        </div>

        <InfoRow
          text="assets.networkFee"
          :value="`${sumFee} ${stakingAssetName}`"
          :price="feeValueString"
          borderType="default"
          icon="info"
          :iconClasses="['network-fee']"
        />

        <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
      </div>

      <FButton width="100%" size="big" fontSize="big" :disabled="disabledBtn" :text="btnText" @click="confirm" />
    </div>

    <WarningPopup v-if="showWarningPopup" :handlerAccept="handlerAccept" :handlerClose="closeWarningPopup" />

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="stakingCurrency"
      :amount="summaryRewards"
      :value="summaryRewardsValue"
      :fee="sumFee"
      :feeValue="feeValue"
      :firstIcon="stakingAssetId"
      :tx="tx"
      extrinsicType="payoutRewards"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import { FPNumber } from '@sora-substrate/util';
import type { GetAssetPrice, GetStakingNetworkProps, NetworkParams, SelectedWallet } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import ValidatorItem from '@/screens/staking/myStake/rewards/ValidatorItem.vue';
import WarningPopup from '@/screens/staking/myStake/rewards/WarningPopup.vue';
import { fetchBalance, getRewards, getSoraFees } from '@/extension/messaging';
import {
  type PayoutRewards,
  type RewardsResponse,
} from '@/extension/background/extension-base/src/services/staking-service/types';
import { isValidAmountAsset } from '@/helpers/currencies';
import { ActionTypes as StakingActionTypes } from '@/store/staking/actions';
import { type AsyncFn } from '@/interfaces';

@Component({
  components: {
    WarningPopup,
    ValidatorItem,
    ConfirmationPasswordPopup,
  },
})
export default class PendingRewardForm extends Vue {
  showConfirmationPasswordPopup = false;
  showWarningPopup = false;
  amount = '';
  step = 1;
  fee = '';
  stashBalance = '0';
  showLoader = false;
  rewards: RewardsResponse = { validators: [], payouts: [], sum: '0' };

  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: Object }) rewardedCurrency!: TokenBalance;
  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Action(StakingActionTypes.GET_MY_STAKING_INFO) getMyStakingInfo!: AsyncFn<GetStakingNetworkProps>;

  get sumFee() {
    return (+this.fee * this.rewards.payouts.length).toString();
  }

  get network() {
    return this.stakingNetwork.network;
  }

  get selectedAccountName() {
    return this.selectedWallet.name;
  }

  get btnText() {
    if (this.step === 1) return 'staking.payoutAll';

    return 'common.confirm';
  }

  get disabledBtn() {
    if (this.step === 1) return this.myValidatorRewards.length === 0;

    // для controller аккаунта подставляем баланс stash аккаунта
    const stakingCurrency: TokenBalance = this.stakingNetwork.isController
      ? {
          ...this.stakingCurrency,
          balances: this.stakingCurrency.balances.map((item) => ({ ...item, transferable: this.stashBalance })),
        }
      : this.stakingCurrency;

    return isValidAmountAsset(stakingCurrency, this.network, this.fee ?? '0', '0');
  }

  get payeeName() {
    return this.stakingNetwork.payeeName;
  }

  get myValidatorRewards() {
    return this.rewards?.validators;
  }

  get summaryRewards() {
    return this.rewards.sum;
  }

  get feeValueString() {
    return `${this.fiatSymbol}${this.$n(+this.feeValue, 'price')}`;
  }

  get stakingAssetName() {
    return this.stakingCurrency?.symbol;
  }

  get rewardedAssetName() {
    return this.rewardedCurrency?.symbol;
  }

  get showBackIcon() {
    return this.step !== 1;
  }

  get header() {
    if (this.step === 1) return 'staking.pendingRewards';

    if (this.step === 2) return 'common.confirmation';

    return '';
  }

  get rewardedAssetId() {
    return this.rewardedCurrency!.assetId;
  }

  get stakingAssetId() {
    return this.stakingCurrency!.assetId;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get rewardedAssetPrice() {
    const priceId = this.rewardedCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get feeValue() {
    return getCostOfAssets(this.sumFee, this.stakingAssetPrice).toString();
  }

  get summaryRewardsValue() {
    return getCostOfAssets(this.summaryRewards, this.rewardedAssetPrice).toString();
  }

  get tx() {
    return {
      payouts: this.rewards.payouts,
      from: this.selectedWallet.address,
      networkName: this.network,
    } as PayoutRewards;
  }

  async created() {
    this.getSoraFees();

    this.showLoader = true;

    this.rewards = await getRewards({
      address: this.stakingNetwork.stashAddress,
      network: this.network,
    });

    this.showLoader = false;

    if (this.stakingNetwork.isController)
      this.stashBalance = await fetchBalance({
        address: this.stakingNetwork.stashAddress,
        networkName: this.network,
      });
  }

  async getSoraFees() {
    const { StakingPayout } = await getSoraFees();

    this.fee = StakingPayout;
  }

  closeForm() {
    this.$emit('closeForm');
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) {
      this.getMyStakingInfo({ network: this.network });
      this.closeForm();
    }
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
    if (this.step === 2) {
      const rewardLessFee = FPNumber.lte(new FPNumber(this.summaryRewardsValue), new FPNumber(this.feeValue));

      if (rewardLessFee) this.showWarningPopup = true;
      else this.showConfirmationPasswordPopup = true;
    } else this.step += 1;
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
