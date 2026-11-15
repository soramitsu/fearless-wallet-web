<template>
  <section class="hero" :aria-label="t('portfolioDashboard.totalBalance')" data-testid="portfolioHero">
    <!--
      Brand kit v3: the balance on the sunset sky, the solar rings turning slowly at its sides, a lit rim. Kit v4
      ("Shikiban" parts 2 and 6): the card shows the composition it is built on (corner marks, the yamato divisions, a
      lattice a band of light crosses), and its tick ring is the heaven plate: it turns fast while networks answer.
    -->
    <div ref="card" class="hero-card" :class="{ 'hero-card--syncing': syncing }" data-testid="heroCard" data-fw-depth="0">
      <div class="hero-sky" aria-hidden="true">
        <img ref="skyImage" class="hero-sky-image" :src="skyCard" alt="" draggable="false" />
        <svg class="hero-asanoha" focusable="false" data-testid="heroLattice">
          <defs>
            <pattern id="fw-asanoha" patternUnits="userSpaceOnUse" :width="ASANOHA.width" :height="ASANOHA.height">
              <path :d="ASANOHA.path" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#fw-asanoha)" />
        </svg>
        <!-- The band of light: a window that crosses the card, showing the same lattice brighter where it passes. -->
        <div class="hero-band" data-testid="heroBand">
          <svg class="hero-asanoha hero-asanoha--lit" focusable="false"><rect width="100%" height="100%" fill="url(#fw-asanoha)" /></svg>
        </div>
        <svg class="hero-lattice" viewBox="-1 -1 2 2" focusable="false"><path :d="latticePath" /></svg>
        <svg ref="rings" class="hero-rings" viewBox="-1 -1 2 2" focusable="false" @animationstart="applyRingRate">
          <path :d="ringsPath" />
          <circle v-for="(tick, index) in ticks" :key="index" :cx="tick.x" :cy="tick.y" :r="tick.r" />
        </svg>
      </div>
      <span class="hero-marks" aria-hidden="true" data-testid="heroMarks"></span>
      <span v-if="pulseKey" :key="pulseKey" class="hero-pulse" aria-hidden="true" data-testid="heroArrivalPulse"></span>

      <p class="overline" data-testid="heroOverline">{{ t('portfolioDashboard.totalBalance') }}</p>

      <div v-if="loading" class="total-loading" role="status" :aria-label="t('portfolioPage.loadingBalances')" data-testid="heroLoading">
        <Shimmer height="40px" width="196px" />
        <Shimmer height="16px" width="128px" />
      </div>

      <template v-else>
        <button
        type="button"
        class="total"
        :class="[totalSize && `total--${totalSize}`, totalTick && `total--tick-${totalTick.direction}`]"
        :aria-label="totalLabel"
        data-testid="heroTotal"
        @click="$emit('openFiats')"
      >
          <span class="total-symbol">{{ fiatSymbol }}</span>
          <span class="total-whole">{{ shownAmount.whole }}</span>
          <span class="total-fraction">.{{ shownAmount.fraction }}</span>
          <!-- Kit v4: the total keeps its count; a change also draws a line under it in the colour of its direction. -->
          <span v-if="totalTick" :key="totalTick.key" class="total-line" aria-hidden="true" data-testid="heroTotalLine"></span>
        </button>

        <p class="change" :class="`change--${change.direction}`" data-testid="heroChange">
          <span v-if="change.direction !== 'flat'" class="change-arrow" aria-hidden="true">{{ change.direction === 'up' ? '▲' : '▼' }}</span>
          {{ change.amountText }} · {{ change.percentText }} · {{ t('portfolioDashboard.changeLabel') }}
        </p>
      </template>

      <div class="meta">
        <button
          type="button"
          class="sync-chip"
          :class="`sync-chip--${sync.kind}`"
          :aria-label="t('portfolioDashboard.sync.open', { state: syncCount ? `${syncText} ${syncCount}` : syncText })"
          data-testid="heroSync"
          @click="$emit('openSync')"
        >
          <SyncDial :kind="sync.kind" :done="syncProgress?.done" :failed="syncProgress?.failed" :total="syncProgress?.total" />
          <!-- While networks answer, the count takes the word's place: how many have, of how many. -->
          <span v-if="syncCount" class="sync-count" data-testid="heroSyncCount">{{ syncCount }}</span>
          <template v-else>{{ syncText }}</template>
        </button>

        <span class="meta-dot" aria-hidden="true">·</span>

        <button type="button" class="count-link" data-testid="heroHowWeCount" @click="$emit('openCounting')">
          {{ t('portfolioDashboard.howWeCount') }}
        </button>
      </div>

      <p v-if="!loading && captions.length" class="caption" data-testid="heroCaption">{{ captions.join(' · ') }}</p>
    </div>

    <!-- What a wallet is for, one press away. -->
    <RoundActions v-if="actions.length" class="actions" :actions="actions" data-testid="heroActions" data-fw-depth="1" @action="onAction" />
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import type { SyncState } from '@/portfolio/dashboard/syncState';
import skyCard from '@/assets/brand/sky/sky-card.webp';
import SyncDial from '@/components/SyncDial.vue';
import { arrivalPulse } from '@/feel/arrivalPulse';
import { useCountUp } from '@/feel/countUp';
import { motionAllowed } from '@/feel/motion';
import { SHIKIBAN } from '@/feel/shikiban';
import { useValueTick } from '@/feel/valueTick';
import { solarPath, solarTicks } from '@/feel/solarGeometry';
import RoundActions, { type RoundAction } from '@/screens/portfolio/RoundActions.vue';
import { formatChange, splitTotal } from '@/portfolio/dashboard/format';
import { formatSyncAge } from '@/portfolio/syncFreshness';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';

