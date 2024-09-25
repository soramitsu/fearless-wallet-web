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
              <div class="descriptions" data-testid="validatorsPayoutRewards">
                {{ $t('staking.validatorsPayoutRewards') }}
              </div>

              <ValidatorItem
                v-for="validator in myRewards"
                :key="validator.address"
                :validator="validator"
                :rewardedCurrency="rewardedCurrency"
                @openValidatorInfo="$emit('openValidatorInfo', $event)"
              />
            </Scroll>
          </div>
        </ContentForm>

        <div v-else-if="step === 2">
          <FInput
            :value="selectedAccountName"
            placeholder="accounts.account"
            data-testid="account"
            size="big"
            :readonly="true"
          />

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

          <FInput
            :value="payeeName"
            :readonly="true"
            placeholder="staking.setPayee"
            data-testid="setPayee"
            size="big"
          />
        </div>

        <InfoRow
          text="assets.networkFee"
          :value="`${fee} ${stakingAssetName}`"
          :price="feeValueString"
          borderType="default"
          icon="info"
          :iconClasses="['network-fee']"
        />

        <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
      </div>

      <FButton
        width="100%"
        size="big"
        fontSize="big"
        data-testid="confirmBtn"
        :disabled="disabledBtn"
        :text="btnText"
        @click="confirm"
      />
    </div>

    <WarningPopup v-if="showWarningPopup" :handlerAccept="handlerAccept" :handlerClose="closeWarningPopup" />

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="stakingCurrency"
      :amount="summaryRewards"
      :value="summaryRewardsValue"
      :fee="fee"
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
import { type PayoutRewards, type RewardsResponse } from '@extension-base/services/staking-service/types';
import type { GetAssetPrice, GetStakingNetworkProps, NetworkParams, SelectedWallet } from '@/store';
import type { TokenGroup } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import ValidatorItem from '@/screens/staking/myStake/rewards/ValidatorItem.vue';
import WarningPopup from '@/screens/staking/myStake/rewards/WarningPopup.vue';
import { getPayoutsFee, fetchBalance, getRewards } from '@/extension/messaging';
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

  @Prop({ type: Object }) stakingCurrency!: TokenGroup;
  @Prop({ type: Object }) rewardedCurrency!: TokenGroup;
  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Action(StakingActionTypes.GET_MY_STAKING_INFO) getMyStakingInfo!: AsyncFn<GetStakingNetworkProps>;

  get network() {
    return this.stakingNetwork.network;
  }

  get selectedAccountName() {
    return this.selectedWallet.name;
  }

  get btnText() {
    if (this.step === 1) return 'staking.payoutAll';

    if (!this.isValidAmountAsset)
      return { text: 'assets.insufficientBalance', localeProps: { asset: this.stakingAssetName.toUpperCase() } };

    return 'common.confirm';
  }

  get disabledBtn() {
    if (this.step === 1) return this.myRewards.length === 0;

    return !this.isValidAmountAsset;
  }

  get isValidAmountAsset() {
    // для controller аккаунта подставляем баланс stash аккаунта
    const stakingCurrency: TokenGroup = this.stakingNetwork.isController
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

  get myRewards() {
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
    return this.rewardedCurrency!.groupId;
  }

  get stakingAssetId() {
    return this.stakingCurrency!.groupId;
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
    return getCostOfAssets(this.fee, this.stakingAssetPrice).toString();
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
    await this.getRewards();

    this.getPayoutsFee();

    if (this.stakingNetwork.isController)
      this.stashBalance = await fetchBalance({
        address: this.stakingNetwork.stashAddress,
        networkName: this.network,
      });
  }

  async getRewards() {
    this.showLoader = true;

    this.rewards = await getRewards({
      address: this.stakingNetwork.stashAddress,
      network: this.network,
    });

    this.showLoader = false;
  }

  async getPayoutsFee() {
    this.fee = await getPayoutsFee({ payouts: this.rewards.payouts, network: this.network });
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

    this.showConfirmationPasswordPopup = true;
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
    font-size: 0.875em;
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
