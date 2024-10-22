<template>
  <div class="tabs">
    <input :value="activeTab" class="display-none" />

    <TabButton
      v-for="tab in tabs"
      class="button"
      :label="$t(tab.label)"
      :name="tab.name"
      :key="tab.name"
      :isActive="activeTab === tab.name"
      data-testid="tabButton"
      @click="$emit('update:activeTab', tab)"
    />
  </div>
</template>

<script lang="ts" setup>
import type { Tab } from '@/interfaces/ui';

defineProps<{ activeTab: string; tabs: Record<string, Tab> }>();
defineEmits(['update:activeTab']);
</script>

<style lang="scss">
.display-none {
  display: none;
}

.tabs {
  display: flex;
  gap: 12px;
}
</style>