const props = withDefaults(
  defineProps<{
    /** A decimal string, the fiat total of the scope. */
    total: string;
    changeAmount: string;
    changePercent: string;
    /** A line the wallet screen already has for this view, such as "Showing Ethereum · $1,620.00". */
    caption: string;
    hiddenCount: number;
    unpricedCount: number;
    unavailableCount: number;
    poolStakesExcluded: boolean;
    loading: boolean;
    sync: SyncState;
    /**
     * The selected wallet's networks by what they have done since it opened: how many have answered, how many gave up,
     * of how many. Absent when only the state is known (All wallets).
     */
    syncProgress?: { done: number; failed: number; total: number };
    /** A single wallet can swap; All wallets asks for a wallet first. */
    showSwap: boolean;
    showSend?: boolean;
    /** False for a recovery-only wallet: nothing new should be sent to it. */
    showReceive?: boolean;
  }>(),
  { showSend: false, showReceive: false, syncProgress: undefined }
);

const emit = defineEmits<{
  (event: 'openFiats'): void;
  (event: 'openCounting'): void;
  (event: 'openSync'): void;
  (event: 'swap'): void;
  (event: 'send'): void;
  (event: 'receive'): void;
}>();

const { t } = useI18n();
const accountsStore = useAccountsStore();

const fiatSymbol = computed(() => accountsStore.fiatSymbol);
const amount = computed(() => splitTotal(props.total));
// The digits count to a new total (src/feel/countUp.ts); the label above and anything copied read the final value.
const shownTotal = useCountUp(() => props.total, () => !props.loading);
const shownAmount = computed(() => splitTotal(shownTotal.value));
const totalTick = useValueTick(
  () => (props.loading ? null : Number(props.total)),
  () => props.total
);
// A long total steps its digits down, so it stays on one line inside the sky card's ink, even in the side panel. It
// follows the final value, so the size never changes while the digits count.
const totalSize = computed(() => {
  const digits = amount.value.whole.length;
  return digits > 12 ? 'longer' : digits > 9 ? 'long' : '';
});

const ringsPath = solarPath(['ring']);
const latticePath = solarPath(['lattice', 'hexagram']);
const ticks = solarTicks();

