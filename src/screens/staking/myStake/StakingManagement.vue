<template>
  <AboveForm :fullScreen="true" :header="header" :closeHandler="closeForm">
    <div class="staking-management">
      <div>
        <StakingForm v-if="isStaking" />

        <UnstakingForm v-else-if="isUnstaking" :currency="currency" />

        <RedeemForm v-else-if="isRedeeam" />

        <ConfirmationPasswordPopup
          v-if="showConfirmationPasswordPopup"
          :currency="currency"
          :amount="amount"
          :value="value"
          :firstIcon="assetId"
          extrinsicType="staking"
          @close="confirmationPasswordPopupClose"
        />
      </div>

      <Button width="100%" text="common.confirm" size="big" fontSize="big" @click="confirm" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetPrice } from '@/store';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import StakingForm from '@/screens/staking/myStake/StakingForm.vue';
import RedeemForm from '@/screens/staking/myStake/RedeemForm.vue';
import UnstakingForm from '@/screens/staking/myStake/UnstakingForm.vue';

@Component({
  components: {
    RedeemForm,
    StakingForm,
    UnstakingForm,
  },
})
export default class StakingManagement extends Vue {
  showConfirmationPasswordPopup = false;
  amount = '';

  @Prop({ type: String }) assetId!: string;
  @Prop({ type: String }) type!: 'staking' | 'unstaking' | 'redeeam';
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
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
    return this.type === 'redeeam';
  }

  get currency() {
    return this.balances.find(({ assetId }) => assetId === this.assetId);
  }

  get assetPrice() {
    const priceId = this.currency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get value() {
    return +this.amount * this.assetPrice;
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
}
</script>

<style lang="scss" scoped>
.staking-management {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
}
</style>
