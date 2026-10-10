<template>
  <section class="zero-networks" data-testid="portfolioZeroNetworks">
    <button class="zero-header" type="button" :aria-expanded="expanded" @click="$emit('toggle', !expanded)">
      <span class="zero-label">{{ label }}</span>
      <Icon :icon="expanded ? 'down' : 'chevron-right'" className="chevron" :hover="false" />
    </button>

    <div v-if="expanded" class="zero-list">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  expanded: boolean;
}>();

defineEmits<{ (event: 'toggle', expanded: boolean): void }>();
</script>

<style lang="scss" scoped>
.zero-networks {
  margin-right: 16px;
  border-bottom: $default-border;
}

.zero-header {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 0;
  border: 0;
  background: transparent;
  color: $gray-color;
  font: inherit;
  font-size: 0.8rem;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid $pink-lavender-color;
    outline-offset: 2px;
  }
}

.zero-label {
  overflow-wrap: anywhere;
}

.chevron {
  color: $gray-color;
}

.zero-list {
  margin-right: -16px;
}
</style>
