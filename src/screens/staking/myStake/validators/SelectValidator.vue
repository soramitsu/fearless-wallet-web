<template>
  <div class="select-validator">
    <div v-if="step === 5">
      <div>
        {{ $t('staking.haveSelected') }}

        <span class="highlight">{{ selectedQuantity }}</span>

        {{ $t('staking.outOf') }}

        <span class="highlight">{{ maxNominations }}&nbsp;</span>

        <span class="validators">{{ $t('staking.validators') }}</span>
      </div>

      <div class="settings">
        <SearchInput v-model="filterValue" placeholder="common.searchByAddress" width="450px" class="search" />

        <Icon icon="filter" @click.native="openFiltersPopup" class="filter" />
      </div>
    </div>

    <Scroll>
      <div class="validators-items">
        <ValidatorItem
          v-for="validator in filteredValidators"
          :key="validator.address"
          :validator="validator"
          @onSelect="onSelect"
        />
      </div>
    </Scroll>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { SelectionValidator } from '@/interfaces';
import ValidatorItem from '@/screens/staking/myStake/validators/ValidatorItem.vue';
import Scroll from '@/components/Scroll.vue';

@Component({
  components: { ValidatorItem, Scroll },
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

  get filteredValidatorsBySettings() {
    return this.validators.filter(({ isOversubscribed, onchainIdentity, isSlashed, limitValidatorsIdentity }) => {
      if (this.onchainIdentity && !onchainIdentity) return false;

      if (this.notSlashed && isSlashed) return false;

      if (this.notOversubscribed && isOversubscribed) return false;

      if (this.limitValidatorsIdentity && !limitValidatorsIdentity) return false;

      return true;
    });
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
}
</script>

<style lang="scss" scoped>
.select-validator {
  padding: $default-padding;
  color: $default-white;
  text-align: left;

  .highlight {
    font-weight: 700;
  }

  .validators {
    text-transform: lowercase;
  }

  .validators-items {
    height: 320px;
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
