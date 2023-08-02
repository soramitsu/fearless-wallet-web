<template>
  <div class="staking-form">
    <template v-if="step === 1">
      <Hint class="hint" iconName="notification" :text="text" />

      <Input v-model="payoutAccount" placeholder="staking.payoutAccount" size="big" />

      <InfoRow
        text="staking.payout"
        :value="`${payout} ${rewardedAsset}`"
        :price="payoutValueString"
        borderType="default"
        icon="info"
        :iconClasses="['payout']"
      />

      <Tooltip text="staking.payout" target=".payout" placement="right" />
    </template>

    <InfoRow
      v-if="step === 6"
      text="staking.selectedValidators"
      :value="`${selectedQuantity} (${$t('common.max')} ${maxValidators})`"
      borderType="default"
    />

    <template v-if="step === 1 || step === 6">
      <InfoRow
        text="assets.networkFee"
        :value="`${fee} ${stakingAsset}`"
        :price="feeValueString"
        borderType="default"
        icon="info"
        :iconClasses="['network-fee']"
      />

      <Link text="staking.learnAboutRewards" class="about-rewards" @click="openAboutRewards" />

      <Tooltip text="assets.networkFee" target=".network-fee" placement="right" />
    </template>

    <SelectionValidatorsForm
      v-else
      :step="step"
      :validators="validators"
      :maxValidators="maxValidators"
      @openValidatorList="openValidatorList"
      @updateSelectedValidators="updateSelectedValidators"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { validators } from '../validators/mock';
import type { GetAssetPrice } from '@/store';
import type { SelectionValidator } from '@/interfaces';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import SelectValidator from '@/screens/staking/myStake/validators/SelectValidator.vue';
import FiltersPopup from '@/screens/staking/myStake/validators/FiltersPopup.vue';
import SelectionValidatorsForm from '@/screens/staking/myStake/validators/SelectionValidatorsForm.vue';

@Component({
  components: {
    FiltersPopup,
    SelectValidator,
    SelectionValidatorsForm,
  },
})
export default class StakingForm extends Vue {
  state: Record<string, SelectionValidator> = {};
  payoutAccount = '';
  payout = '1';
  validators = validators;

  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: Object }) rewardedCurrency!: TokenBalance;
  @Prop({ type: String }) fee!: string;
  @Prop({ type: Number }) step!: number;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;

  get text() {
    return {
      text: 'staking.minimumStake',
      localeProps: { value: this.minStake, asset: this.stakingAsset.toUpperCase() },
    };
  }

  get minStake() {
    return 10;
  }

  get stakingAsset() {
    return this.stakingCurrency.symbol;
  }

  get rewardedAsset() {
    return this.rewardedCurrency.symbol;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get rewardedAssetPrice() {
    const priceId = this.rewardedCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get payoutValueString() {
    const value = +this.payout * this.rewardedAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get feeValueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get maxValidators() {
    return 24;
  }

  get selectedQuantity() {
    return Object.values(this.state).filter(({ isSelect }) => isSelect).length;
  }

  mounted() {
    this.validators.forEach(({ name, address, apy, description, isSelect }) =>
      Vue.set(this.state, address, {
        name,
        address,
        apy,
        description,
        isSelect,
      })
    );
  }

  openValidatorList(isSuggested: boolean) {
    this.validators = this.validators.map((validator) => {
      const isSelect = isSuggested ? !!validator.isRecommended : false;

      return { ...validator, isSelect };
    });

    this.$emit('openValidatorList', isSuggested);
  }

  updateSelectedValidators(value: boolean, address: string) {
    this.state[address].isSelect = value;
  }

  openAboutRewards() {
    console.info('openAboutRewards');
  }
}
</script>

<style lang="scss" scoped>
.staking-form {
  .hint {
    padding: $default-padding;
  }

  .about-rewards {
    margin: 20px 16px 16px;
  }
}
</style>
