<template>
  <svg
    class="sparkline"
    :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`"
    preserveAspectRatio="none"
    role="img"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--sparkline-accent)" stop-opacity="0.8" />
        <stop offset="100%" stop-color="var(--sparkline-accent)" stop-opacity="0" />
      </linearGradient>
    </defs>

    <path v-if="areaPath" :d="areaPath" :fill="`url(#${gradientId})`" fill-opacity="0.4" />
    <path v-if="linePath" :d="linePath" stroke="var(--sparkline-accent)" stroke-width="2" fill="none" />
  </svg>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { ApyHistoryPoint } from '@/stores/staking/types';

const props = withDefaults(
  defineProps<{
    points: ApyHistoryPoint[];
    viewBoxWidth?: number;
    viewBoxHeight?: number;
  }>(),
  {
    points: () => [],
    viewBoxWidth: 100,
    viewBoxHeight: 40,
  }
);

const gradientId = `sparkline-gradient-${Math.random().toString(36).slice(2, 9)}`;

const normalizedPoints = computed(() => {
  const entries = props.points ?? [];

  if (entries.length === 0) return [];

  const values = entries.map(({ value }) => value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = props.viewBoxWidth;
  const height = props.viewBoxHeight;

  return entries.map((entry, index) => {
    const x = (index / Math.max(entries.length - 1, 1)) * width;
    const normalizedValue = range === 0 ? 0.5 : (entry.value - min) / range;
    const y = height - normalizedValue * height;

    return { x, y };
  });
});

const linePath = computed(() => {
  if (normalizedPoints.value.length < 2) return '';

  const [first, ...rest] = normalizedPoints.value;

  return ['M', first.x, first.y, ...rest.flatMap((point) => ['L', point.x, point.y])].join(' ');
});

const areaPath = computed(() => {
  if (normalizedPoints.value.length < 2) return '';

  const width = props.viewBoxWidth;
  const height = props.viewBoxHeight;
  const [first, ...rest] = normalizedPoints.value;
  const last = normalizedPoints.value[normalizedPoints.value.length - 1];

  return [
    'M',
    first.x,
    height,
    'L',
    first.x,
    first.y,
    ...rest.flatMap((point) => ['L', point.x, point.y]),
    'L',
    last.x,
    height,
    'Z',
  ].join(' ');
});
</script>

<style lang="scss" scoped>
.sparkline {
  --sparkline-accent: #66b4ff;
  width: 100%;
  height: 60px;
  display: block;
}
</style>
