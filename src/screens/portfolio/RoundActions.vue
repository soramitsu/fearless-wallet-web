<template>
  <div class="round-actions">
    <button
      v-for="action in actions"
      :key="action.id"
      type="button"
      class="round-action"
      :aria-label="action.aria ?? action.label"
      :disabled="action.disabled"
      :data-testid="action.testId"
      @click="$emit('action', action.id)"
    >
      <span class="round-action-disc" aria-hidden="true">
        <Icon :icon="action.icon" width="22px" height="22px" :hover="false" class="round-action-icon" />
      </span>
      <span class="round-action-label">{{ action.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
export interface RoundAction {
  id: string;
  icon: string;
  label: string;
  aria?: string;
  testId?: string;
  disabled?: boolean;
}

defineProps<{ actions: RoundAction[] }>();

defineEmits<{ (event: 'action', id: string): void }>();
</script>

<style lang="scss" scoped>
// Exodus-style round actions: an icon in a disc, its word underneath, the same on the home and a token's page.
.round-actions {
  display: flex;
  justify-content: center;
  gap: 28px;
}

.round-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-width: 64px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fw-text-1);
  font: inherit;
  cursor: pointer;

  &:hover:not(:disabled) .round-action-disc {
    border-color: var(--fw-select-edge);
    background: var(--fw-select-fill);
  }

  &:focus-visible {
    outline: none;

    .round-action-disc {
      outline: 2px solid var(--fw-focus);
      outline-offset: 3px;
    }
  }

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }
}

.round-action-disc {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: 1px solid var(--fw-stroke-strong);
  border-radius: 50%;
  background: var(--fw-raised-2);
  color: var(--fw-text-1);
  transition:
    background var(--fw-dur-fast) var(--fw-ease),
    border-color var(--fw-dur-fast) var(--fw-ease);
}

// The Polkaswap mark keeps its own colours: this is the brand's Swap, never a generic arrows glyph.
.round-action-icon {
  flex: none;
}

.round-action-label {
  font-size: 0.78rem;
  font-weight: 600;
}

@media (max-width: 380px) {
  .round-actions {
    gap: 18px;
  }
}

@media (forced-colors: active) {
  .round-action-disc {
    border-color: CanvasText;
    background: Canvas;
  }
}

@media (prefers-reduced-motion: reduce) {
  .round-action-disc {
    transition: none;
  }
}
</style>
