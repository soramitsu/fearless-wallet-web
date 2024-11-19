<template>
  <AboveForm :fullScreen="true" @closeHandler="closeForm">
    <template v-slot:header>
      <PolkaswapSettingsHeader
        :showSettings="showSettings"
        :showPolkaswapIcon="showPolkaswapIcon"
        :showBackIcon="showBackIcon"
        :showCloseIcon="showCloseIcon"
        :showBackMock="step === 1"
        :settingHide="step !== 2"
        :header="header"
        @back="handlerBack"
        @toggleSettingsVisibility="toggleSettingsVisibility"
        @closeForm="closeForm"
      />
    </template>

    <Scroll>
      <div class="pool-details">
        <div>
          <PoolHeader v-if="step === 1 || step === 3 || step === 4" :poolParams="poolParams" :step="step" />

          <PolkaswapSettings
            v-if="showSettings"
            :slippage="slippage"
            :temporarySlippage="temporarySlippage"
            @update:temporarySlippage="updateSlippage"
          />

          <InputsForm
            v-else-if="step === 2"
            :poolParams="poolParams"
            :amount1="amount1"
            :amount2="amount2"
            :currency1="currency1"
            :currency2="currency2"
            :fee="fee"
            :extrinsicType="extrinsicType"
            :isExchangeB="isExchangeB"
            @update:amount1="updateAmount1"
            @update:amount2="updateAmount2"
            @update:isExchangeB="updateIsExchangeB"
          />

          <Alert v-if="showLiquidityWarning" message="pools.emptyLiquidityWarning" />

          <PoolDescription
            v-if="!showSettings && (step === 1 || step === 2 || step === 4)"
            :extrinsicType="step === 2 ? extrinsicType : ''"
            :poolParams="poolParams"
            :amount1="amount1"
            :amount2="amount2"
            :slippage="slippage"
            :showAdditionalInfo="step === 2 || step === 4"
            :fee="fee"
            :isExchangeB="isExchangeB"
          />

          <div v-if="step === 3">
            <DirectionContentForm
              :asset1="asset1"
              :asset2="asset2"
              :amount1="amount1"
              :amount2="amount2"
              :priceId1="poolParams?.asset1.priceId"
              :priceId2="poolParams?.asset2.priceId"
              icon="plus-pink"
            />

            <ContentForm :height="225" :isStaticHeight="true" :bottomRightCorner="true">
              <PoolDescription
                :poolParams="poolParams"
                :amount1="amount1"
                :amount2="amount2"
                :showAdditionalInfo="true"
                :slippage="slippage"
                :fee="fee"
                :extrinsicType="extrinsicType"
              />
            </ContentForm>

            <Alert message="assets.slippageWarning" class="warning" />

            <Alert v-if="extrinsicType === 'removeLiquidity'" message="pools.removeWarning" class="warning" />
          </div>

          <div v-else-if="step === 4">
            <InfoRow :text="asset1PooledStr" :value="asset1MyAmount" />

            <InfoRow :text="asset2PooledStr" :value="asset2MyAmount" />
          </div>
        </div>

        <div>
          <PolkaswapAlert v-if="!showSettings" class="warning" />

          <div class="activity-buttons">
            <FButton
              v-if="showSecondBtn"
              width="260px"
              size="big"
              fontSize="big"
              class="remove-button"
              data-testid="activityBtn"
              :text="btnSecondText"
              type="secondary"
              :border="false"
              @click="secondBtnHandler"
            />

            <FButton
              :width="widthConfirmBtn"
              size="big"
              fontSize="big"
              data-testid="supplyBtn"
              :text="btnText"
              :disabled="confirmBtnDisabled"
              @click="supply"
            />
          </div>
        </div>
      </div>
    </Scroll>

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="currency1"
      :amount="amount1"
      :value="amount1Value"
      :fee="fee"
      :feeValue="feeValue"
      :firstIcon="icon1"
      :secondIcon="icon2"
      :tx="tx"
      :extrinsicType="extrinsicType"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import PoolDescription from '@/screens/pools/PoolDescription.vue';
