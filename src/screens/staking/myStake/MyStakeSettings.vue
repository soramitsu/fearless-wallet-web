<template>
  <div class="content-settings">
    <div class="settings-part">
      <template v-for="{ label, tabName, target, classes, visibility } in tabsOptions">
        <TabButton
          v-if="visibility"
          class="tab"
          :key="tabName"
          :target="target"
          :class="classes"
          :label="label"
          :isActive="activeTabName === tabName"
          data-testid="myTabButton"
          @click="openTab(tabName)"
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, PropSync, Prop } from 'vue-property-decorator';
import type { MyStakingTab } from '@/interfaces/common';

interface TabsOptions {
  label: string;
  tabName: MyStakingTab;
  classes: string;
  target: string;
  visibility: boolean;
}

@Component
export default class MyStakeSettings extends Vue {
  @PropSync('activeTabName', { type: String }) syncedActiveTabName!: MyStakingTab;
  @Prop({ type: Boolean }) showAlertTab!: boolean;

  get tabsOptions(): TabsOptions[] {
    return [
      {
        label: 'common.about',
        tabName: 'about',
        classes: 'about-tab',
        target: '.about-tab',
        visibility: true,
      },
      {
        label: 'staking.alerts',
        tabName: 'alerts',
        classes: 'alerts-tab',
        target: '.alerts-tab',
        visibility: this.showAlertTab,
      },
      {
        label: 'assets.history',
        tabName: 'history',
        classes: 'history-tab',
        target: '.history-tab',
        visibility: true,
      },
    ];
  }

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
