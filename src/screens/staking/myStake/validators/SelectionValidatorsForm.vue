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
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { SelectionValidator } from '@/interfaces';
import type { NetworkParams } from '@/store';
import type { FWValidatorInfoFull } from '@extension-base/services/staking-service/types';
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
  @Prop({ type: Number }) maxNominations!: number;
  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @Prop({ type: Object }) stakingCurrency!: TokenGroup;
  @Prop({ type: Object }) selectedValidator!: FWValidatorInfoFull;

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
