<template>
  <div class="staking-settings">
    <div class="settings-part">
      <template v-for="{ label, tabName, target, classes, isShow } in tabsOptions">
        <TabButton
          v-if="isShow"
          class="tab"
          data-testid="tabButton"
          :key="tabName"
          :target="target"
          :class="classes"
          :label="label"
          :isActive="activeTabModel === tabName"
          @click="openTab(tabName)"
        />
      </template>
    </div>

    <div class="settings-part">
      <SearchInput
        :value="filterValueModel"
        placeholder="common.search"
        width="185px"
        class="search"
        @change="changeSyncedFilterValue"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { StakingTab } from '@/interfaces/common';

interface TabsOptions {
  label: string;
  tabName: StakingTab;
  classes: string;
  target: string;
  isShow: boolean;
}

const props = defineProps<{
  showStakingItems: boolean;
  showMyStakingItems: boolean;
  activeTabName: StakingTab;
  filterValue: string;
}>();

const emit = defineEmits<{
  'update:activeTabName': [value: StakingTab];
  'update:filterValue': [value: string];
}>();

const activeTabModel = computed({
  get: () => props.activeTabName,
  set: (value: StakingTab) => emit('update:activeTabName', value),
});

const filterValueModel = computed({
  get: () => props.filterValue,
  set: (value: string) => emit('update:filterValue', value),
});

const tabsOptions = computed<TabsOptions[]>(() => [
  {
    label: 'common.all',
    tabName: 'all',
    classes: 'all-tab',
    target: '.all-tab',
    isShow: props.showStakingItems,
  },
  {
    label: 'staking.myStaked',
    tabName: 'my',
    classes: 'my-tab',
    target: '.my-tab',
    isShow: props.showMyStakingItems,
  },
]);

function changeSyncedFilterValue(value: string) {
  filterValueModel.value = value;
}

function openTab(name: StakingTab) {
  activeTabModel.value = name;
}
</script>

<style lang="scss" scoped>
.staking-settings {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;

  .settings-part {
    display: flex;
    align-items: center;
    height: 42px;

    .tab {
      margin: auto 12px auto 0;
    }
  }

  i {
    color: $grayish-white;
    margin-left: 24px;

    &:hover {
      cursor: pointer;
    }
  }

  .search {
    margin-right: 16px;
  }

  .hide-balance-text {
    font-weight: 500;
    font-size: 0.875em;
    line-height: 18px;
    margin-left: 8px;
    user-select: none;
  }
}
</style>
