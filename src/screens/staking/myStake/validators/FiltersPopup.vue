<template>
  <Popup
    headerText="common.filters"
    sizeWidth="big"
    verticalPlacement="top"
    horizontalPlacement="right"
    :showBorder="true"
    :top="50"
    @handlerClose="$emit('handlerClose')"
  >
    <div class="settings">
      <div class="label" data-testid="showLabel">{{ $t('staking.show') }}</div>

      <div class="row">
        <div data-testid="onchainIdentity">
          {{ $t('staking.onchainIdentity') }}

          <div class="descriptions" data-testid="identityContact">
            {{ $t('staking.identityContact') }}
          </div>
        </div>

        <Switcher v-model="syncedOnchainIdentity" data-testid="identitySwitcher" />
      </div>

      <!-- <div class="row">
        {{ $t('staking.notSlashed') }}

        <Switcher v-model="syncedNotSlashed" />
      </div> -->

      <div class="row" data-testid="notOversubscribed">
        {{ $t('staking.notOversubscribed') }}

        <Switcher v-model="syncedNotOversubscribed" data-testid="notOversubscribedSwitcher" />
      </div>

      <!-- <div class="row">
        {{ $t('staking.validatorsIdentity') }}

        <Switcher v-model="syncedLimitValidatorsIdentity" />
      </div> -->

      <div class="label" data-testid="sortByLabel">{{ $t('staking.sort') }}</div>

      <div class="row" data-testid="estimatedRewardsToggle" @click="toggleSortByApy">
        {{ $t('staking.estimatedRewards') }}

        <Icon v-if="syncedSortByApy" icon="check" className="check" />
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';

@Component
export default class FiltersPopup extends Vue {
  @PropSync('onchainIdentity', { type: Boolean }) syncedOnchainIdentity!: boolean;
  @PropSync('notSlashed', { type: Boolean }) syncedNotSlashed!: boolean;
  @PropSync('notOversubscribed', { type: Boolean }) syncedNotOversubscribed!: boolean;
  @PropSync('limitValidatorsIdentity', { type: Boolean }) syncedLimitValidatorsIdentity!: boolean;
  @PropSync('sortByApy', { type: Boolean }) syncedSortByApy!: boolean;
  @Prop({ default: () => () => null }) handlerClose!: VoidFunction;

  toggleSortByApy() {
    this.syncedSortByApy = !this.syncedSortByApy;
  }
}
</script>

<style lang="scss" scoped>
.settings {
  padding: $default-padding $default-padding 0;

  .label {
    font-weight: 600;
    text-align: left;
    margin: 20px 0 5px 0;

    &:first-child {
      margin: 0;
    }
  }

  .row {
    border-bottom: $default-border;
    color: $default-white;
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-align: left;
    height: 50px;

    &:last-child {
      border: none;
      cursor: pointer;
    }

    .descriptions {
      margin-top: 5px;
      color: $grayish-white-2;
      font-size: 14px;
      cursor: pointer;
    }

    .check {
      color: $purple-color;
      width: 20px;
      height: 20px;
    }
  }
}
</style>
