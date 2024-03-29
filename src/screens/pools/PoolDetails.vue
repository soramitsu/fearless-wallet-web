<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :header="header"
    @handlerBack="handlerBack"
    @closeHandler="closeForm"
  >
    <Scroll>
      <div class="pool-details">
        <div>
          <HeaderPool
            v-if="step === 1 || step === 3 || step === 4"
            :poolParams="poolParams"
            :step="step"
            :currency1="currency1"
            :currency2="currency2"
          />

          <InputsForm
            v-if="step === 2"
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
            v-if="step === 1 || step === 2 || step === 4"
            :poolParams="poolParams"
            :showShare="step === 2 || step === 4"
          />

          <div v-if="step === 3">33</div>

          <div v-else-if="step === 4">
            <InfoRow :text="asset1PooledStr" :value="asset1Amount" />

            <InfoRow :text="asset2PooledStr" :value="asset2Amount" />
          </div>

          <div v-if="step === 1 || step === 4">
            <ContentForm :height="100" :isStaticHeight="true" :bottomRightCorner="true">
              <div class="content-form">
                <div class="description">
                  {{ $t('pools.stakeYourPoolShare') }}
                </div>
              </div>
            </ContentForm>
          </div>
        </div>

        <div class="activity-buttons">
          <FButton
            v-if="showBtnRemove"
            width="260px"
            size="big"
            fontSize="big"
            class="remove-button"
            text="pools.remove"
            type="secondary"
            :border="false"
            @click="remove"
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
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import PoolDescription from './PoolDescription.vue';
import HeaderPool from './HeaderPool.vue';
import InputsForm from './InputsForm.vue';
import type { GetAssetPrice, PoolParams } from '@/store';
import type { TokenGroup } from '@extension-base/background/types/types';
import { type RequestPool } from '@/extension/background/extension-base/src/services/pools-service/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { getUtilityAsset, isValidAmountAsset } from '@/helpers/currencies';
import { type PoolsOperation } from '@/interfaces/pools';

@Component({
  components: {
    InputsForm,
    HeaderPool,
    PoolDescription,
  },
})
export default class PoolDetails extends Vue {
  step = 1;
  extrinsicType: PoolsOperation | null = null;
  amount1 = '';
  amount2 = '';
  fee = ''; // TODO нужна ли fee?

  @Prop({ type: Object }) poolParams!: PoolParams;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];

  get network() {
    return this.poolParams.network;
  }

  get asset1Amount() {
    return this.poolParams.asset1.myAmount;
  }

  get asset2Amount() {
    return this.poolParams.asset2.myAmount;
  }

  get asset1PooledStr() {
    return this.$t('pools.yourPooled', { asset: this.poolParams.asset1.name.toUpperCase() });
  }

  get asset2PooledStr() {
    return this.$t('pools.yourPooled', { asset: this.poolParams.asset2.name.toUpperCase() });
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
    return this.balances.find(({ groupId }) => groupId === this.poolParams.asset1.id);
  }

  get currency2() {
    return this.balances.find(({ groupId }) => groupId === this.poolParams.asset2.id);
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

  get btnText() {
    if (this.step === 1) return 'pools.supply';

    if (this.step === 2) return 'assets.preview';

    if (this.step === 2) return 'common.confirm';

    return 'pools.supply';
  }

  get widthConfirmBtn() {
    return this.showBtnRemove ? '260px' : '530px';
  }

  get showBackIcon() {
    return this.step === 2 || this.step === 3;
  }

  get showBtnRemove() {
    return this.poolParams.isMyPool;
  }

  get icon1() {
    return this.poolParams.asset1.icon;
  }

  get icon2() {
    return this.poolParams.asset2.icon;
  }

  get header() {
    if (this.step === 1) return 'pools.poolDetails';

    if (this.step === 2) return 'pools.supplyLiquidity';

    if (this.step === 3) return 'pools.confirmSupply';

    return '';
  }

  get tx() {
    // todo
    return {} as RequestPool;
  }

  created() {
    if (this.poolParams.isMyPool) this.step = 4;
  }

  handlerBack() {
    if (this.step === 2 && this.poolParams.isMyPool) this.step = 4;
    else this.step -= 1;
  }

  closeForm() {
    this.$emit('closePoolDetails');
  }

  remove() {
    this.extrinsicType === 'removeLiquidity';
  }

  updateAmount1(value: string) {
    this.amount1 = value;
  }

  updateAmount2(value: string) {
    this.amount2 = value;
  }

  confirm() {
    if (this.step === 4) this.step = 2;
    else if (this.step === 3) this.extrinsicType === 'addLiquidity';
    else this.step += 1;
  }

  confirmationPasswordPopupClose(closeForm: boolean) {
    this.extrinsicType = null;

    if (closeForm) this.closeForm();
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

  .content-form {
    padding: $default-padding;
  }

  .description {
    font-size: 14px;
    color: $default-white;
    text-align: left;
  }
}
</style>
