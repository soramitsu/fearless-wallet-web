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
          :isActive="syncedActiveTabName === tabName"
          @click="openTab(tabName)"
        />
      </template>
    </div>

    <div class="settings-part">
      <SearchInput
        :value="syncedFilterValue"
        placeholder="common.search"
        width="185px"
        class="search"
        @change="changeSyncedFilterValue"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, PropSync, Prop } from 'vue-property-decorator';
import type { StakingTab } from '@/interfaces/common';

interface TabsOptions {
  label: string;
  tabName: StakingTab;
  classes: string;
  target: string;
  isShow: boolean;
}

@Component
export default class StakingSettings extends Vue {
  @Prop({ type: Boolean }) showStakingItems!: boolean;
  @Prop({ type: Boolean }) showMyStakingItems!: boolean;
  @PropSync('activeTabName', { type: String }) syncedActiveTabName!: StakingTab;
  @PropSync('filterValue', { type: String }) syncedFilterValue!: string;

  get tabsOptions(): TabsOptions[] {
    return [
      {
        label: 'common.all',
        tabName: 'all',
        classes: 'all-tab',
        target: '.all-tab',
        isShow: this.showStakingItems,
      },
      {
        label: 'staking.myStaked',
        tabName: 'my',
        classes: 'my-tab',
        target: '.my-tab',
        isShow: this.showMyStakingItems,
      },
    ];
  }

  get isAllTab() {
    return this.syncedActiveTabName === 'all';
  }

  changeSyncedFilterValue(value: string) {
    this.syncedFilterValue = value;
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
    font-size: 0.875em;
    line-height: 18px;
    margin-left: 8px;
    user-select: none;
  }
}
</style>
