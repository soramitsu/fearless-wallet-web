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
          <PoolHeader
            v-if="step === 1 || step === 3 || step === 4"
            :poolParams="poolParams"
            :step="step"
            :currency1="currency1"
            :currency2="currency2"
          />

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
            @update:amount1="updateAmount1"
            @update:amount2="updateAmount2"
          />

          <PoolDescription
            v-if="!showSettings && (step === 1 || step === 2 || step === 4)"
            :type="step === 2 ? 'add' : ''"
            :poolParams="poolParams"
            :amount1="amount1"
            :amount2="amount2"
            :slippage="slippage"
            :showAdditionalInfo="step === 2 || step === 4"
          />

          <div v-if="step === 3">
            <DirectionContentForm
              :asset1="asset1"
              :asset2="asset2"
              :amount1="amount1"
              :amount2="amount2"
              :currency1="currency1"
              :currency2="currency2"
            />

            <ContentForm :height="225" :isStaticHeight="true" :bottomRightCorner="true">
              <PoolDescription
                :poolParams="poolParams"
                :amount1="amount1"
                :amount2="amount2"
                type="add"
                :showAdditionalInfo="true"
                :slippage="slippage"
              />
            </ContentForm>

            <Alert message="assets.slippageWarning" class="slippage-warning" />
          </div>

          <div v-else-if="step === 4">
            <InfoRow :text="asset1PooledStr" :value="asset1MyAmount" />

            <InfoRow :text="asset2PooledStr" :value="asset2MyAmount" />
          </div>
        </div>

        <div>
          <PolkaswapAlert v-if="!showSettings" />

          <div class="activity-buttons">
            <FButton
              v-if="showSecondBtn"
              width="260px"
              size="big"
              fontSize="big"
              class="remove-button"
              :text="btnSecondText"
              type="secondary"
              :border="false"
              @click="secondBtnHandler"
            />

            <FButton
              :width="widthConfirmBtn"
              size="big"
              fontSize="big"
              :text="btnText"
              :disabled="confirmBtnDisabled"
              @click="confirm"
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
import { Getter, Action } from 'vuex-class';
import type { GetAssetPrice, GetPoolsParamsProps, PoolParams } from '@/store';
import type { TokenGroup } from '@extension-base/background/types/types';
import PoolDescription from '@/screens/pools/PoolDescription.vue';
import PoolHeader from '@/screens/pools/PoolHeader.vue';
import InputsForm from '@/screens/pools/InputsForm.vue';
import { type RequestPool } from '@/extension/background/extension-base/src/services/pools-service/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { getUtilityAsset, isValidAmountAsset } from '@/helpers/currencies';
import { type PoolsOperation } from '@/interfaces/pools';
import PolkaswapSettingsHeader from '@/screens/polkaswap/PolkaswapSettingsHeader.vue';
import PolkaswapSettings from '@/screens/polkaswap/PolkaswapSettings.vue';
import PolkaswapAlert from '@/screens/polkaswap/PolkaswapAlert.vue';
import { GettersTypes as PoolsGettersTypes } from '@/store/pools/getters';
import { isSameString } from '@/helpers';
import { ActionTypes as PoolsActionTypes } from '@/store/pools/actions';
import { type AsyncFn } from '@/interfaces';

@Component({
  components: {
    InputsForm,
    PoolHeader,
    PolkaswapAlert,
    PoolDescription,
    PolkaswapSettings,
    PolkaswapSettingsHeader,
  },
})
export default class PoolDetails extends Vue {
  step = 1;
  amount1 = '';
  amount2 = '';
  extrinsicType: PoolsOperation | null = null;
  slippage = 0.5;
  temporarySlippage = 0.5;
  showSettings = false;
  fee = ''; // TODO нужна ли fee?

  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];
  @Getter(PoolsGettersTypes.poolsItems) poolsItems!: PoolParams[];
  @Getter(PoolsGettersTypes.myPoolsItems) myPoolsItems!: PoolParams[];
  @Action(PoolsActionTypes.GET_POOLS_PARAMS) getPoolsParams!: AsyncFn<GetPoolsParamsProps>;

  get poolParams() {
    return [...this.poolsItems, ...this.myPoolsItems].find(
      ({ asset1, asset2 }) => isSameString(asset1.name, this.asset1) && isSameString(asset2.name, this.asset2)
    );
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
    return this.$n(+(this.poolParams?.asset1.myAmount ?? 0), 'decimal');
  }

  get asset2MyAmount() {
    return this.$n(+(this.poolParams?.asset2.myAmount ?? 0), 'decimal');
  }

  get asset1PooledStr() {
    return this.$t('pools.yourPooled', { asset: this.asset1.toUpperCase() });
  }

  get asset2PooledStr() {
    return this.$t('pools.yourPooled', { asset: this.asset2.toUpperCase() });
  }

  get utilityCurrency() {
    return getUtilityAsset(this.balances, this.network);
  }

  get utilityAssetPrice() {
    const priceId = this.utilityCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get feeValue() {
    return getCostOfAssets(this.fee, this.utilityAssetPrice).toString();
  }

  get currency1() {
    return this.balances.find(({ groupId }) => isSameString(groupId, this.poolParams?.asset1.id));
  }

  get currency2() {
    return this.balances.find(({ groupId }) => isSameString(groupId, this.poolParams?.asset2.id));
  }

  get amount1AssetPrice() {
    const priceId = this.currency1?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get amount1Value() {
    return getCostOfAssets(this.amount1, this.amount1AssetPrice).toString();
  }

  get showConfirmationPasswordPopup() {
    return this.extrinsicType !== null;
  }

  get isValidAsset1() {
    return isValidAmountAsset(this.currency1, this.network, this.fee, this.amount1);
  }

  get isValidAsset2() {
    return isValidAmountAsset(this.currency2, this.network, this.fee, this.amount2);
  }

  get confirmBtnDisabled() {
    if (this.step === 1 || this.step === 4) return false;

    // TODO
    if (this.step === 2) return false;

    if (this.fee === '' || !this.isValidAsset1 || !this.isValidAsset2 || +this.amount1 === 0 || +this.amount2 === 0)
      return true;

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

    if (this.step === 2) return 'common.confirm';

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

    return this.poolParams?.isMyPool;
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

    if (this.step === 2) return this.$t('pools.supplyLiquidity');

    if (this.step === 3) return this.$t('pools.confirmSupply');

    return '';
  }

  get tx() {
    // todo
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
    if (this.poolsItems.length === 0 && this.myPoolsItems.length === 0) await this.getPoolsParams();

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
    else if (this.step === 2 && this.poolParams?.isMyPool) this.step = 4;
    else this.step -= 1;
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
      this.confirm();

      return;
    }

    this.extrinsicType === 'removeLiquidity';
  }

  updateAmount1(value: string) {
    this.amount1 = value;
  }

  updateAmount2(value: string) {
    this.amount2 = value;
  }

  confirm() {
    if (this.showSettings) {
      this.slippage = this.temporarySlippage;
      this.showSettings = false;

      return;
    }

    if (this.step === 4) this.step = 2;
    else if (this.step === 3) this.extrinsicType === 'addLiquidity';
    else this.step += 1;
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.extrinsicType = null;

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

  .slippage-warning {
    margin-top: 10px;
  }
}
</style>