// Asanoha, the hemp-leaf lattice, as one repeating tile 26 px wide (kit v4 `asanoha`).
const ASANOHA_CELL = 26;
const ASANOHA = {
  width: ASANOHA_CELL,
  height: Number((SHIKIBAN.asanoha.height * ASANOHA_CELL).toFixed(3)),
  path: SHIKIBAN.asanoha.lines
    .map(([x1, y1, x2, y2]) => `M${(x1 * ASANOHA_CELL).toFixed(2)} ${(y1 * ASANOHA_CELL).toFixed(2)}L${(x2 * ASANOHA_CELL).toFixed(2)} ${(y2 * ASANOHA_CELL).toFixed(2)}`)
    .join(''),
};

// The heaven plate: while the wallet's networks are answering, the tick ring turns 14 times faster and the geometry
// brightens; both ease back when the sync settles. The rate changes in place, so the ring never jumps. A card that
// mounts while they are answering gets the rate when its ring starts to turn (the template's animationstart).
const HEAVEN_RATE = 14;
const rings = ref<SVGSVGElement>();
const syncing = computed(() => props.sync.kind === 'updating');
const applyRingRate = (): void => {
  for (const animation of rings.value?.getAnimations?.() ?? []) animation.updatePlaybackRate(syncing.value ? HEAVEN_RATE : 1);
};
watch(syncing, applyRingRate);

// Tokens arriving pulse the card gold (src/feel/useArrivalFeedback.ts).
const pulseKey = ref(0);
let pulseTimer: ReturnType<typeof setTimeout> | undefined;
watch(arrivalPulse, (count) => {
  pulseKey.value = count;
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => (pulseKey.value = 0), 1600);
});

// The sky drifts a few points with the page's scroll, on the compositor only.
const card = ref<HTMLElement>();
const skyImage = ref<HTMLImageElement>();
let scroller: HTMLElement | null = null;
let driftFrame = 0;
const scrollParent = (element: HTMLElement | undefined): HTMLElement | null => {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
};
const onScroll = () => {
  if (driftFrame) return;
  driftFrame = requestAnimationFrame(() => {
    driftFrame = 0;
    const drift = Math.min(14, (scroller?.scrollTop ?? 0) * 0.12);
    if (skyImage.value) skyImage.value.style.transform = `translate3d(0, ${drift.toFixed(1)}px, 0)`;
  });
};
onMounted(() => {
  markHome(true);
  if (!motionAllowed()) return;
  scroller = scrollParent(card.value);
  scroller?.addEventListener('scroll', onScroll, { passive: true });
});
onBeforeUnmount(() => {
  markHome(false);
  scroller?.removeEventListener('scroll', onScroll);
  if (driftFrame) cancelAnimationFrame(driftFrame);
  clearTimeout(pulseTimer);
});

// The wallet home's aurora (styles/_fw-effects.scss) shows while this screen does; a kept-alive copy off screen hides it.
function markHome(on: boolean): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  if (on) root.dataset.fwHome = 'wallet';
  else delete root.dataset.fwHome;
}
onActivated(() => markHome(true));
onDeactivated(() => markHome(false));
const change = computed(() => formatChange(props.changeAmount, props.changePercent, fiatSymbol.value));

const totalLabel = computed(
  () =>
    `${t('portfolioDashboard.totalBalance')} ${fiatSymbol.value}${amount.value.whole}.${amount.value.fraction}, ` +
    `${t('portfolioDashboard.changeAria', {
      direction: t(`portfolioDashboard.direction.${change.value.direction}`),
      amount: change.value.amountText,
      percent: change.value.percentText,
    })}. ${t('portfolioDashboard.changeCurrency')}`
);

// What the total leaves out, in words, so it is never read as the whole (portfolio contract §3).
const captions = computed(() => {
  const parts = [
    props.hiddenCount ? t('portfolioDashboard.hiddenCount', { count: props.hiddenCount }) : '',
    props.unpricedCount ? t('portfolioDashboard.unpricedCount', { count: props.unpricedCount }) : '',
  ].filter(Boolean);

  // The wallet screen's caption already ends in "Balance update failed" when a balance could not be read: say it once.
  return [
    ...new Set([
      ...props.caption.split(' · '),
      parts.length ? t('portfolioDashboard.notIncluded', { parts: parts.join(', ') }) : '',
      props.poolStakesExcluded ? t('portfolioPage.poolStakesNotIncluded') : '',
      props.unavailableCount ? t('portfolioPage.balanceStatus.failed') : '',
    ]),
  ].filter(Boolean);
});

