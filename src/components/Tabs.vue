<template>
  <div class="tabs">
    <input :value="activeTab" class="display-none" />

    <TabButton
      v-for="{ name, label } in tabs"
      class="button"
      :label="$t(label)"
      :name="name"
      :key="name"
      :isActive="activeTab === name"
      data-testid="tabButton"
      @click="$emit('update:activeTab', name)"
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
