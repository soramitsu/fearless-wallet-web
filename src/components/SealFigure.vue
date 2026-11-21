<template>
  <canvas
    ref="canvas"
    class="seal-figure"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
    data-testid="sealFigure"
    :data-stage="stage"
  ></canvas>
</template>

<script setup lang="ts">
// The seal (brand kit v4, SPEC "Shikiban" part 3): the solar geometry drawn by a transfer's stages. The rings close when
// it is ready to sign, the upward triangle's sides are signed, sent and accepted, and acceptance runs the rest of the
// ignite (kit v3). A failure breaks it.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { motionAllowed } from '@/feel/motion';
import { LADDER_MS, SEAL, sealStageNumber, settle, type SealStage } from '@/feel/shikiban';
import { drawSeal } from '@/feel/shikibanDraw';
import { SOLAR } from '@/feel/solarGeometry';

const props = withDefaults(
  defineProps<{
    size?: number;
    /** The last stage the wallet knows has happened. Stages it cannot tell apart arrive together. */
    stage: SealStage;
    /** The transfer failed or was refused: the seal breaks. */
    failed?: boolean;
    /** False when nothing more is expected (an outcome the wallet cannot tell): no comet. */
    waiting?: boolean;
  }>(),
  { size: 176, failed: false, waiting: true }
);
const emit = defineEmits<{ (event: 'done'): void }>();

const canvas = ref<HTMLCanvasElement>();
let context: CanvasRenderingContext2D | null = null;
let frame = 0;
let last = 0;
// The stage drawn so far (0-4), the ignite's clock once it is 4, and the break's clock once the transfer failed.
let q = 0;
let igniteMs = -1;
let breakMs = -1;
let clock = 0;
let finished = false;
const TURN_RATE = SOLAR.ticks.turnsPerSecond * Math.PI * 2 * 14;

const setState = (state: string): void => {
  if (canvas.value) canvas.value.dataset.state = state;
};

function paint(): void {
  if (!context) return;
  const centre = props.size / 2;
  context.clearRect(0, 0, props.size, props.size);
  if (breakMs >= SEAL.breakMs) return;
  const ignite = igniteMs < 0 ? 0 : Math.min(1, igniteMs / SEAL.igniteMs);
  const rest = igniteMs < 0 ? 0 : Math.min(1, Math.max(0, (igniteMs - SEAL.igniteMs) / SEAL.restMs));
  drawSeal(context, {
    cx: centre,
    cy: centre,
    r: props.size * 0.46,
    // Whole stages draw whole strokes; between them the stroke eases in.
    q: Math.floor(q) + settle(q - Math.floor(q)),
    p: SEAL.progress.accepted + (1 - SEAL.progress.accepted) * (1 - (1 - ignite) ** 2),
    seconds: clock / 1000,
    waiting: props.waiting && !props.failed && motionAllowed(),
    broken: breakMs < 0 ? 0 : Math.min(1, breakMs / SEAL.breakMs),
    strength: 1 - (1 - SEAL.restStrength) * rest,
    turn: (clock / 1000) * TURN_RATE,
  });
}

/** Without motion the figure shows what is known and stops: the stage's strokes, the finished seal, or nothing. */
function paintStill(): void {
  q = sealStageNumber(props.stage);
  igniteMs = q >= 4 ? SEAL.igniteMs + SEAL.restMs : -1;
  breakMs = props.failed ? SEAL.breakMs : -1;
  paint();
  setState(props.failed ? 'broken' : q >= 4 ? 'rest' : 'waiting');
  if ((props.failed || q >= 4) && !finished) {
    finished = true;
    emit('done');
  }
}

function step(now: number): void {
  frame = 0;
  const elapsed = Math.min(100, now - last);
  last = now;
  clock += elapsed;
  const target = sealStageNumber(props.stage);

  if (props.failed) {
    breakMs = Math.max(0, breakMs) + elapsed;
    setState(breakMs >= SEAL.breakMs ? 'broken' : 'breaking');
  } else if (q < target) {
    // A stroke takes 360 ms; when the stage after it is already known, 180.
    const stageMs = target - Math.floor(q) > 1 ? LADDER_MS[2] : SEAL.stageMs;
    q = Math.min(target, q + elapsed / stageMs);
    setState('drawing');
  } else if (target >= 4) {
    igniteMs = Math.max(0, igniteMs) + elapsed;
    setState(igniteMs >= SEAL.igniteMs + SEAL.restMs ? 'rest' : 'igniting');
  } else {
    setState('waiting');
  }

  paint();
  const over = props.failed ? breakMs >= SEAL.breakMs : target >= 4 && igniteMs >= SEAL.igniteMs + SEAL.restMs;
  if (over) {
    if (!finished) {
      finished = true;
      emit('done');
    }
    return;
  }
  // A settled stage with nothing in flight has nothing more to draw until the next stage arrives.
  if (q >= target && target < 4 && !props.waiting) return;
  frame = requestAnimationFrame(step);
}

function run(): void {
  if (!context) return;
  if (!motionAllowed()) {
    paintStill();
    return;
  }
  if (frame) return;
  last = performance.now();
  frame = requestAnimationFrame(step);
}

onMounted(() => {
  const element = canvas.value;
  context = element?.getContext('2d') ?? null;
  if (!element || !context) return;
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  element.width = Math.round(props.size * ratio);
  element.height = Math.round(props.size * ratio);
  context.scale(ratio, ratio);
  run();
});

watch(() => [props.stage, props.failed, props.waiting], run);

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame);
});
</script>

<style lang="scss" scoped>
.seal-figure {
  display: block;
  pointer-events: none;
}
</style>