import PoolHeader from '@/screens/pools/PoolHeader.vue';
import InputsForm from '@/screens/pools/InputsForm.vue';
import { type RequestPool } from '@/extension/background/extension-base/src/services/pools-service/types';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { getUtilityAsset, getXORCurrency, isValidAmountAsset } from '@/helpers/currencies';
import { type PoolsOperation } from '@/interfaces/pools';
import PolkaswapSettingsHeader from '@/screens/polkaswap/PolkaswapSettingsHeader.vue';
import PolkaswapSettings from '@/screens/polkaswap/PolkaswapSettings.vue';
import PolkaswapAlert from '@/screens/polkaswap/PolkaswapAlert.vue';
import { isSameString } from '@/helpers';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { usePoolsStore } from '@/stores/pools';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component({
  components: {
    InputsForm,
    PoolHeader,
    PolkaswapAlert,
    PoolDescription,
    PolkaswapSettings,
    PolkaswapSettingsHeader,
    ConfirmationPasswordPopup,
  },
})
export default class PoolDetails extends Vue {
  accountsStore = useAccountsStore();
  networksStore = useNetworksStore();
  poolsStore = usePoolsStore();
  step = 1; // step 1 = pool preview, step 2 = add/remove liquidity, step 3 = add/remove preview, step 4 = my pool
  amount1 = '';
  amount2 = '';
  extrinsicType: PoolsOperation | '' = '';
  slippage = 0.5;
  temporarySlippage = 0.5;
  showSettings = false;
  showConfirmationPasswordPopup = false;
  isExchangeB = false;

  get fee() {
    if (!this.networksStore.soraFees) return '';

    return this.extrinsicType === 'addLiquidity'
      ? this.networksStore.soraFees?.AddLiquidity
      : this.networksStore.soraFees?.RemoveLiquidity;
  }

  get poolParams() {
    return [...this.poolsStore.poolsItems, ...this.poolsStore.myPoolsItems].find(
      ({ asset1, asset2 }) => isSameString(asset1.name, this.asset1) && isSameString(asset2.name, this.asset2)
    );
  }

  get showLiquidityWarning() {
    return this.step === 2 && this.poolParams?.asset1.reserve === '0' && this.poolParams?.asset2.reserve === '0';
  }

  get splitPoolName() {
    return this.$route.params.poolName.split('-');
  }

  get asset1() {
    return this.splitPoolName[0];
  }

  get asset2() {
    return this.splitPoolName[1];
  }

  get showPolkaswapIcon() {
    return this.step === 2 && !this.showSettings;
  }

  get network() {
    return this.poolParams?.network ?? '';
  }

  get asset1MyAmount() {
    return this.$n(+(this.poolParams?.asset1.tokenBalance ?? 0), 'decimal');
  }

  get asset2MyAmount() {
    return this.$n(+(this.poolParams?.asset2.tokenBalance ?? 0), 'decimal');
  }

  get asset1PooledStr() {
    return this.$t('pools.yourPooled', { asset: this.asset1.toUpperCase() });
  }

  get asset2PooledStr() {
    return this.$t('pools.yourPooled', { asset: this.asset2.toUpperCase() });
  }

  get utilityCurrency() {
    return getUtilityAsset(this.accountsStore.balances, this.network);
  }

  get utilityAssetPrice() {
    const priceId = this.utilityCurrency?.priceId ?? '';

    return this.networksStore.getAssetPrice(priceId).price;
  }

  get feeValue() {
    return getCostOfAssets(this.fee, this.utilityAssetPrice).toString();
  }

  get currency1() {
    return this.accountsStore.balances.find(({ groupId }) => isSameString(groupId, this.poolParams?.asset1.id));
  }

  get currency2() {
    return this.accountsStore.balances.find(({ groupId }) => isSameString(groupId, this.poolParams?.asset2.id));
  }

  get amount1AssetPrice() {
    const priceId = this.poolParams?.asset1.priceId ?? '';

    return this.networksStore.getAssetPrice(priceId).price;
  }

  get amount1Value() {
    return getCostOfAssets(this.amount1, this.amount1AssetPrice).toString();
  }

  get currencyXOR() {
    return getXORCurrency(this.accountsStore.balances);
  }

  get isValidAsset1() {
    // для remove транзакции баланс, это баланс пула
    const poolCurrency =
      this.extrinsicType === 'removeLiquidity'
        ? {
            ...this.currency1!,
            balances: this.currency1!.balances.map((item) => ({
              ...item,
              transferable: this.poolParams?.asset1.tokenBalance,
            })),
          }
        : this.currency1;

    const isValid = isValidAmountAsset(poolCurrency, this.network, '0', this.amount1);

    if (!isValid) return false;

    return isValidAmountAsset(this.currencyXOR, this.network, this.fee, '0');
  }

