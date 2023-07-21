<template>
  <div class="content-settings">
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
  </div>
</template>

<script lang="ts">
import { Component, Vue, PropSync } from 'vue-property-decorator';
import type { MyStakingTab } from '@/interfaces/common';

interface TabsOptions {
  label: string;
  tabName: MyStakingTab;
  classes: string;
  target: string;
}

@Component
export default class MyStakeSettings extends Vue {
  readonly tabsOptions: TabsOptions[] = [
    {
      label: 'common.about',
      tabName: 'about',
      classes: 'about-tab',
      target: '.about-tab',
    },
    {
      label: 'staking.alerts',
      tabName: 'alerts',
      classes: 'alerts-tab',
      target: '.alerts-tab',
    },
    {
      label: 'staking.history',
      tabName: 'history',
      classes: 'history-tab',
      target: '.history-tab',
    },
  ];

  @PropSync('activeTabName', { type: String }) syncedActiveTabName!: MyStakingTab;

  get isAboutTab() {
    return this.syncedActiveTabName === 'about';
  }

  get isAlertsTab() {
    return this.syncedActiveTabName === 'alerts';
  }

  get isHistoryTab() {
    return this.syncedActiveTabName === 'history';
  }

  openTab(name: MyStakingTab) {
    this.syncedActiveTabName = name;
  }
}
</script>

<style lang="scss" scoped>
.content-settings {
  display: flex;
  justify-content: space-between;

  .settings-part {
    display: flex;
    align-items: center;
    height: 42px;

    .tab {
      margin: auto 12px auto 0;
    }
  }
}
</style>
