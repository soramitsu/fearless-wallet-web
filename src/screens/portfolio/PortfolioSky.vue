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
    <!-- The far layers move with the cursor inside the sky's own box, which clips them. -->
    <div class="sky-layer sky-far">
      <div class="sky-layer sky-glow sky-move" :style="depth('glow')"></div>

      <svg
        class="sky-layer sky-stars sky-move"
        :style="depth('stars')"
        :width="geometry.w"
        :height="geometry.h"
        :viewBox="`0 0 ${geometry.w} ${geometry.h}`"
      >
        <circle v-for="(star, index) in stars" :key="index" :cx="star.x" :cy="star.y" :r="star.r" :opacity="star.opacity" />
      </svg>

      <svg
        class="sky-layer sky-fan sky-move"
        :style="depth('fan')"
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
    </div>

    <!-- The approved mark, split by path index into depth layers that stack to the master exactly. The wings run out of
         the card to the window's edges, stretched past the shoulder: their box spans the window, clips them there and
         veils them beside the sky, and the wings move inside it. The cobras and the disc keep the sky's own box. -->
    <div class="sky-wings" :style="wingsBoxStyle" data-testid="portfolioWings">
      <svg class="sky-wings-art sky-move" :style="wingsArtStyle" :viewBox="wingsArt.viewBox" preserveAspectRatio="none">
        <path v-for="(path, index) in wingsArt.paths" :key="index" :d="path.d" :fill="path.fill" />
      </svg>
    </div>
    <div class="sky-layer sky-sun">
      <img class="sky-art sky-move" :src="cobraLeft" alt="" draggable="false" :style="artStyle" />
      <img class="sky-art sky-move" :src="cobraRight" alt="" draggable="false" :style="artStyle" />
      <img class="sky-art sky-move" :src="disc" alt="" draggable="false" :style="artStyle" />
    </div>

    <div v-if="tip" class="sky-tip" :style="tip.style" data-testid="portfolioSkyTip">
      <i :style="{ background: tip.colour }"></i>{{ tip.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { AllocationGroup } from '@/portfolio/dashboard/allocation';
import wingsSvg from '@/assets/brand/portfolio-sun/wings.svg?raw';
import cobraLeft from '@/assets/brand/portfolio-sun/uraeus-left.svg';
import cobraRight from '@/assets/brand/portfolio-sun/uraeus-right.svg';
import disc from '@/assets/brand/portfolio-sun/sun-disc.svg';
import { formatShare } from '@/portfolio/dashboard/format';
import { SKY_DEPTHS, WINGS_TILT_DEG, layerOffset, useSkyParallax } from '@/portfolio/dashboard/skyParallax';
import {
  POPUP_SKY,
  chartColour,
  layoutRays,
  logoPlacement,
  rayIndexAt,
  rayLine,
  skyReach,
  skyStars,
  rayAngle,
  wingPaths,
  wingReach,
  wingsLayer,
  wingsVeil,
  type RayLine,
  type RayPaint,
  type WingReach,
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
const wings = wingPaths(wingsSvg);
const sky = ref<HTMLElement>();
const hovered = ref<string | null>(null);
const reach = ref<WingReach>(skyReach(geometry));
const parallax = useSkyParallax(sky);
let resizeObserver: ResizeObserver | undefined;

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
/** How far a layer moves at full deflection of the cursor parallax; its CSS reads these. */
const depth = (layer: keyof typeof SKY_DEPTHS): Record<string, string> => ({
  '--depth-x': `${SKY_DEPTHS[layer][0]}px`,
  '--depth-y': `${SKY_DEPTHS[layer][1]}px`,
});
const artStyle = {
  left: `${placement.left}px`,
  top: `${placement.top}px`,
  width: `${placement.width}px`,
  height: `${placement.height}px`,
  ...depth('sun'),
};

// Each tip runs past its edge by more than the wings ever move, and the wings' box has room above and below for the
// wings to move and turn in: they turn about a point below the disc centre, so a tip far out rises or falls most.
const WINGS_TIP_BLEED = SKY_DEPTHS.wings[0] * 1.5;
const wingsArt = computed(() => wingsLayer(wings, reach.value, geometry, WINGS_TIP_BLEED));
const wingsRoom = computed(() =>
  Math.ceil(SKY_DEPTHS.wings[1] + Math.max(reach.value.left, reach.value.right) * Math.sin((WINGS_TILT_DEG * Math.PI) / 180) + 4)
);
const wingsBoxStyle = computed(() => {
  const { left, top, width, height } = wingsArt.value;
  const mask = wingsVeil(wingsArt.value, reach.value, geometry);

  return {
    left: `${left}px`,
    top: `${top - wingsRoom.value}px`,
    width: `${width}px`,
    height: `${height + 2 * wingsRoom.value}px`,
    maskImage: mask,
    WebkitMaskImage: mask,
  };
});
const wingsArtStyle = computed(() => {
  const { left, top, width, height } = wingsArt.value;

  return {
    top: `${wingsRoom.value}px`,
    width: `${width}px`,
    height: `${height}px`,
    transformOrigin: `${geometry.cx - left}px ${geometry.cy + 20 - top}px`,
    ...depth('wings'),
    '--tilt': `${WINGS_TILT_DEG}deg`,
  };
});

/**
 * The box the wings run off: the nearest one around the sky that clips sideways, inside its border and scrollbar. On the
 * wallet screen that is the scroll area, which reaches the window's edges; without one it is the window.
 */
function stageOf(box: HTMLElement): HTMLElement | undefined {
  for (let node = box.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowX;

    if (overflow && overflow !== 'visible') return node;
  }

  return undefined;
}

/** The inside of an element's border and scrollbar, from its left and its client width. */
const inside = (element: Element, scale: number): { left: number; right: number } => {
  const left = element.getBoundingClientRect().left + element.clientLeft * scale;

  return { left, right: left + element.clientWidth * scale };
};

function measureReach(): void {
  const box = sky.value;
  const card = box?.parentElement;
  const own = box?.getBoundingClientRect();

  if (!box || !card || !own?.width) return;

  // In sky px from the sky's left edge.
  const scale = own.width / geometry.w;
  const at = ({ left, right }: { left: number; right: number }) => ({ left: (left - own.left) / scale, right: (right - own.left) / scale });
  const stage = stageOf(box);
  const measured = wingReach(
    geometry.cx,
    at(inside(card, scale)),
    at(stage ? inside(stage, scale) : { left: 0, right: document.documentElement.clientWidth })
  );
  const next = {
    ...measured,
    left: Math.max(geometry.cx, Math.ceil(measured.left)),
    right: Math.max(geometry.w - geometry.cx, Math.ceil(measured.right)),
  };

  if (JSON.stringify(next) !== JSON.stringify(reach.value)) reach.value = next;
}

// The sky moves within the card when the card's layout changes, and the stage's width changes with the window and with
// its scrollbar.
onMounted(() => {
  measureReach();

  const box = sky.value;

  if (!box || typeof ResizeObserver === 'undefined') return;

  resizeObserver = new ResizeObserver(measureReach);
  [box.parentElement, stageOf(box)].forEach((element) => element && resizeObserver?.observe(element));
});

onBeforeUnmount(() => resizeObserver?.disconnect());

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

  // The fan moves with the cursor parallax: find the ray where the fan is drawn now.
  const scale = box.width / geometry.w;
  const { x, y } = parallax.deflection();
  const fan = layerOffset(x, y, SKY_DEPTHS.fan);
  const index = rayIndexAt((event.clientX - box.left) / scale - fan.dx, (event.clientY - box.top) / scale - fan.dy, geometry);
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
// Not clipped: the wings run out of the sky's box and the card to the window's edges. --sky-x and --sky-y are the
// cursor parallax's deflection, -1 to 1, which useSkyParallax writes here; at rest they are 0.
.sky {
  --sky-x: 0;
  --sky-y: 0;
  position: relative;
  flex: none;
  user-select: none;
  -webkit-user-drag: none;
}

// Static backdrop paint, like the aurora: it does not count toward the one-glow-per-viewport budget (design spec 3.5).
.sky-glow {
  background: radial-gradient(ellipse 62% 56% at 50% 64%, color-mix(in srgb, var(--fw-brand) 38%, transparent), transparent 72%);
}

.sky-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

// The glow, the stars and the fan move inside it; it stays put and clips them, so they never paint past the sky.
.sky-far {
  overflow: clip;
}

.sky-art {
  position: absolute;
  max-width: none;
  user-select: none;
  pointer-events: none;
}

// The cobra and disc layers are as wide as the master; their boxes stay inside the sky.
.sky-sun {
  overflow: hidden;
}

// Placed by its inline style from one edge of the window to the other, with room above and below for the wings to move
// in; it clips the tips that run past the edges and carries the veil, which stays put while the wings move under it.
// Brand art keeps its own colours in forced colours, as the image layers do.
.sky-wings {
  position: absolute;
  overflow: clip;
  pointer-events: none;
  forced-color-adjust: none;
}

// The tips run past the viewBox, out to where the box clips them.
.sky-wings-art {
  position: absolute;
  left: 0;
  overflow: visible;
}

// Cursor parallax (design spec 7): each layer moves by its own depth, --depth-x and --depth-y at full deflection,
// opposite to the cursor, and the wings also turn by --tilt. Only at Full effects and without Reduce Motion, which is
// also when useSkyParallax moves at all; otherwise the sky is still and nothing is composited for it.
@media (prefers-reduced-motion: no-preference) {
  [data-fw-effects='full'] .sky-move {
    transform: translate(calc(var(--sky-x) * var(--depth-x) * -1), calc(var(--sky-y) * var(--depth-y) * -1))
      rotate(calc(var(--sky-x) * var(--tilt, 0deg)));
    will-change: transform;
  }
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
