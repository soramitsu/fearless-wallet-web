<template>
  <Fragment>
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
      :maxNominations="maxNominations"
      :stakingNetwork="stakingNetwork"
      :stakingCurrency="stakingCurrency"
      :selectedValidator="selectedValidator"
      @updateSelectedValidators="updateSelectedValidators"
      @openFiltersPopup="toggleFiltersPopupVisibility"
      @openValidatorInfo="$emit('openValidatorInfo', $event)"
    />

    <FiltersPopup
      v-if="showFiltersPopup"
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
      @handlerClose="toggleFiltersPopupVisibility"
    />
  </Fragment>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import SuggestedValidatorDisclaimer from '@/screens/staking/myStake/validators/SuggestedValidatorDisclaimer.vue';
import OfferValidators from '@/screens/staking/myStake/validators/OfferValidators.vue';
import SelectValidator from '@/screens/staking/myStake/validators/SelectValidator.vue';
import FiltersPopup from '@/screens/staking/myStake/validators/FiltersPopup.vue';

export default defineComponent({ name: 'SelectionValidatorsForm',
  components: {
    FiltersPopup,
    OfferValidators,
    SelectValidator,
    SuggestedValidatorDisclaimer,
  },
  props: {
    step: { type: Number },
    validators: { type: Array },
    maxNominations: { type: Number },
    stakingNetwork: { type: Object },
    stakingCurrency: { type: Object },
    selectedValidator: { type: Object },
  },
  data() {
    return {
      showFiltersPopup: false,
      onchainIdentity: false,
      notSlashed: false,
      notOversubscribed: false,
      limitValidatorsIdentity: false,
      sortByApy: true,
    };
  },
  methods: {
    openValidatorList(isSuggested: boolean) {
      this.$emit('openValidatorList', isSuggested);
    },
    toggleFiltersPopupVisibility() {
      this.showFiltersPopup = !this.showFiltersPopup;
    },
    updateSelectedValidators(value: boolean, address: string) {
      this.$emit('updateSelectedValidators', value, address);
    },
    updateOnchainIdentity(value: boolean) {
      this.onchainIdentity = value;
    },
    updateNotSlashed(value: boolean) {
      this.notSlashed = value;
    },
    updateNotOversubscribed(value: boolean) {
      this.notOversubscribed = value;
    },
    updateLimitValidatorsIdentity(value: boolean) {
      this.limitValidatorsIdentity = value;
    },
    updateSortByApy(value: boolean) {
      this.sortByApy = value;
    },
  },
});
</script>
