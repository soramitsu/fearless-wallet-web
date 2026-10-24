<template>
  <div class="tabs" role="tablist" @keydown="navigateTabs">
    <TabButton
      v-for="tab in tabs"
      class="button"
      :label="$t(tab.label)"
      :name="tab.name"
      :key="tab.name"
      :isActive="activeTab === tab.name"
      :isTab="true"
      data-testid="tabButton"
      @click="$emit('update:activeTab', tab)"
    />
  </div>
</template>

<script lang="ts" setup>
import type { Tab } from '@/interfaces/ui';

const props = defineProps<{ activeTab: string; tabs: Record<string, Tab> }>();
const emit = defineEmits(['update:activeTab']);
const navigateTabs = (event: KeyboardEvent) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const current = buttons.indexOf(event.target as HTMLButtonElement);
  if (current === -1) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  emit('update:activeTab', Object.values(props.tabs)[next]);
  buttons[next].focus();
};
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
