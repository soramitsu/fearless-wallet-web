<template>
  <div class="pools-settings">
    <div class="settings-part">
      <template v-for="{ label, tabName, target, classes, isShow } in tabsOptions">
        <TabButton
          v-if="isShow"
          class="tab"
          :key="tabName"
          :target="target"
          :class="classes"
          :label="label"
          :isActive="activeTab === tabName"
          @click="openTab(tabName)"
        />
      </template>
    </div>

    <div class="settings-part">
      <SearchInput
        :value="filterValue"
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
import type { PoolsTab } from '@/interfaces/common';

interface TabsOptions {
  label: string;
  tabName: PoolsTab;
  classes: string;
  target: string;
  isShow: boolean;
}

const props = defineProps<{
  showPoolsItems: boolean;
  showMyPoolsItems: boolean;
  activeTabName: PoolsTab;
  filterValue: string;
}>();

const emit = defineEmits<{
  'update:activeTabName': [value: PoolsTab];
  'update:filterValue': [value: string];
}>();

const activeTab = computed({
  get: () => props.activeTabName,
  set: (value: PoolsTab) => emit('update:activeTabName', value),
});

const filterValue = computed({
  get: () => props.filterValue,
  set: (value: string) => emit('update:filterValue', value),
});

const tabsOptions = computed<TabsOptions[]>(() => [
  {
    label: 'common.all',
    tabName: 'all',
    classes: 'all-tab',
    target: '.all-tab',
    isShow: props.showPoolsItems,
  },
  {
    label: 'pools.myPools',
    tabName: 'my',
    classes: 'my-tab',
    target: '.my-tab',
    isShow: props.showMyPoolsItems,
  },
]);

function openTab(name: PoolsTab) {
  activeTab.value = name;
}

function changeSyncedFilterValue(value: string) {
  filterValue.value = value;
}
</script>

<style lang="scss" scoped>
.pools-settings {
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