const syncText = computed(() => {
  const { kind, oldestAgeMs } = props.sync;

  if (kind === 'saved' && oldestAgeMs !== undefined) {
    const age = formatSyncAge(Date.now() - oldestAgeMs, Date.now(), (key, values) => t(key, values ?? {}));

    return t('portfolioDashboard.sync.savedAge', { age });
  }

  return t(`portfolioDashboard.sync.${kind}`);
});

// "9 / 14": only while networks are answering, and only when the wallet knows both numbers.
const syncCount = computed(() => {
  const progress = props.syncProgress;
  return syncing.value && progress && progress.total > 0 ? `${Math.min(progress.done, progress.total)} / ${progress.total}` : '';
});

const actions = computed<RoundAction[]>(() =>
  ([] as (RoundAction | false)[]).concat(
    props.showSend && { id: 'send', icon: 'send', testId: 'heroSend', label: t('walletHome.send'), aria: t('walletHome.sendAria'), primary: true },
    props.showReceive && {
      id: 'receive',
      icon: 'receive',
      testId: 'heroReceive',
      label: t('walletHome.receive'),
      aria: t('walletHome.receiveAria'),
    },
    props.showSwap && { id: 'swap', icon: 'polkaswap', testId: 'heroSwap', label: t('portfolioDashboard.actions.swap'), aria: t('portfolioDashboard.actions.swapAria') }
  ).filter((action): action is RoundAction => Boolean(action))
);

function onAction(id: string): void {
  if (id === 'send') emit('send');
  else if (id === 'receive') emit('receive');
  else if (id === 'swap') emit('swap');
}
</script>

<style lang="scss" scoped>
// The balance first, then what to do with it (Exodus' home). Brand kit v3 sets the balance on a card of the sunset sky;
// the actions stay under it, and nothing gets in the way of the list.
.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  min-width: 0;
  padding: 2px 0 10px;
  text-align: center;
}

.hero-card {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  padding: 12px 16px 10px;
  border-radius: 20px;
  background: var(--fw-raised);
  // The ink under the text widens on a narrow card (.hero-sky below).
  container-type: inline-size;
  @include fw-lit-rim(20px);

  > :not(.hero-sky, .hero-pulse, .hero-marks) {
    position: relative;
    z-index: 1;
  }
}

.hero-sky {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;

  // Ink over the sky, strongest under the text, so every line on it keeps 4.5:1 against the brightest pixel behind it;
  // the sky shows at the sides, where nothing is written.
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      $fw-sky-scrim-clear 0%,
      $fw-sky-scrim-soft 12%,
      $fw-sky-scrim-strong 25%,
      $fw-sky-scrim-strong 75%,
      $fw-sky-scrim-soft 88%,
      $fw-sky-scrim-clear 100%
    );
  }
}

// A narrow card (the side panel) can carry a total almost as wide as itself: the ink reaches nearly to its edges.
@container (max-width: 420px) {
  .hero-sky::after {
    background: linear-gradient(
      90deg,
      $fw-sky-scrim-soft 0%,
      $fw-sky-scrim-strong 9%,
      $fw-sky-scrim-strong 91%,
      $fw-sky-scrim-soft 100%
    );
  }
}

.hero-sky-image {
  position: absolute;
  left: 0;
  top: -10%;
  width: 100%;
  height: 120%;
  object-fit: cover;
  object-position: 50% 42%;
  // The sunset at full glow where it shows; the ink above it keeps the text readable.
  filter: saturate(1.3) brightness(1.18);
  user-select: none;
  will-change: transform;
}

// Kit v4: asanoha across the card at 5 %, under the ink, drawn once. A band of light 220 px wide crosses the card every
// 9 s and shows the same lattice at 32 % where it passes: the band is a window that slides one way while the lattice
// inside it slides back, so only transforms move.
.hero-asanoha {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;

  path {
    fill: none;
    stroke: $fw-shikiban-rest;
    stroke-width: 0.75px;
  }

  rect {
    opacity: 0.05;
  }
}

