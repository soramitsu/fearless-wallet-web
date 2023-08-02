<template>
  <div>
    <OfferValidators v-if="step === 2" @openValidatorList="openValidatorList" />

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
import type { SelectionValidator } from '@/interfaces';
import SuggestedValidatorDisclaimer from '@/screens/staking/myStake/validators/SuggestedValidatorDisclaimer.vue';
import OfferValidators from '@/screens/staking/myStake/validators/OfferValidators.vue';
import SelectValidator from '@/screens/staking/myStake/validators/SelectValidator.vue';
import FiltersPopup from '@/screens/staking/myStake/validators/FiltersPopup.vue';

@Component({
  components: {
    FiltersPopup,
    OfferValidators,
    SelectValidator,
    SuggestedValidatorDisclaimer,
  },
})
export default class SelectionValidatorsForm extends Vue {
  showFiltersPopup = false;
  onchainIdentity = false;
  notSlashed = false;
  notOversubscribed = false;
  limitValidatorsIdentity = false;
  sortByApy = true;

  @Prop({ type: Number }) step!: number;
  @Prop({ type: Array }) validators!: SelectionValidator[];
  @Prop({ type: Number }) maxValidators!: number;

  openValidatorList(isSuggested: boolean) {
    this.$emit('openValidatorList', isSuggested);
  }

  toggleFiltersPopupVisibility() {
    this.showFiltersPopup = !this.showFiltersPopup;
  }

  updateSelectedValidators(value: boolean, address: string) {
    this.$emit('updateSelectedValidators', value, address);
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
