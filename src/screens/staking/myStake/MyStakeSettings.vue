<template>
  <div class="content-settings">
    <div class="settings-part">
      <template v-for="{ label, tabName, target, classes, visibility } in tabsOptions">
        <TabButton
          v-if="visibility"
          class="tab"
          data-testid="myTabButton"
          :key="tabName"
          :target="target"
          :class="classes"
          :label="label"
          :isActive="activeTabName === tabName"
          @click="openTab(tabName)"
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import type { MyStakingTab } from '@/interfaces/common';

interface TabsOptions {
  label: string;
  tabName: MyStakingTab;
  classes: string;
  target: string;
  visibility: boolean;
}

export default defineComponent({ name: 'MyStakeSettings' ,
  props: {
    showAlertTab: { type: Boolean },
    activeTabName: { type: String },
  },
  computed: {
    tabsOptions(): TabsOptions[] {
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
    },
    isAboutTab() {
      return this.syncedActiveTabName === 'about';
    },
    isAlertsTab() {
      return this.syncedActiveTabName === 'alerts';
    },
    isHistoryTab() {
      return this.syncedActiveTabName === 'history';
    },
    syncedActiveTabName: {
      get() {
        return this.activeTabName;
      },
      set(value) {
        this.$emit('update:activeTabName', value);
      },
    },
  },
  methods: {
    openTab(name: MyStakingTab) {
      this.syncedActiveTabName = name;
    },
  },
});
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

.fw-web {
  .content-settings {
    flex-wrap: wrap;
    gap: 10px;

    .search-input-wrapper {
      flex-grow: 2;
    }
  }
}
</style>