.hero-band {
  position: absolute;
  left: 0;
  top: 0;
  width: 220px;
  height: 100%;
  overflow: hidden;
  mask-image: linear-gradient(90deg, transparent, $fw-mask-opaque 50%, transparent);
  translate: -220px 0;
  animation: hero-band 9s linear infinite;
  will-change: translate;
}

.hero-asanoha--lit {
  inset: auto;
  left: 0;
  top: 0;
  width: 100cqw;
  translate: 220px 0;
  animation: hero-band-back 9s linear infinite;
  will-change: translate;

  rect {
    opacity: 0.32;
  }
}

// The band crosses in the first 2.4 s of every 9, then waits out of sight.
@keyframes hero-band {
  0% {
    translate: -220px 0;
  }

  27%,
  100% {
    translate: 100cqw 0;
  }
}

@keyframes hero-band-back {
  0% {
    translate: 220px 0;
  }

  27%,
  100% {
    translate: -100cqw 0;
  }
}

// Registration marks: a bracket in each corner 9 px in, and short ticks at the top and bottom edges at 1 - 1/sqrt(2),
// 1/2 and 1/sqrt(2) of the width: the yamato divisions the card is laid out on. The ticks stay within 8 px of the
// edge, clear of every line of text on the card.
.hero-marks {
  $corner: linear-gradient($fw-shikiban-mark, $fw-shikiban-mark);
  $tick: linear-gradient($fw-shikiban-mark-soft, $fw-shikiban-mark-soft);

  position: absolute;
  inset: 4px;
  z-index: 0;
  pointer-events: none;
  background:
    $corner left 5px top 5px / 10px 1px no-repeat,
    $corner left 5px top 5px / 1px 10px no-repeat,
    $corner right 5px top 5px / 10px 1px no-repeat,
    $corner right 5px top 5px / 1px 10px no-repeat,
    $corner left 5px bottom 5px / 10px 1px no-repeat,
    $corner left 5px bottom 5px / 1px 10px no-repeat,
    $corner right 5px bottom 5px / 10px 1px no-repeat,
    $corner right 5px bottom 5px / 1px 10px no-repeat,
    $tick calc(29.289cqw - 4px) 0 / 1px 4px no-repeat,
    $tick calc(50cqw - 4px) 0 / 1px 4px no-repeat,
    $tick calc(70.711cqw - 4px) 0 / 1px 4px no-repeat,
    $tick calc(29.289cqw - 4px) 100% / 1px 4px no-repeat,
    $tick calc(50cqw - 4px) 100% / 1px 4px no-repeat,
    $tick calc(70.711cqw - 4px) 100% / 1px 4px no-repeat;
}

// The solar geometry, centred on the card: its rings and ticks turn once in about six minutes at the card's sides, the
// lattice and the hexagram rest behind the text under the ink.
.hero-rings,
.hero-lattice {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 92%;
  aspect-ratio: 1;
  overflow: visible;
  translate: -50% -50%;
  fill: none;
}

.hero-rings {
  filter: drop-shadow(0 0 3px $fw-sky-geometry-glow);
  animation: hero-turn 349s linear infinite;

  path {
    stroke: $fw-sky-geometry;
    stroke-width: 1.4px;
    vector-effect: non-scaling-stroke;
  }

  circle {
    fill: $fw-sky-geometry;
  }
}

.hero-lattice {
  opacity: 0.35;

  path {
    stroke: $fw-sky-geometry;
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }
}

@keyframes hero-turn {
  to {
    rotate: -360deg;
  }
}

// The heaven plate at work: brighter while the networks answer, easing back over 720 ms.
.hero-rings,
.hero-lattice {
  transition:
    opacity 720ms var(--fw-ease),
    filter 720ms var(--fw-ease);
}

.hero-card--syncing {
  .hero-rings {
    filter: drop-shadow(0 0 5px $fw-sky-geometry-glow) brightness(1.3);
  }

  .hero-lattice {
    opacity: 0.52;
  }
}

// Tokens arrived: a gold ring runs out from the card's edge and fades.
.hero-pulse {
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: inherit;
  pointer-events: none;
  animation: hero-arrival 1.4s var(--fw-ease) forwards;
}

