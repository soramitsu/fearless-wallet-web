<template>
  <!-- Decorative: the legend chips beside it do everything a ray does, for the keyboard and for screen readers. -->
  <div
    ref="sky"
    class="sky"
    :class="{ 'sky--has-selection': Boolean(highlighted) }"
    :style="skyStyle"
    aria-hidden="true"
    data-testid="portfolioSky"
    @pointermove="onPointerMove"
    @pointerleave="hovered = null"
    @click="onClick"
  >
    <div class="sky-glow"></div>

    <svg class="sky-layer sky-stars" :width="geometry.w" :height="geometry.h" :viewBox="`0 0 ${geometry.w} ${geometry.h}`">
      <circle v-for="(star, index) in stars" :key="index" :cx="star.x" :cy="star.y" :r="star.r" :opacity="star.opacity" />
    </svg>

    <svg
      class="sky-layer sky-fan"
      :width="geometry.w"
      :height="geometry.h"
      :viewBox="`0 0 ${geometry.w} ${geometry.h}`"
      data-testid="portfolioFan"
    >
      <line
        v-for="(ray, index) in rays"
        :key="index"
        class="ray"
        :class="{ 'ray--on': ray !== null && ray.key === highlighted }"
        :data-group="ray?.key"
        :x1="lines[index].x1"
        :y1="lines[index].y1"
        :x2="lines[index].x2"
        :y2="lines[index].y2"
        :style="rayStyle(ray, lines[index])"
      />
    </svg>

    <!-- The approved mark, split by path index into depth layers that stack to the master exactly. -->
    <img class="sky-layer sky-art" :src="wings" alt="" draggable="false" :style="artStyle" />
    <img class="sky-layer sky-art" :src="cobraLeft" alt="" draggable="false" :style="artStyle" />
    <img class="sky-layer sky-art" :src="cobraRight" alt="" draggable="false" :style="artStyle" />
    <img class="sky-layer sky-art" :src="disc" alt="" draggable="false" :style="artStyle" />

    <div v-if="tip" class="sky-tip" :style="tip.style" data-testid="portfolioSkyTip">
      <i :style="{ background: tip.colour }"></i>{{ tip.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AllocationGroup } from '@/portfolio/dashboard/allocation';
import wings from '@/assets/brand/portfolio-sun/wings.svg';
import cobraLeft from '@/assets/brand/portfolio-sun/uraeus-left.svg';
import cobraRight from '@/assets/brand/portfolio-sun/uraeus-right.svg';
import disc from '@/assets/brand/portfolio-sun/sun-disc.svg';
import { formatShare } from '@/portfolio/dashboard/format';
import {
  POPUP_SKY,
  chartColour,
  layoutRays,
  logoPlacement,
  rayIndexAt,
  rayLine,
  skyStars,
  rayAngle,
  type RayLine,
  type RayPaint,
} from '@/portfolio/dashboard/skyGeometry';

const props = defineProps<{
  groups: AllocationGroup[];
  /** The group a chip or a tap has picked; the others step back. */
  activeKey: string | null;
}>();

const emit = defineEmits<{ (event: 'select', key: string): void }>();

const geometry = POPUP_SKY;
const lines: RayLine[] = Array.from({ length: 100 }, (_, index) => rayLine(index, geometry));
const stars = skyStars(geometry);
const placement = logoPlacement(geometry);
const sky = ref<HTMLElement>();
const hovered = ref<string | null>(null);

const rays = computed<Array<RayPaint | null>>(() => layoutRays(props.groups));
const highlighted = computed(() => hovered.value ?? props.activeKey);
const groupByKey = computed(() => new Map(props.groups.map((group) => [group.key, group])));

/** First and last ray of every group, to place a tooltip at the middle of its arc. */
const ranges = computed(() => {
  const found = new Map<string, { from: number; to: number }>();

  rays.value.forEach((ray, index) => {
    if (!ray) return;

    const range = found.get(ray.key);

    if (range) range.to = index;
    else found.set(ray.key, { from: index, to: index });
  });

  return found;
});

// The base of the fan fades in so the rays read as rays, not as a pie: the mask is clear up to the inner radius.
const skyStyle = {
  width: `${geometry.w}px`,
  height: `${geometry.h}px`,
  '--cx': `${geometry.cx}px`,
  '--cy': `${geometry.cy}px`,
  '--fade-from': `${geometry.r0 + 2}px`,
  '--fade-to': `${geometry.r0 + 30}px`,
};
const artStyle = {
  left: `${placement.left}px`,
  top: `${placement.top}px`,
  width: `${placement.width}px`,
  height: `${placement.height}px`,
};
function rayStyle(ray: RayPaint | null, line: RayLine): Record<string, string> {
  return {
    '--ray': ray ? chartColour(ray.slot) : 'transparent',
    '--dx': `${(line.dx * 7).toFixed(2)}px`,
    '--dy': `${(line.dy * 7).toFixed(2)}px`,
  };
}

function groupAt(event: PointerEvent | MouseEvent): AllocationGroup | null {
  const box = sky.value?.getBoundingClientRect();

  if (!box || !box.width) return null;

  const scale = box.width / geometry.w;
  const index = rayIndexAt((event.clientX - box.left) / scale, (event.clientY - box.top) / scale, geometry);
  const key = index === null ? undefined : rays.value[index]?.key;

  return key ? (groupByKey.value.get(key) ?? null) : null;
}

function onPointerMove(event: PointerEvent): void {
  // A touch has no hover; tapping is what picks a group.
  if (event.pointerType === 'touch') return;

  hovered.value = groupAt(event)?.key ?? null;
}

function onClick(event: MouseEvent): void {
  const group = groupAt(event);

  if (group) emit('select', group.key);
}

const tip = computed(() => {
  const group = hovered.value ? groupByKey.value.get(hovered.value) : undefined;
  const range = hovered.value ? ranges.value.get(hovered.value) : undefined;

  if (!group || !range) return null;

  const angle = rayAngle((range.from + range.to) / 2, geometry);

  return {
    text: `${group.name} ${formatShare(group.share)}%`,
    colour: chartColour(group.slot),
    style: {
      left: `${(geometry.cx + Math.sin(angle) * (geometry.r1 + 10)).toFixed(1)}px`,
      top: `${(geometry.cy - Math.cos(angle) * (geometry.r1 + 10)).toFixed(1)}px`,
    },
  };
});
</script>

<style lang="scss" scoped>
.sky {
  position: relative;
  flex: none;
  overflow: hidden;
  user-select: none;
  -webkit-user-drag: none;
}

// Static backdrop paint, like the aurora: it does not count toward the one-glow-per-viewport budget (design spec 3.5).
.sky-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 62% 56% at 50% 64%, color-mix(in srgb, var(--fw-brand) 38%, transparent), transparent 72%);
  pointer-events: none;
}

.sky-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.sky-art {
  inset: auto;
  max-width: none;
  user-select: none;
}

.sky-stars {
  fill: var(--fw-text-2);
}

.sky-fan {
  pointer-events: auto;
  -webkit-mask-image: radial-gradient(circle at var(--cx) var(--cy), transparent var(--fade-from), black var(--fade-to));
  mask-image: radial-gradient(circle at var(--cx) var(--cy), transparent var(--fade-from), black var(--fade-to));
}

.ray {
  stroke: var(--ray, transparent);
  stroke-width: 1.7;
  stroke-linecap: round;
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.sky--has-selection .ray:not(.ray--on) {
  opacity: 0.26;
}

.ray--on {
  transform: translate(var(--dx), var(--dy));
  filter: brightness(1.25);
}

.sky-tip {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: 1px solid var(--fw-stroke-strong);
  border-radius: 8px;
  background: var(--fw-raised);
  color: var(--fw-text-1);
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
  transform: translate(-50%, -100%);
  pointer-events: none;

  i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ray {
    transition: none;
  }
}

[data-fw-effects='reduced'] .sky-glow {
  display: none;
}

@media (forced-colors: active) {
  .sky-glow {
    display: none;
  }
}
</style>
