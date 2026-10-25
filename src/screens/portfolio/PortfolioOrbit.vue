<template>
  <div class="orbit" aria-hidden="true" data-testid="portfolioOrbit">
    <svg class="orbit-lines" :viewBox="`0 0 ${geometry.w} ${geometry.h}`" preserveAspectRatio="xMidYMid meet">
      <ellipse class="ring" :cx="geometry.cx" :cy="geometry.cy" :rx="geometry.rx" :ry="geometry.ry" />
      <template v-for="satellite in placed" :key="satellite.key">
        <line class="link link--orb" :x1="geometry.cx" :y1="geometry.cy" :x2="satellite.x" :y2="satellite.y" />
        <line
          class="link link--swap"
          :class="`link--${satellite.readiness}`"
          :x1="satellite.x"
          :y1="satellite.y"
          :x2="geometry.swap.x"
          :y2="geometry.swap.y"
          :data-testid="`orbitLink-${satellite.key}`"
        />
      </template>
    </svg>

    <div class="orb" :style="place(geometry.cx, geometry.cy)">
      <ExternalLogo v-if="icon" :name="icon" :width="40" class="orb-logo" />
      <span v-else class="orb-initials">{{ symbol.slice(0, 4) }}</span>
    </div>

    <button
      v-for="satellite in placed"
      :key="satellite.key"
      type="button"
      tabindex="-1"
      class="satellite"
      :class="{ 'satellite--selected': satellite.name === selected, 'satellite--front': satellite.front }"
      :style="{ ...place(satellite.x, satellite.y), '--scale': satellite.scale }"
      :data-testid="`satellite-${satellite.key}`"
      @click="satellite.name && $emit('select', satellite.name)"
    >
      <span class="badge">
        <ExternalLogo v-if="satellite.icon" :name="satellite.icon" :width="28" class="badge-logo" />
        <span v-else class="badge-more">+{{ satellite.count }}</span>
      </span>
      <span class="amount">{{ satellite.amount }}</span>
    </button>

    <div class="swap-node" :class="`swap-node--${best}`" :style="place(geometry.swap.x, geometry.swap.y)" data-testid="orbitSwapNode">
      <Icon icon="polkaswap" width="26px" height="26px" :hover="false" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ReadinessState } from '@/portfolio/dashboard/readiness';
import type { LocationNetwork } from '@/portfolio/dashboard/locations';
import { POPUP_ORBIT, orbitLayout, orbitNetworks } from '@/portfolio/dashboard/orbit';

const props = defineProps<{
  symbol: string;
  /** The token's logo; its initials stand in when it has none. */
  icon?: string;
  /** Largest first. */
  networks: LocationNetwork[];
  /** The network picked, whose largest holding the list below shows. */
  selected: string | null;
  /** The network's logo, by network name. */
  networkIcon: (name: string) => string;
  /** The amount a satellite says, short enough to sit under a badge. */
  amountText: (network: LocationNetwork) => string;
  /** How the network's holding stands to a swap: it draws the link to Polkaswap. */
  readinessOf: (name: string) => ReadinessState;
}>();

defineEmits<{ (event: 'select', network: string): void }>();

// A picture of the holdings list below it, which stays the accessible truth; the orbit is for the pointer.
const geometry = POPUP_ORBIT;

const placed = computed(() => {
  const { shown, folded } = orbitNetworks(props.networks);
  const slots = orbitLayout(shown.length + (folded.length ? 1 : 0));
  const rows = shown.map((network, index) => ({
    key: network.name,
    name: network.name,
    icon: props.networkIcon(network.name),
    amount: props.amountText(network),
    readiness: props.readinessOf(network.name),
    count: 0,
    ...slots[index],
  }));

  if (folded.length) {
    rows.push({
      key: 'more',
      name: '',
      icon: '',
      amount: '',
      readiness: 'none',
      count: folded.length,
      ...slots[shown.length],
    });
  }

  return rows;
});

// The node takes the colour of the best way any network has to Polkaswap.
const best = computed<ReadinessState>(() => {
  const states = placed.value.map(({ readiness }) => readiness);

  return (['ready', 'route', 'off'] as const).find((state) => states.includes(state)) ?? 'none';
});

const place = (x: number, y: number): Record<string, string> => ({
  left: `${(x / geometry.w) * 100}%`,
  top: `${(y / geometry.h) * 100}%`,
});
</script>

<style lang="scss" scoped>
.orbit {
  position: relative;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  aspect-ratio: 529 / 224;
  user-select: none;
}

.orbit-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.ring {
  fill: none;
  stroke: var(--fw-stroke-strong);
  stroke-width: 1;
  stroke-dasharray: 2 5;
  opacity: 0.55;
}

.link {
  stroke-linecap: round;
}

.link--orb {
  stroke: var(--fw-stroke-strong);
  stroke-width: 1;
  opacity: 0.3;
}

// How the network stands to a swap: solid magenta is ready, dashed cyan is a route, dotted grey is paused or none.
.link--swap {
  stroke-width: 1.6;
}

.link--ready {
  stroke: var(--fw-brand);
}

.link--route {
  stroke: var(--fw-info);
  stroke-dasharray: 6 4;
}

.link--off,
.link--none,
.link--unknown {
  stroke: var(--fw-text-3);
  stroke-dasharray: 1 5;
  opacity: 0.7;
}

.orb,
.satellite,
.swap-node {
  position: absolute;
  transform: translate(-50%, -50%);
}

.orb {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border: 1px solid var(--fw-accent-edge);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--fw-raised-2), var(--fw-raised));
  box-shadow: 0 0 24px color-mix(in srgb, var(--fw-brand) 30%, transparent);
}

.orb-logo {
  border-radius: 50%;
}

.orb-initials {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--fw-text-1);
}

.satellite {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fw-text-1);
  font: inherit;
  cursor: pointer;
  transform: translate(-50%, -50%) scale(var(--scale, 1));
}

.badge {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 50%;
  background: var(--fw-raised);
}

.satellite--selected .badge {
  border-color: var(--fw-select-edge);
  background: var(--fw-select-fill);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--fw-brand) 40%, transparent);
}

.badge-logo {
  border-radius: 50%;
}

.badge-more {
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--fw-text-2);
}

.amount {
  max-width: 76px;
  overflow: hidden;
  font-size: 0.62rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fw-text-2);
}

.swap-node {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 50%;
  background: var(--fw-raised);
  color: var(--fw-text-1);
}

.swap-node--ready {
  border-color: var(--fw-accent-edge);
  box-shadow: 0 0 20px color-mix(in srgb, var(--fw-brand) 35%, transparent);
}

.swap-node--route {
  border-color: var(--fw-hud-trace);
}

.swap-node--off,
.swap-node--none,
.swap-node--unknown {
  border-style: dashed;
  color: var(--fw-text-2);
}

@media (forced-colors: active) {
  .orb,
  .badge,
  .swap-node {
    background: Canvas;
    border-color: CanvasText;
  }
}
</style>
