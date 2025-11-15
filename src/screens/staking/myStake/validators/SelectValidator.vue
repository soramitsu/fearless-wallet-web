<template>
  <div class="select-validator">
    <ValidatorInfo
      v-if="showValidatorInfo"
      :validator="selectedValidator"
      :stakingNetwork="stakingNetwork"
      :stakingCurrency="stakingCurrency"
    />

    <template v-else>
      <div v-if="step === 5">
        <div data-testid="haveSelectedText">
          {{ $t('staking.haveSelected') }}

          <span class="highlight">{{ selectedQuantity }}</span>

          {{ $t('staking.outOf') }}

          <span class="highlight">{{ maxNominations }}&nbsp;</span>

          <span class="validators">{{ $t('staking.validators') }}</span>
        </div>

        <div class="settings">
          <SearchInput
            :value="filterValue"
            placeholder="common.searchByAddress"
            width="450px"
            class="search"
            data-testid="searchInput"
            @change="changeFilterValue"
          />

          <Icon icon="filter" @click="openFiltersPopup" class="filter" data-testid="filter" />
        </div>
      </div>

      <div class="validators-items">
        <Scroll>
          <template v-if="haveFilteredValidators">
            <ValidatorItem
              v-for="validator in filteredValidators"
              :key="validator.address"
              :validator="validator"
              @onSelect="onSelect"
              @openValidatorInfo="openValidatorInfo"
            />
          </template>

          <div v-else class="nothing-found">{{ $t('common.nothingFound') }}</div>
        </Scroll>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, toRefs } from 'vue';
import type { SelectionValidator } from '@/interfaces';
import type { FWValidatorInfoFull } from '@extension-base/services/staking-service/types';
import type { NetworkParams } from '@/stores';
import type { TokenGroup } from '@extension-base/background/types/types';
import ValidatorItem from '@/screens/staking/myStake/validators/ValidatorItem.vue';
import ValidatorInfo from '@/screens/staking/myStake/validators/ValidatorInfo.vue';

type SelectValidatorProps = {
  step: number;
  onchainIdentity?: boolean;
  notSlashed?: boolean;
  notOversubscribed?: boolean;
  limitValidatorsIdentity?: boolean;
  sortByApy?: boolean;
  validators: SelectionValidator[];
  maxNominations: number;
  stakingNetwork: NetworkParams;
  stakingCurrency: TokenGroup;
  selectedValidator: FWValidatorInfoFull | null;
};

const props = withDefaults(defineProps<SelectValidatorProps>(), {
  onchainIdentity: false,
  notSlashed: false,
  notOversubscribed: false,
  limitValidatorsIdentity: false,
  sortByApy: false,
  selectedValidator: null,
});

const emit = defineEmits<{
  updateSelectedValidators: [value: boolean, address: string];
  openFiltersPopup: [];
  openValidatorInfo: [validator: FWValidatorInfoFull];
}>();

const {
  step,
  onchainIdentity,
  notSlashed,
  notOversubscribed,
  limitValidatorsIdentity,
  sortByApy,
  validators,
  maxNominations,
  stakingNetwork,
  stakingCurrency,
  selectedValidator,
} = toRefs(props);

const filterValue = ref('');

const showValidatorInfo = computed(() => selectedValidator.value !== null);

const filteredValidatorsBySettings = computed(() =>
  validators.value.filter(
    ({ isOversubscribed, isKnownGood, isSlashed, limitValidatorsIdentity: validatorIdentity }) => {
      if (onchainIdentity.value && !isKnownGood) return false;

      if (notSlashed.value && isSlashed) return false;

      if (notOversubscribed.value && isOversubscribed) return false;

      if (limitValidatorsIdentity.value && !validatorIdentity) return false;

      return true;
    }
  )
);

const sortedValidators = computed(() => {
  if (step.value === 4) return validators.value;

  if (sortByApy.value) {
    return [...filteredValidatorsBySettings.value].sort(({ apy: apy1 }, { apy: apy2 }) => +apy2 - +apy1);
  }

  return filteredValidatorsBySettings.value;
});

const filteredValidators = computed(() => {
  if (step.value === 4) return sortedValidators.value;

  const filter = filterValue.value.trim().toLowerCase();

  return sortedValidators.value.filter(
    ({ address, name }) => address.toLowerCase().includes(filter) || name.toLowerCase().includes(filter)
  );
});

const haveFilteredValidators = computed(() => filteredValidators.value.length !== 0);

const selectedQuantity = computed(() => validators.value.filter(({ isSelect }) => isSelect).length);

const onSelect = (value: boolean, address: string) => {
  emit('updateSelectedValidators', value, address);
};

const openFiltersPopup = () => {
  emit('openFiltersPopup');
};

const openValidatorInfo = (validator: FWValidatorInfoFull) => {
  emit('openValidatorInfo', validator);
};

const changeFilterValue = (value: string) => {
  filterValue.value = value;
};
</script>

<style lang="scss" scoped>
.select-validator {
  color: $default-white;
  text-align: left;
  height: 100%;
  overflow-y: hidden;

  .highlight {
    font-weight: 700;
  }

  .validators {
    text-transform: lowercase;
  }

  .validators-items {
    height: 100%;

    .nothing-found {
      display: flex;
      align-items: center;
      height: 100%;
      justify-content: center;
    }
  }

  .settings {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .search {
      margin: 10px 10px 10px 0;
    }

    .filter {
      width: 25px;
      height: 25px;
      color: $default-white;
      cursor: pointer;
    }
  }
}
</style>
