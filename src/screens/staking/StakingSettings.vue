<template>
  <div class="staking-settings">
    <div class="settings-part">
      <TabButton
        v-for="{ label, tabName, tooltipText, target, classes } in tabsOptions"
        class="tab"
        :key="tabName"
        :tooltipText="tooltipText"
        :target="target"
        :class="classes"
        :text="label"
        :isActive="activeTabName === tabName"
        @click="openTab(tabName)"
      />
    </div>

    <div class="settings-part">
      <SearchInput v-model="syncedFilterValue" placeholder="common.search" width="185px" class="search" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, PropSync } from 'vue-property-decorator';
import type { StakingTab } from '@/interfaces/common';

interface TabsOptions {
  label: string;
  tabName: StakingTab;
  classes: string;
  target: string;
}

@Component
export default class StakingSettings extends Vue {
  readonly tabsOptions: TabsOptions[] = [
    {
      label: 'common.all',
      tabName: 'all',
      classes: 'all-tab',
      target: '.all-tab',
    },
    {
      label: 'staking.myStaked',
      tabName: 'my',
      classes: 'my-tab',
      target: '.my-tab',
    },
  ];

  @PropSync('activeTabName', { type: String }) syncedActiveTabName!: StakingTab;
  @PropSync('filterValue', { type: String }) syncedFilterValue!: string;

  get isAllTab() {
    return this.syncedActiveTabName === 'all';
  }

  openTab(name: StakingTab) {
    this.syncedActiveTabName = name;
  }
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
    font-size: 14px;
    line-height: 18px;
    margin-left: 8px;
    user-select: none;
  }
}
</style>
