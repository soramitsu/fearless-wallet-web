<template>
  <Popup
    headerText="common.filters"
    sizeWidth="big"
    verticalPlacement="top"
    horizontalPlacement="right"
    :showBorder="true"
    :top="50"
    @handlerClose="handleClose"
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

        <Switcher
          v-model="syncedOnchainIdentity"
          data-testid="identitySwitcher"
          @change="toggleSyncedOnchainIdentity"
        />
      </div>

      <!-- <div class="row">
        {{ $t('staking.notSlashed') }}

        <Switcher v-model="syncedNotSlashed" />
      </div> -->

      <div class="row" data-testid="notOversubscribed">
        {{ $t('staking.notOversubscribed') }}

        <Switcher
          :value="syncedNotOversubscribed"
          data-testid="notOversubscribedSwitcher"
          @change="toggleSyncedNotOversubscribed"
        />
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

<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{
  onchainIdentity: boolean;
  notSlashed: boolean;
  notOversubscribed: boolean;
  limitValidatorsIdentity: boolean;
  sortByApy: boolean;
}>();

const emit = defineEmits<{
  'update:onchainIdentity': [value: boolean];
  'update:notSlashed': [value: boolean];
  'update:notOversubscribed': [value: boolean];
  'update:limitValidatorsIdentity': [value: boolean];
  'update:sortByApy': [value: boolean];
  handlerClose: [];
}>();

const syncedOnchainIdentity = computed({
  get: () => props.onchainIdentity,
  set: (value: boolean) => emit('update:onchainIdentity', value),
});

const syncedNotOversubscribed = computed({
  get: () => props.notOversubscribed,
  set: (value: boolean) => emit('update:notOversubscribed', value),
});

const syncedSortByApy = computed({
  get: () => props.sortByApy,
  set: (value: boolean) => emit('update:sortByApy', value),
});

function toggleSortByApy() {
  syncedSortByApy.value = !syncedSortByApy.value;
}

function toggleSyncedNotOversubscribed(value: boolean) {
  syncedNotOversubscribed.value = value;
}

function toggleSyncedOnchainIdentity(value: boolean) {
  syncedOnchainIdentity.value = value;
}

function handleClose() {
  emit('handlerClose');
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
      font-size: 0.875em;
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
