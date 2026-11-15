<template>
  <svg
    class="sync-dial"
    :class="`sync-dial--${shown.state}`"
    :width="size"
    :height="size"
    viewBox="-1 -1 2 2"
    aria-hidden="true"
    focusable="false"
    data-testid="syncDial"
    :data-state="shown.state"
    :data-lit="shown.lit[1]"
    :data-failed="shown.failedShare"
  >
    <!-- The sync dial (brand kit v4, SPEC "Shikiban" part 2): eight segments, the share of networks that have answered. -->
    <path v-for="(d, index) in arcs.unlit" :key="`u${index}`" class="unlit" :d="d" />
    <path v-for="(d, index) in arcs.lit" :key="`l${index}`" class="lit" :d="d" />
    <path v-for="(d, index) in arcs.failed" :key="`f${index}`" class="failed" :d="d" />
    <!-- In flight: a cyan comet circles the ring until every network has answered or given up. -->
    <g v-if="shown.inFlight" class="comet">
      <path v-for="(piece, index) in COMET" :key="index" :d="piece.d" :style="{ opacity: piece.opacity }" />
    </g>
    <circle v-if="shown.settled" class="centre" r="0.27" />
    <circle v-if="sealKey" :key="sealKey" class="seal" r="0.72" data-testid="syncDialSeal" />
  </svg>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SyncStateKind } from '@/portfolio/dashboard/syncState';
import { motionAllowed } from '@/feel/motion';
import { DIAL, dialSegment, dialState } from '@/feel/shikiban';

const props = withDefaults(
  defineProps<{
    /** What the wallet's numbers are (src/portfolio/dashboard/syncState.ts). */
    kind: SyncStateKind;
    /** Networks that have answered; with `total`, the lit share while updating. */
    done?: number;
    /** Networks that gave up; with `total`, the ember share. */
    failed?: number;
    /** Networks this wallet reads balances from; absent when only the state is known. */
    total?: number;
    size?: number;
  }>(),
  { done: 0, failed: 0, total: 0, size: 18 }
);

const RADIUS = 0.72;
const point = (turn: number): string => {
  const angle = turn * Math.PI * 2;
  return `${(Math.sin(angle) * RADIUS).toFixed(4)} ${(-Math.cos(angle) * RADIUS).toFixed(4)}`;
};
const arc = ([from, to]: readonly [number, number]): string =>
  `M${point(from)}A${RADIUS} ${RADIUS} 0 ${to - from > 0.5 ? 1 : 0} 1 ${point(to)}`;
const segments = (span: readonly [number, number]): string[] =>
  Array.from({ length: DIAL.segments }, (_, index) => dialSegment(index, span))
    .filter((part): part is [number, number] => part !== null)
    .map(arc);

// The comet: its head at 12 o'clock, its tail fading behind it; the group turns.
const COMET = Array.from({ length: 6 }, (_, index) => ({
  d: arc([-(DIAL.cometTurn * (index + 1)) / 6, -(DIAL.cometTurn * index) / 6]),
  opacity: 0.95 * (1 - index / 6),
}));

const shown = computed(() => {
  const { kind, done, failed, total } = props;
  const known = total > 0;

  if (kind === 'updating') {
    const state = dialState({ done, failed: 0, total });
    return { state: 'syncing', lit: state.lit, failed: [1, 1] as [number, number], failedShare: 0, inFlight: true, settled: false };
  }
  if (kind === 'offline') return { state: 'offline', lit: [0, 0] as [number, number], failed: [1, 1] as [number, number], failedShare: 0, inFlight: false, settled: false };
  if (kind === 'saved') return { state: 'saved', lit: [0, 1] as [number, number], failed: [1, 1] as [number, number], failedShare: 0, inFlight: false, settled: false };
  if (kind === 'partial') {
    // With the numbers, the ember share is the share that gave up. Without them the last segment says "some".
    const state = known && failed > 0 ? dialState({ done: total - failed, failed, total }) : { lit: [0, 1 - 1 / DIAL.segments], failed: [1 - 1 / DIAL.segments, 1] };
    return {
      state: 'partial',
      lit: state.lit as [number, number],
      failed: state.failed as [number, number],
      failedShare: Number((1 - state.failed[0]).toFixed(5)),
      inFlight: false,
      settled: true,
    };
  }

  return { state: 'live', lit: [0, 1] as [number, number], failed: [1, 1] as [number, number], failedShare: 0, inFlight: false, settled: true };
});

const arcs = computed(() => ({ unlit: segments([0, 1]), lit: segments(shown.value.lit), failed: segments(shown.value.failed) }));

// Settling after a sync: one thin ring runs out from the dial and fades.
const sealKey = ref(0);
watch(
  () => shown.value.inFlight,
  (inFlight, wasInFlight) => {
    if (wasInFlight && !inFlight && shown.value.settled && motionAllowed()) sealKey.value += 1;
  }
);
</script>

<style lang="scss" scoped>
.sync-dial {
  flex: none;
  overflow: visible;
  fill: none;
}

path {
  stroke-width: 0.26;
}

.unlit {
  stroke: $fw-shikiban-unlit;
}

.lit {
  stroke: $fw-shikiban-rest;
}

.sync-dial--syncing .lit {
  stroke: $fw-shikiban-core;
}

// Saved balances have answered, but not lately: the ring is whole and quiet, with no centre.
.sync-dial--saved .lit {
  opacity: 0.55;
}

.failed {
  stroke: $fw-shikiban-failure;
}

.comet {
  transform-origin: 0 0;
  animation: sync-dial-comet 1.44s linear infinite;

  path {
    stroke: $fw-shikiban-flight;
  }
}

// The wallet is live even when a network gave up: the centre is never an alarm.
.centre {
  fill: $fw-shikiban-rest;
}

.seal {
  stroke: $fw-shikiban-core;
  stroke-width: 0.1;
  transform-origin: 0 0;
  animation: sync-dial-seal 510ms var(--fw-ease-expand) forwards;
}

@keyframes sync-dial-comet {
  to {
    rotate: 360deg;
  }
}

@keyframes sync-dial-seal {
  from {
    opacity: 0.9;
    scale: 1;
  }

  to {
    opacity: 0;
    scale: 2.1;
  }
}

// Reduced motion shows the state without moving: the lit share, no comet.
@media (prefers-reduced-motion: reduce) {
  .comet,
  .seal {
    display: none;
  }
}

html[data-fw-effects='reduced'] .sync-dial {
  .comet,
  .seal {
    display: none;
  }
}

@media (forced-colors: active) {
  .lit {
    stroke: CanvasText;
  }

  .centre {
    fill: CanvasText;
  }
}
</style>
