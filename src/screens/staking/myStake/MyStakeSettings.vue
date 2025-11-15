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
          :isActive="activeTabModel === tabName"
          @click="openTab(tabName)"
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { MyStakingTab } from '@/interfaces/common';
import TabButton from '@/components/TabButton.vue';

interface TabsOptions {
  label: string;
  tabName: MyStakingTab;
  classes: string;
  target: string;
  visibility: boolean;
}

const props = defineProps<{
  activeTabName: MyStakingTab;
  showAlertTab: boolean;
}>();

const emit = defineEmits<{
  'update:activeTabName': [value: MyStakingTab];
}>();

const activeTabModel = computed({
  get: () => props.activeTabName,
  set: (value: MyStakingTab) => emit('update:activeTabName', value),
});

const tabsOptions = computed<TabsOptions[]>(() => [
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
    visibility: props.showAlertTab,
  },
  {
    label: 'assets.history',
    tabName: 'history',
    classes: 'history-tab',
    target: '.history-tab',
    visibility: true,
  },
]);

function openTab(name: MyStakingTab) {
  activeTabModel.value = name;
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