@keyframes hero-arrival {
  0% {
    box-shadow:
      inset 0 0 0 2px $fw-arrival-gold,
      0 0 0 0 $fw-arrival-gold;
  }

  60% {
    box-shadow:
      inset 0 0 0 1px $fw-arrival-gold,
      0 0 0 10px $fw-arrival-gold-clear;
  }

  100% {
    box-shadow:
      inset 0 0 0 1px $fw-arrival-gold-clear,
      0 0 0 16px $fw-arrival-gold-clear;
  }
}

// Lite keeps the sky still; Reduced and Calm paint a plain raised card; forced colours draw no picture.
html[data-fw-effects='lite'] .hero-rings {
  animation: none;
}

html[data-fw-effects='lite'] .hero-band {
  display: none;
}

html[data-fw-effects='reduced'] .hero-sky,
html[data-fw-effects='reduced'] .hero-marks,
.fw-calm .hero-sky,
.fw-calm .hero-marks {
  display: none;
}

@media (forced-colors: active) {
  .hero-sky,
  .hero-marks {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-rings {
    animation: none;
  }

  .hero-band {
    display: none;
  }

  .hero-pulse {
    animation: none;
    box-shadow: inset 0 0 0 2px $fw-arrival-gold;
  }
}

.overline {
  margin: 0;
  // Secondary rather than tertiary text: it sits on the sky card.
  color: var(--fw-text-2);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.total-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 6px 0 2px;
}

.total {
  position: relative;
  display: flex;
  align-items: baseline;
  justify-content: center;
  max-width: 100%;
  padding: 0 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--fw-text-1);
  font-family: var(--fw-font-body);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  overflow-wrap: anywhere;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 4px;
  }
}

.total--tick-up {
  --tick-colour: var(--fw-up);
}

.total--tick-down {
  --tick-colour: var(--fw-down);
}

.total-line {
  position: absolute;
  right: 4px;
  bottom: -1px;
  left: 4px;
  height: 1px;
  background: var(--tick-colour);
  transform-origin: left center;
  animation: total-line 510ms var(--fw-ease) both;
}

@keyframes total-line {
  0% {
    scale: 0 1;
    opacity: 1;
  }

  60% {
    scale: 1 1;
    opacity: 1;
  }

  100% {
    scale: 1 1;
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .total-line {
    display: none;
  }
}

.total-symbol {
  margin-right: 2px;
  color: var(--fw-text-2);
  font-size: 1.5rem;
  font-weight: 700;
}

.total-whole {
  font-size: 2.4rem;
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.01em;
}

.total-fraction {
  color: var(--fw-text-2);
  font-size: 1.5rem;
  font-weight: 700;
}

.change {
  margin: 0;
  color: var(--fw-text-2);
  font-size: 0.85rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

// Aqua and orange never carry the direction alone (design-system 3.5): the sign is in the text, the triangle beside it.
.change--up {
  color: var(--fw-up);
}

.change--down {
  color: var(--fw-down);
}

.change-arrow {
  margin-right: 2px;
  font-size: 0.7em;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0 8px;
}

.meta-dot {
  color: var(--fw-text-3);
}

.count-link,
.sync-chip {
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

.count-link {
  color: var(--fw-link);
}

.sync-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--fw-text-2);
  font-weight: 600;
}

// While networks answer, the count is in the colour of things in flight.
.sync-count {
  color: $fw-shikiban-flight;
  font-variant-numeric: tabular-nums;
}

.sync-chip--saved,
.sync-chip--partial {
  color: var(--fw-warning);
}

.caption {
  // Inside the ink under the card's middle (.hero-sky).
  max-width: min(420px, 48%);
  margin: 0;
  color: var(--fw-text-2);
  font-size: 0.72rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.actions {
  margin-top: 0;
}

@media (max-width: 380px) {
  .total-whole {
    font-size: 2.2rem;
  }
}

.total--long {
  .total-whole {
    font-size: 1.8rem;
  }

  .total-symbol,
  .total-fraction {
    font-size: 1.2rem;
  }
}

.total--longer {
  .total-whole {
    font-size: 1.45rem;
  }

  .total-symbol,
  .total-fraction {
    font-size: 1rem;
  }
}
</style>
