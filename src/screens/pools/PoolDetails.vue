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
        <div>test</div>

        <div class="activity-buttons">
          <BorderButton
            v-if="showBtnRemove"
            width="260px"
            size="big"
            fontSize="big"
            class="remove-button"
            text="pools.remove"
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
import type { GetAssetPrice, PoolsParams } from '@/store';
import type { TokenGroup } from '@extension-base/background/types/types';
import { type RequestPool } from '@/extension/background/extension-base/src/services/pools-service/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { getUtilityAsset } from '@/helpers/currencies';
import { type PoolsOperation } from '@/interfaces/pools';

@Component({
  components: {},
})
export default class PoolDetails extends Vue {
  step = 1;
  extrinsicType: PoolsOperation | null = null;
  amount1 = '';
  amount2 = '';
  fee = '';

  @Prop({ type: Object }) poolsParams!: PoolsParams;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];

  get utilityCurrency() {
    return getUtilityAsset(this.balances, this.poolsParams.network);
  }

  get utilityAssetPrice() {
    const priceId = this.utilityCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get feeValue() {
    return getCostOfAssets(this.fee, this.utilityAssetPrice).toString();
  }

  get currency1() {
    return this.balances.find(({ groupId }) => groupId === this.poolsParams.asset1.id);
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

  get confirmBtnDisabled() {
    if (this.step === 1) return false;

    if (this.step === 2) return true;

    return false;
  }

  get btnText() {
    if (this.step === 1) return 'pools.supply';

    if (this.step === 2) return 'common.preview';

    return 'common.confirm';
  }

  get widthConfirmBtn() {
    return this.showBtnRemove ? '260px' : '530px';
  }

  get showBackIcon() {
    return this.step !== 1;
  }

  get showBtnRemove() {
    return this.poolsParams.isMyPool;
  }

  get icon1() {
    return this.poolsParams.asset1.icon;
  }

  get icon2() {
    return this.poolsParams.asset2.icon;
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

  handlerBack() {
    this.step -= 1;
  }

  closeForm() {
    this.$emit('closePoolDetails');
  }

  remove() {
    this.extrinsicType === 'removeLiquidity';
  }

  confirm() {
    if (this.step === 3) this.extrinsicType === 'addLiquidity';
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
    margin-bottom: 1px;
  }

  .remove-button {
    margin-right: 10px;
  }
}
</style>
