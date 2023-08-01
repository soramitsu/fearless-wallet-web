<template>
  <div class="staking-form">
    <template v-if="step === 1">
      <InfoRow
        text="staking.payout"
        :value="`${payout} ${rewardedAsset}`"
        :price="payoutValueString"
        borderType="default"
        icon="info"
        :iconClasses="['payout']"
      />

      <Hint class="hint" iconName="notification" :text="text" />

      <Input v-model="payoutAccount" placeholder="staking.payoutAccount" size="big" />

      <Tooltip text="staking.payout" target=".payout" placement="right" />
    </template>

    <template v-if="step === 1 || step === 6">
      <InfoRow
        text="staking.selectedValidators"
        :value="`${selectedQuantity} (${$t('common.max')} ${maxValidators})`"
        borderType="default"
      />

      <InfoRow
        text="assets.networkFee"
        :value="`${fee} ${stakingAsset}`"
        :price="feeValueString"
        borderType="default"
        icon="info"
        :iconClasses="['network-fee']"
      />

      <div class="about-rewards">
        {{ $t('staking.learnAboutRewards') }}
      </div>

      <Tooltip text="assets.networkFee" target=".network-fee" placement="right" />
    </template>

    <OfferValidators v-else-if="step === 2" @openValidatorsForm="openValidatorsForm" />

    <SuggestedValidatorDisclaimer v-else-if="step === 3" />

    <SelectValidator
      v-else-if="step === 4 || step === 5"
      :step="step"
      :onchainIdentity="onchainIdentity"
      :notSlashed="notSlashed"
      :limitValidatorsIdentity="limitValidatorsIdentity"
      :notOversubscribed="notOversubscribed"
      :sortByApy="sortByApy"
      :validators="validators"
      :maxValidators="maxValidators"
      @updateSelectedValidators="updateSelectedValidators"
      @openFiltersPopup="toggleFiltersPopupVisibility"
    />

    <FiltersPopup
      v-if="showFiltersPopup"
      :handlerClose="toggleFiltersPopupVisibility"
      :onchainIdentity="onchainIdentity"
      :notSlashed="notSlashed"
      :limitValidatorsIdentity="limitValidatorsIdentity"
      :notOversubscribed="notOversubscribed"
      :sortByApy="sortByApy"
      @update:onchainIdentity="updateOnchainIdentity"
      @update:notSlashed="updateNotSlashed"
      @update:notOversubscribed="updateNotOversubscribed"
      @update:limitValidatorsIdentity="updateLimitValidatorsIdentity"
      @update:sortByApy="updateSortByApy"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { validators } from './mock';
import type { GetAssetPrice } from '@/store';
import type { Validator } from '@/interfaces';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import SuggestedValidatorDisclaimer from '@/screens/staking/myStake/stakingForms/SuggestedValidatorDisclaimer.vue';
import OfferValidators from '@/screens/staking/myStake/stakingForms/OfferValidators.vue';
import SelectValidator from '@/screens/staking/myStake/stakingForms/SelectValidator.vue';
import FiltersPopup from '@/screens/staking/myStake/stakingForms/FiltersPopup.vue';

@Component({
  components: {
    FiltersPopup,
    OfferValidators,
    SelectValidator,
    SuggestedValidatorDisclaimer,
  },
})
export default class StakingForm extends Vue {
  state: Record<string, Validator> = {};
  payoutAccount = '';
  payout = '1';
  showFiltersPopup = false;
  onchainIdentity = false;
  notSlashed = false;
  notOversubscribed = false;
  limitValidatorsIdentity = false;
  sortByApy = true;
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
    return this.validators.filter(({ isSelect }) => isSelect).length;
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

    if (this.step === 4)
      this.validators = this.validators.map((validator) => {
        return { ...validator, isSelect: !!validator.isRecommended };
      });
  }

  openValidatorsForm(isSuggested: boolean) {
    this.$emit('confirm', isSuggested ? 3 : 5);
  }

  toggleFiltersPopupVisibility() {
    this.showFiltersPopup = !this.showFiltersPopup;
  }

  updateSelectedValidators(value: boolean, address: string) {
    this.state[address].isSelect = value;
  }

  updateOnchainIdentity(value: boolean) {
    this.onchainIdentity = value;
  }

  updateNotSlashed(value: boolean) {
    this.notSlashed = value;
  }

  updateNotOversubscribed(value: boolean) {
    this.notOversubscribed = value;
  }

  updateLimitValidatorsIdentity(value: boolean) {
    this.limitValidatorsIdentity = value;
  }

  updateSortByApy(value: boolean) {
    this.sortByApy = value;
  }
}
</script>

<style lang="scss" scoped>
.staking-form {
  .hint {
    padding: $default-padding;
  }

  .about-rewards {
    color: $pink-lavender-color;
    text-decoration: underline;
    margin: 20px 16px 16px;
    text-align: left;
    cursor: pointer;
  }
}
</style>
