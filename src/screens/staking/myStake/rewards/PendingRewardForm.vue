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
              <p v-if="recoveryOnly" class="descriptions" :lang="$i18n.locale === 'ru-RU' ? 'ru' : 'en'" role="note">{{ recoveryRewardsDescription }}</p>
              <p v-if="loadError" class="descriptions" role="alert">{{ loadError }}</p>
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
          <p v-if="recoveryOnly" class="descriptions" :lang="$i18n.locale === 'ru-RU' ? 'ru' : 'en'" role="note">{{ recoveryRewardsDescription }}</p>
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
import { defineComponent } from 'vue';

import type { PayoutRewards } from '@extension-base/services/staking-service/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import { FPNumber } from '@/sora/number';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { getCostOfAssets } from '@/helpers/transfers';
import ValidatorItem from '@/screens/staking/myStake/rewards/ValidatorItem.vue';
import WarningPopup from '@/screens/staking/myStake/rewards/WarningPopup.vue';
import { getPayoutsFee, fetchBalance, getRewards } from '@/extension/messaging';
import { isValidAmountAsset } from '@/helpers/currencies';
import { useStakingStore } from '@/stores/staking';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { WalletEcosystem } from '@/interfaces';
import { useWalletRecovery } from '@/util/useWalletRecovery';
import { legacyWalletUpgradeMessages } from '@/locales/legacyWalletUpgrade';

export default defineComponent({ name: 'PendingRewardForm',
  setup: () => ({ recoveryOnly: useWalletRecovery() }),
  components: {
    WarningPopup,
    ValidatorItem,
    ConfirmationPasswordPopup,
  },
  props: {
    stakingCurrency: { type: Object },
    rewardedCurrency: { type: Object },
    stakingNetwork: { type: Object },
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      showConfirmationPasswordPopup: false,
      showWarningPopup: false,
      amount: '',
      step: 1,
      fee: '',
      stashBalance: '0',
      showLoader: false,
      loadError: '',
      rewards: { validators: [], payouts: [], sum: '0' },
      stakingStore: useStakingStore(),
    };
  },
  computed: {
    recoveryRewardsDescription() {
      return legacyWalletUpgradeMessages[this.$i18n.locale === 'ru-RU' ? 'ru-RU' : 'en-EN'].recoveryRewards;
    },
    network() {
      return this.stakingNetwork.network;
    },
    selectedAccountName() {
      return this.accountsStore.selectedWallet.name;
    },
    btnText() {
      if (this.step === 1) return 'staking.payoutAll';

          if (!this.isValidAmountAsset)
            return { text: 'assets.insufficientBalance', localeProps: { asset: this.stakingAssetName.toUpperCase() } };

          return 'common.confirm';
    },
    disabledBtn() {
      if (this.showLoader || this.loadError || !this.fee) return true;
      if (this.step === 1) return this.myRewards.length === 0;

          return !this.isValidAmountAsset;
    },
    isValidAmountAsset() {
      // Recovery fees are paid by the selected signer, including controllers.
          const stakingCurrency: TokenGroup = this.stakingNetwork.isController && !this.recoveryOnly
            ? {
                ...this.stakingCurrency,
                balances: this.stakingCurrency.balances.map((item) => ({ ...item, transferable: this.stashBalance })),
              }
            : this.stakingCurrency;

          return isValidAmountAsset(stakingCurrency, this.network, this.fee ?? '0', '0');
    },
    payeeName() {
      if (!this.recoveryOnly) return this.stakingNetwork.payeeName;
      const stashName = this.stakingNetwork.stashName || this.stakingNetwork.stashAddress || this.selectedAccountName;
      if (this.stakingNetwork.isController || (!this.stakingNetwork.isOtherController && this.stakingNetwork.controllerAddress)) return stashName;
      if (this.stakingNetwork.payeeAddress?.toLowerCase() === 'stash') return stashName;
      if (this.stakingNetwork.payeeAddress?.toLowerCase() === 'controller') return this.stakingNetwork.controllerName || this.stakingNetwork.controllerAddress;
      return this.stakingNetwork.payeeName;
    },
    myRewards() {
      return this.rewards?.validators;
    },
    summaryRewards() {
      return this.rewards.sum;
    },
    feeValueString() {
      return `${this.accountsStore.fiatSymbol}${this.$n(+this.feeValue, 'price')}`;
    },
    stakingAssetName() {
      return this.stakingCurrency?.symbol;
    },
    rewardedAssetName() {
      return this.rewardedCurrency?.symbol;
    },
    showBackIcon() {
      return this.step !== 1;
    },
    header() {
      if (this.step === 1) return 'staking.pendingRewards';

          if (this.step === 2) return 'common.confirmation';

          return '';
    },
    rewardedAssetId() {
      return this.rewardedCurrency!.groupId;
    },
    stakingAssetId() {
      return this.stakingCurrency!.groupId;
    },
    stakingAssetPrice() {
      const priceId = this.stakingCurrency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    rewardedAssetPrice() {
      const priceId = this.rewardedCurrency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    feeValue() {
      return getCostOfAssets(this.fee, this.stakingAssetPrice).toString();
    },
    summaryRewardsValue() {
      return getCostOfAssets(this.summaryRewards, this.rewardedAssetPrice).toString();
    },
    tx() {
      return {
            payouts: this.rewards.payouts,
            from: this.accountsStore.selectedWallet.address,
            networkName: this.network,
          } as PayoutRewards;
    },
  },
  async created() {
    try {
      await this.getRewards();

      if (this.rewards.payouts.length) await this.getPayoutsFee();

      if (this.stakingNetwork.isController && !this.recoveryOnly) {
          const balances = await fetchBalance({
            address: this.stakingNetwork.stashAddress,
            networks: [this.network],
            walletEcosystem: WalletEcosystem.Substrate,
          });
        this.stashBalance = balances[0].balance;
      }
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error);
    } finally {
      this.showLoader = false;
    }
  },
  methods: {
    async getRewards() {
      this.showLoader = true;

          this.rewards = await getRewards({
            address: this.stakingNetwork.stashAddress || this.accountsStore.selectedWallet.address,
            network: this.network,
          });

    },
    async getPayoutsFee() {
      this.fee = await getPayoutsFee({ payouts: this.rewards.payouts, network: this.network });
    },
    closeForm() {
      this.$emit('closeForm');
    },
    confirmationPasswordPopupClose(closeForm: boolean) {
      this.showConfirmationPasswordPopup = false;

          if (closeForm) {
            void this.stakingStore.getMyStakingInfo({ network: this.network }).catch((error) => console.warn('Unable to refresh staking details', error));
            this.closeForm();
          }
    },
    handlerBack() {
      this.step -= 1;
    },
    handlerAccept() {
      this.step = 2;

          this.closeWarningPopup();

          this.showConfirmationPasswordPopup = true;
    },
    closeWarningPopup() {
      this.showWarningPopup = false;
    },
    confirm() {
      if (this.disabledBtn) return;
      if (this.step === 2) {
            const rewardLessFee = FPNumber.lte(new FPNumber(this.summaryRewardsValue), new FPNumber(this.feeValue));

            if (rewardLessFee) this.showWarningPopup = true;
            else this.showConfirmationPasswordPopup = true;
          } else this.step += 1;
    },
  },
});
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