  get isValidAsset2() {
    // для remove транзакции баланс, это баланс пула
    const poolCurrency =
      this.extrinsicType === 'removeLiquidity'
        ? {
            ...this.currency2!,
            balances: this.currency2!.balances.map((item) => ({
              ...item,
              transferable: this.poolParams?.asset2.tokenBalance,
            })),
          }
        : this.currency2;

    const isValid = isValidAmountAsset(poolCurrency, this.network, '0', this.amount2);

    if (!isValid) return false;

    return isValidAmountAsset(this.currencyXOR, this.network, this.fee, '0');
  }

  get confirmBtnDisabled() {
    if (this.showSettings) return false;

    if (this.step === 1 || this.step === 4) return false;

    if (this.step === 2) {
      if (+this.amount1 === 0 && +this.amount2 === 0) return true;

      if (!this.isValidAsset1 || !this.isValidAsset2) return true;

      return this.fee === '';
    }

    return false;
  }

  get btnSecondText() {
    if (this.showSettings) return 'assets.resetToDefault';

    return 'pools.remove';
  }

  get btnText() {
    if (this.showSettings) return 'common.save';

    if (this.step === 1) return 'pools.supply';

    if (this.step === 2) return 'assets.preview';

    if (this.step === 3) return 'common.confirm';

    return 'pools.supply';
  }

  get widthConfirmBtn() {
    return this.showSecondBtn ? '260px' : '530px';
  }

  get showCloseIcon() {
    if (this.showSettings) return true;

    return this.step !== 2;
  }

  get showBackIcon() {
    if (this.showSettings) return false;

    if (this.step === 4) return false;

    return this.step !== 1;
  }

  get showSecondBtn() {
    if (this.showSettings) return true;

    return this.poolParams?.isMyPool && this.step === 4;
  }

  get icon1() {
    return this.poolParams?.asset1.icon;
  }

  get icon2() {
    return this.poolParams?.asset2.icon;
  }

  get header() {
    if (this.showSettings) return this.$t('assets.poolSettings');

    if (this.step === 1 || this.step === 4) return this.$t('pools.poolDetails');

    if (this.step === 2) {
      if (this.extrinsicType === 'addLiquidity') return this.$t('pools.supplyLiquidity');

      return this.$t('pools.removeLiquidity');
    }

    if (this.step === 3) return this.$t('pools.confirmSupply');

    return '';
  }

  get tx() {
    return {
      amount1: this.amount1,
      amount2: this.amount2,
      assetId1: this.poolParams?.asset1.id,
      assetId2: this.poolParams?.asset2.id,
      networkName: this.network,
      slippage: this.slippage,
    } as RequestPool;
  }

  async created() {
    if (this.poolsStore.poolsItems.length === 0 && this.poolsStore.myPoolsItems.length === 0)
      await this.poolsStore.getPoolsParams();

    if (this.poolParams?.isMyPool) this.step = 4;
  }

  toggleSettingsVisibility() {
    if (this.step !== 2) this.closeForm();
    else if (this.step === 2) {
      this.showSettings = !this.showSettings;
      this.temporarySlippage = this.slippage;
    }
  }

  handlerBack() {
    if (this.showSettings || this.step === 1) return;

    if (this.step === 2 && this.poolParams?.isMyPool) {
      this.step = 4;
      this.amount1 = '';
      this.amount2 = '';
    } else this.step -= 1;
  }

  closeForm() {
    if (this.showSettings) {
      this.toggleSettingsVisibility();

      return;
    }

    this.$router.back();
  }

  secondBtnHandler() {
    if (this.showSettings) {
      this.temporarySlippage = 0.5;
      this.supply();

      return;
    }

    this.step = 2;
    this.extrinsicType = 'removeLiquidity';
  }

  updateIsExchangeB(value: boolean) {
    this.isExchangeB = value;
  }

  updateAmount1(value: string) {
    this.amount1 = value;
  }

  updateAmount2(value: string) {
    this.amount2 = value;
  }

  supply() {
    if (this.showSettings) {
      this.slippage = this.temporarySlippage;
      this.showSettings = false;

      return;
    }

    if (this.step === 1 || this.step === 4) {
      this.step = 2;
      this.extrinsicType = 'addLiquidity';

      return;
    }

    if (this.step === 3) this.showConfirmationPasswordPopup = true;
    else this.step += 1;
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.showConfirmationPasswordPopup = false;

    if (closeForm) this.closeForm();
  }

  updateSlippage(value: number) {
    this.temporarySlippage = value;
  }
}
</script>

<style lang="scss" scoped>
.pool-details {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .activity-buttons {
    display: flex;
    margin: 15px 0 1px;
  }

  .remove-button {
    margin-right: 10px;
  }

  .warning {
    margin-top: 10px;
  }
}
</style>
