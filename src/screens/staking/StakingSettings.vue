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
import { defineComponent } from 'vue';

import type { StakingTab } from '@/interfaces/common';

interface TabsOptions {
  label: string;
  tabName: StakingTab;
  classes: string;
  target: string;
  isShow: boolean;
}

export default defineComponent({ name: 'StakingSettings' ,
  props: {
    showStakingItems: { type: Boolean },
    showMyStakingItems: { type: Boolean },
    activeTabName: { type: String },
    filterValue: { type: String },
  },
  computed: {
    tabsOptions(): TabsOptions[] {
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
    },
    isAllTab() {
      return this.syncedActiveTabName === 'all';
    },
    syncedActiveTabName: {
      get() {
        return this.activeTabName;
      },
      set(value) {
        this.$emit('update:activeTabName', value);
      },
    },
    syncedFilterValue: {
      get() {
        return this.filterValue;
      },
      set(value) {
        this.$emit('update:filterValue', value);
      },
    },
  },
  methods: {
    changeSyncedFilterValue(value: string) {
      this.syncedFilterValue = value;
    },
    openTab(name: StakingTab) {
      this.syncedActiveTabName = name;
    },
  },
});
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
