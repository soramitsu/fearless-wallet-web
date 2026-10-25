<template>
  <span v-if="label" class="readiness" :class="`readiness--${readiness.state}`" :data-testid="`readiness-${readiness.state}`">
    <Icon v-if="readiness.state === 'ready'" icon="polkaswap" width="14px" height="14px" :hover="false" class="readiness-icon" />
    <Icon v-else-if="readiness.state === 'route'" icon="cross-chain" width="14px" height="14px" :hover="false" class="readiness-icon" />
    <span v-else class="readiness-pause" aria-hidden="true"></span>
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Readiness } from '@/portfolio/dashboard/readiness';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{ readiness: Readiness }>();

const { t, tc } = useI18n();

// Words and an icon, never colour alone: Swap-ready, 1 move, 2 moves, Moves paused. No chip for "no route": Where it
// lives explains it, and a chip on every row would be noise (spec 4.3).
const label = computed(() => {
  const { state, hops, cause } = props.readiness;

  if (state === 'ready') return t('portfolioDashboard.readiness.swapReady');
  if (state === 'route') return tc('portfolioDashboard.readiness.moves', hops.length, { count: hops.length });
  if (state === 'off') return t(cause === 'swaps-off' ? 'portfolioDashboard.readiness.swapsPaused' : 'portfolioDashboard.readiness.movesPaused');

  return '';
});
</script>

<style lang="scss" scoped>
.readiness {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 20px;
  padding: 0 8px;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 10px;
  color: var(--fw-text-2);
  font-size: 0.66rem;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

// A selected fill is labelled in primary text only (design system 3.4 rule 4); the mark, the words and the accent edge say
// what it is.
.readiness--ready {
  border-color: var(--fw-accent-edge);
  background: var(--fw-select-fill);
  color: var(--fw-text-1);
}

.readiness--route {
  border-color: var(--fw-hud-trace);
  color: var(--fw-info);
}

// Paused is dashed and carries its own words: it never reads as available.
.readiness--off {
  border-style: dashed;
  color: var(--fw-text-3);
}

.readiness-icon {
  flex: none;
}

.readiness-pause {
  width: 8px;
  height: 8px;
  border-left: 2px solid currentColor;
  border-right: 2px solid currentColor;
  box-sizing: border-box;
}
</style>
