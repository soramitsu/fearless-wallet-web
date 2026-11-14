<template>
  <div class="round-actions">
    <button
      v-for="action in actions"
      :key="action.id"
      type="button"
      class="round-action"
      :class="{ 'round-action--primary': action.primary }"
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
  /** The one pink action of the row (brand kit v3): a filled disc with a slow sheen. */
  primary?: boolean;
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border: 1px solid var(--fw-stroke-strong);
  border-radius: 50%;
  background: var(--fw-raised-2);
  color: var(--fw-text-1);
  // Brand kit v3: a press sinks the disc to 94 % and it springs back.
  transition:
    background var(--fw-dur-fast) var(--fw-ease),
    border-color var(--fw-dur-fast) var(--fw-ease),
    transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.round-action:active:not(:disabled) .round-action-disc {
  transform: scale(0.94);
  transition-duration: var(--fw-dur-fast), var(--fw-dur-fast), 90ms;
}

// The primary action: the brand fill under a white mark, a soft pink glow, and a slow sheen every 6 s.
.round-action--primary .round-action-disc {
  border-color: palette($pink-color, var(--fw-fill-top));
  background: palette($pink-lavender-color, var(--fw-fill));
  color: $fw-on-accent;
  box-shadow: 0 6px 18px -6px $fw-primary-glow;

  .round-action-icon {
    filter: brightness(0) invert(1);
  }

  &::after {
    content: '';
    position: absolute;
    inset: -20%;
    background: linear-gradient(105deg, $fw-sheen-clear 35%, $fw-sheen 50%, $fw-sheen-clear 65%);
    transform: translateX(-120%);
    animation: round-action-sheen 6s ease-in-out 1.5s infinite;
    pointer-events: none;
  }
}

.round-action--primary:hover:not(:disabled) .round-action-disc {
  border-color: palette($pink-color, var(--fw-fill-top));
  background: palette($pink-lavender-color, var(--fw-fill));
}

@keyframes round-action-sheen {
  0%,
  78% {
    transform: translateX(-120%);
  }

  100% {
    transform: translateX(120%);
  }
}

html[data-fw-effects='lite'] .round-action--primary .round-action-disc::after,
html[data-fw-effects='reduced'] .round-action--primary .round-action-disc::after {
  display: none;
}

html[data-fw-effects='reduced'] .round-action--primary .round-action-disc {
  box-shadow: none;
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

  .round-action:active:not(:disabled) .round-action-disc {
    transform: none;
  }

  .round-action--primary .round-action-disc::after {
    display: none;
  }
}
</style>
