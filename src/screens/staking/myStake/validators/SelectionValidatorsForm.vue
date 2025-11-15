<template>
  <OfferValidators v-if="step === 2" @openValidatorList="onOpenValidatorList" />

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
    @updateSelectedValidators="onUpdateSelectedValidators"
    @openFiltersPopup="toggleFiltersPopupVisibility"
    @openValidatorInfo="onOpenValidatorInfo"
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
</template>

<script lang="ts" setup>
import { ref, toRefs } from 'vue';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { SelectionValidator } from '@/interfaces';
import type { NetworkParams } from '@/stores';
import type { FWValidatorInfoFull } from '@extension-base/services/staking-service/types';
import SuggestedValidatorDisclaimer from '@/screens/staking/myStake/validators/SuggestedValidatorDisclaimer.vue';
import OfferValidators from '@/screens/staking/myStake/validators/OfferValidators.vue';
import SelectValidator from '@/screens/staking/myStake/validators/SelectValidator.vue';
import FiltersPopup from '@/screens/staking/myStake/validators/FiltersPopup.vue';

type SelectionValidatorsFormProps = {
  step: number;
  validators: SelectionValidator[];
  maxNominations: number;
  stakingNetwork: NetworkParams;
  stakingCurrency: TokenGroup;
  selectedValidator: FWValidatorInfoFull | null;
};

const props = withDefaults(defineProps<SelectionValidatorsFormProps>(), {
  selectedValidator: null,
});

const emit = defineEmits<{
  openValidatorList: [isSuggested: boolean];
  updateSelectedValidators: [value: boolean, address: string];
  openValidatorInfo: [validator: FWValidatorInfoFull];
}>();

const showFiltersPopup = ref(false);
const onchainIdentity = ref(false);
const notSlashed = ref(false);
const notOversubscribed = ref(false);
const limitValidatorsIdentity = ref(false);
const sortByApy = ref(true);

const toggleFiltersPopupVisibility = () => {
  showFiltersPopup.value = !showFiltersPopup.value;
};

const updateOnchainIdentity = (value: boolean) => {
  onchainIdentity.value = value;
};

const updateNotSlashed = (value: boolean) => {
  notSlashed.value = value;
};

const updateNotOversubscribed = (value: boolean) => {
  notOversubscribed.value = value;
};

const updateLimitValidatorsIdentity = (value: boolean) => {
  limitValidatorsIdentity.value = value;
};

const updateSortByApy = (value: boolean) => {
  sortByApy.value = value;
};

const onOpenValidatorList = (isSuggested: boolean) => {
  emit('openValidatorList', isSuggested);
};

const onUpdateSelectedValidators = (value: boolean, address: string) => {
  emit('updateSelectedValidators', value, address);
};

const onOpenValidatorInfo = (validator: FWValidatorInfoFull) => {
  emit('openValidatorInfo', validator);
};

const { step, validators, maxNominations, stakingNetwork, stakingCurrency, selectedValidator } = toRefs(props);
</script>
