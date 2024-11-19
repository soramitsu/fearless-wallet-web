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

          <Icon icon="filter" @click.native="openFiltersPopup" class="filter" data-testid="filter" />
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

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { SelectionValidator } from '@/interfaces';
import type { FWValidatorInfoFull } from '@extension-base/services/staking-service/types';
import type { NetworkParams } from '@/stores';
import type { TokenGroup } from '@extension-base/background/types/types';
import ValidatorItem from '@/screens/staking/myStake/validators/ValidatorItem.vue';
import ValidatorInfo from '@/screens/staking/myStake/validators/ValidatorInfo.vue';

@Component({
  components: {
    ValidatorItem,
    ValidatorInfo,
  },
})
export default class SelectValidator extends Vue {
  filterValue = '';

  @Prop({ type: Number }) step!: number;
  @Prop({ type: Boolean }) onchainIdentity!: boolean;
  @Prop({ type: Boolean }) notSlashed!: boolean;
  @Prop({ type: Boolean }) notOversubscribed!: boolean;
  @Prop({ type: Boolean }) limitValidatorsIdentity!: boolean;
  @Prop({ type: Boolean }) sortByApy!: boolean;
  @Prop({ type: Array }) validators!: SelectionValidator[];
  @Prop({ type: Number }) maxNominations!: number;
  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @Prop({ type: Object }) stakingCurrency!: TokenGroup;
  @Prop({ type: Object }) selectedValidator!: FWValidatorInfoFull;

  get showValidatorInfo() {
    return this.selectedValidator !== null;
  }

  get filteredValidatorsBySettings() {
    return this.validators.filter(({ isOversubscribed, isKnownGood, isSlashed, limitValidatorsIdentity }) => {
      if (this.onchainIdentity && !isKnownGood) return false;

      if (this.notSlashed && isSlashed) return false;

      if (this.notOversubscribed && isOversubscribed) return false;

      if (this.limitValidatorsIdentity && !limitValidatorsIdentity) return false;

      return true;
    });
  }

  get haveFilteredValidators() {
    return this.filteredValidators.length !== 0;
  }

  get sortedValidators() {
    if (this.step === 4) return this.validators;

    if (this.sortByApy) return this.filteredValidatorsBySettings.sort(({ apy: apy1 }, { apy: apy2 }) => +apy2 - +apy1);

    return this.filteredValidatorsBySettings;
  }

  get filteredValidators() {
    if (this.step === 4) return this.sortedValidators;

    const filter = this.filterValue.trim().toLowerCase();

    return this.sortedValidators.filter(
      ({ address, name }) => address.toLowerCase().includes(filter) || name.toLowerCase().includes(filter)
    );
  }

  get selectedQuantity() {
    return this.validators.filter(({ isSelect }) => isSelect).length;
  }

  onSelect(value: boolean, address: string) {
    this.$emit('updateSelectedValidators', value, address);
  }

  openFiltersPopup() {
    this.$emit('openFiltersPopup');
  }

  openValidatorInfo(validator: FWValidatorInfoFull) {
    this.$emit('openValidatorInfo', validator);
  }

  changeFilterValue(value: string) {
    this.filterValue = value;
  }
}
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
