<template>
  <span
    class="mirror-loader"
    :class="[`mirror-loader--${tone}`, { 'mirror-loader--known': known }]"
    :style="{ width: `${size}px`, height: `${size}px` }"
    data-testid="mirrorLoader"
    :data-progress="known ? share : undefined"
  >
    <!-- The loader (brand kit v4, SPEC "Shikiban" part 4): three comets, the crow's three legs, circle the mirror's rim. -->
    <svg viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true" focusable="false">
      <path class="rest" :d="RIM" />
      <circle class="rest inner" :r="INNER" />
      <!-- With a known amount the rim fills clockwise from 12 o'clock to that share. -->
      <path v-if="known" class="fill" :d="RIM" pathLength="1" :style="{ strokeDasharray: `${share} 1`, strokeDashoffset: -TOP }" />
      <template v-else>
        <g v-for="(comet, turn) in COMETS" :key="turn" class="comet" :style="{ '--turn': turn }">
          <path v-for="(piece, index) in comet" :key="index" :d="RIM" pathLength="1" :style="piece" />
        </g>
      </template>
    </svg>
    <span v-if="$slots.default" class="centre"><slot /></span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FLIGHT, LOADER, MIRROR, SHIKIBAN, rimPathData } from '@/feel/shikiban';

const props = withDefaults(
  defineProps<{
    size?: number;
    /** 0-1 when the amount is known; without it the comets run. */
    progress?: number;
    /** gold: the instrument's own colours. current: the text colour around it, for a loader inside a control. */
    tone?: 'gold' | 'current';
  }>(),
  { size: 96, progress: undefined, tone: 'gold' }
);

const RIM = rimPathData();
// The rim's path starts at the top lobe's left cusp, a sixteenth of a turn before 12 o'clock.
const TOP = 1 / 16;
const INNER = Number(((MIRROR.cusp * FLIGHT.irisInset) / SHIKIBAN.ratio.yamato).toFixed(4));
// A comet's tail: shorter, brighter strokes over longer, fainter ones, all ending at the head. Each stroke is a dash of
// the rim whose head starts a third of a turn after the last comet's and runs the rim once.
const TAIL = [
  { length: LOADER.tailTurn, opacity: 0.3 },
  { length: LOADER.tailTurn * 0.6, opacity: 0.6 },
  { length: LOADER.tailTurn * 0.28, opacity: 1 },
];
const COMETS = Array.from({ length: LOADER.comets }, (_, turn) =>
  TAIL.map(({ length, opacity }) => {
    const from = length - turn / LOADER.comets - TOP;
    return { '--dash': `${length} ${1 - length}`, '--from': from, '--to': from - 1, opacity };
  })
);

const known = computed(() => props.progress !== undefined);
const share = computed(() => Number(Math.min(1, Math.max(0, props.progress ?? 0)).toFixed(4)));
</script>

<style lang="scss" scoped>
.mirror-loader {
  position: relative;
  display: inline-grid;
  flex: none;
  place-items: center;
  vertical-align: middle;

  --mirror-core: #{$fw-shikiban-core};
  --mirror-head: #{$fw-shikiban-core};
}

.mirror-loader--current {
  --mirror-core: currentColor;
  --mirror-head: currentColor;
}

svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  fill: none;
  stroke-linecap: round;
}

.mirror-loader--gold svg {
  filter: drop-shadow(0 0 3px $fw-shikiban-glow);
}

.rest {
  stroke: var(--mirror-core);
  stroke-width: 0.05;
  opacity: 0.25;
}

.inner {
  stroke-width: 0.03;
  opacity: 0.2;
}

.fill {
  stroke: var(--mirror-head);
  stroke-width: 0.075;
  transition: stroke-dasharray 180ms var(--fw-ease);
}

// A dash of the rim whose head runs it once every 2.88 s (twice the dial's comet: the loader is the calmer of the two).
.comet path {
  stroke: var(--mirror-head);
  stroke-width: 0.075;
  stroke-dasharray: var(--dash);
  stroke-dashoffset: var(--from);
  animation: mirror-loader-run 2.88s linear infinite;
}

.centre {
  position: relative;
  display: grid;
  place-items: center;
}

@keyframes mirror-loader-run {
  to {
    stroke-dashoffset: var(--to);
  }
}

// Reduced motion: the three comets stand still and fade in turn, one every 720 ms.
@keyframes mirror-loader-turn {
  0%,
  33% {
    opacity: 1;
  }

  34%,
  100% {
    opacity: 0.25;
  }
}

@mixin mirror-still {
  .comet path {
    animation: none;
  }

  .comet {
    animation: mirror-loader-turn 2.16s linear infinite;
    animation-delay: calc(var(--turn) * 720ms - 2.16s);
  }

  .fill {
    transition: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  @include mirror-still;
}

html[data-fw-effects='reduced'] .mirror-loader {
  @include mirror-still;
}
</style>
