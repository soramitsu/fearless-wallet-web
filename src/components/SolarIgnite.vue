<template>
  <!-- The solar ignite (brand kit v3): the geometry behind the crow draws itself around a sent transfer, then rests. -->
  <canvas
    ref="canvas"
    class="solar-ignite"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
    data-testid="solarIgnite"
  ></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { IGNITE_FADE_MS, IGNITE_MS, IGNITE_REST, SOLAR, drawSolar } from '@/feel/solarGeometry';
import { motionAllowed } from '@/feel/motion';

const props = withDefaults(defineProps<{ size?: number }>(), { size: 220 });
const emit = defineEmits<{ (event: 'done'): void }>();
const canvas = ref<HTMLCanvasElement>();
let frame = 0;

const easeOut = (t: number) => 1 - (1 - t) ** 2;

onMounted(() => {
  const element = canvas.value;
  const ctx = element?.getContext('2d');
  if (!element || !ctx) return;
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  element.width = Math.round(props.size * ratio);
  element.height = Math.round(props.size * ratio);
  ctx.scale(ratio, ratio);
  const centre = props.size / 2;
  const radius = props.size * 0.46;
  const render = (p: number, strength: number, turn: number) => {
    ctx.clearRect(0, 0, props.size, props.size);
    drawSolar(ctx, { cx: centre, cy: centre, r: radius, p, strength, turn });
  };
  if (!motionAllowed()) {
    render(1, IGNITE_REST, 0);
    element.dataset.state = 'rest';
    emit('done');
    return;
  }
  const start = performance.now();
  const turnRate = SOLAR.ticks.turnsPerSecond * Math.PI * 2;
  const step = (now: number) => {
    const elapsed = now - start;
    const p = Math.min(1, elapsed / IGNITE_MS);
    const fade = Math.min(1, Math.max(0, (elapsed - IGNITE_MS) / IGNITE_FADE_MS));
    render(easeOut(p), 1 - (1 - IGNITE_REST) * fade, (elapsed / 1000) * turnRate);
    if (fade < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    frame = 0;
    element.dataset.state = 'rest';
    emit('done');
  };
  element.dataset.state = 'igniting';
  frame = requestAnimationFrame(step);
});

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame);
});
</script>

<style lang="scss" scoped>
.solar-ignite {
  display: block;
  pointer-events: none;
}
</style>
