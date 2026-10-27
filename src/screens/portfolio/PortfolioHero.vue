<template>
  <section class="hero" :aria-label="t('portfolioDashboard.totalBalance')" data-testid="portfolioHero">
    <div class="hero-card">
      <div class="hero-text">
        <p class="overline" data-testid="heroOverline">{{ t('portfolioDashboard.totalBalance') }}</p>

        <div v-if="loading" class="total-loading" role="status" :aria-label="t('portfolioPage.loadingBalances')" data-testid="heroLoading">
          <Shimmer height="32px" width="168px" />
          <Shimmer height="16px" width="120px" />
        </div>

        <template v-else>
          <button type="button" class="total" :aria-label="totalLabel" data-testid="heroTotal" @click="$emit('openFiats')">
            <span class="total-symbol">{{ fiatSymbol }}</span>
            <span class="total-whole">{{ amount.whole }}</span>
            <span class="total-fraction">.{{ amount.fraction }}</span>
          </button>

          <p class="change" :class="`change--${change.direction}`" data-testid="heroChange">
            <span v-if="change.direction !== 'flat'" class="change-arrow" aria-hidden="true">{{ change.direction === 'up' ? '▲' : '▼' }}</span>
            {{ change.amountText }} · {{ change.percentText }} · {{ t('portfolioDashboard.changeLabel') }}
          </p>

          <p v-if="captions.length" class="caption" data-testid="heroCaption">{{ captions.join(' · ') }}</p>
        </template>

        <div class="meta">
          <button type="button" class="count-link" data-testid="heroHowWeCount" @click="$emit('openCounting')">
            {{ t('portfolioDashboard.howWeCount') }}
          </button>

          <button
            type="button"
            class="sync-chip"
            :class="`sync-chip--${sync.kind}`"
            :aria-label="t('portfolioDashboard.sync.open', { state: syncText })"
            data-testid="heroSync"
            @click="$emit('openSync')"
          >
            <span class="sync-dot" aria-hidden="true"></span>{{ syncText }}
          </button>
        </div>
      </div>

      <PortfolioSky class="hero-sky" :groups="groups" :activeKey="activeKey" @select="$emit('select', $event)" />
    </div>

    <div v-if="groups.length || showSwap" class="hero-row">
      <ul v-if="groups.length" class="legend" :aria-label="t('portfolioDashboard.legend.label')" data-testid="heroLegend">
        <li v-for="group in groups" :key="group.key">
          <button
            type="button"
            class="chip"
            :class="{ 'chip--active': group.key === activeKey }"
            :aria-pressed="group.key === activeKey"
            :aria-label="chipLabel(group)"
            :title="group.members ? t('portfolioDashboard.legend.otherDetail', { names: group.members.join(', ') }) : undefined"
            :data-testid="`legend-${group.key}`"
            @click="$emit('select', group.key)"
          >
            <span class="chip-dot" :style="{ background: chartColour(group.slot) }" aria-hidden="true"></span>
            <span class="chip-name">{{ groupName(group) }}</span>
            <span class="chip-share">{{ formatShare(group.share) }}%</span>
          </button>
        </li>
      </ul>

      <div v-if="showSwap" class="actions" data-testid="heroActions">
        <button type="button" class="action" :aria-label="t('portfolioDashboard.actions.swapAria')" data-testid="heroSwap" @click="$emit('swap')">
          <Icon icon="polkaswap" width="20px" height="20px" :hover="false" class="action-icon" />
          {{ t('portfolioDashboard.actions.swap') }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AllocationGroup } from '@/portfolio/dashboard/allocation';
import type { SyncState } from '@/portfolio/dashboard/syncState';
import PortfolioSky from '@/screens/portfolio/PortfolioSky.vue';
import { formatChange, formatShare, splitTotal } from '@/portfolio/dashboard/format';
import { chartColour } from '@/portfolio/dashboard/skyGeometry';
import { formatSyncAge } from '@/portfolio/syncFreshness';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
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
  groups: AllocationGroup[];
  activeKey: string | null;
  /** A single wallet can swap; All wallets asks for a wallet first. */
  showSwap: boolean;
}>();

defineEmits<{
  (event: 'openFiats'): void;
  (event: 'openCounting'): void;
  (event: 'openSync'): void;
  (event: 'select', key: string): void;
  (event: 'swap'): void;
}>();

const { t } = useI18n();
const accountsStore = useAccountsStore();
const { formatFiatValue } = usePortfolioFormatting();

const fiatSymbol = computed(() => accountsStore.fiatSymbol);
const amount = computed(() => splitTotal(props.total));
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

const groupName = (group: AllocationGroup): string => (group.key === 'other' ? t('portfolioDashboard.legend.other') : group.name);

const chipLabel = (group: AllocationGroup): string =>
  t('portfolioDashboard.legend.chip', {
    name: groupName(group),
    percent: formatShare(group.share),
    value: formatFiatValue(String(group.value)),
  });
</script>

<style lang="scss" scoped>
.hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
  min-width: 0;
}

// chamfer.l (design spec 3.4): cut 16, radius 12, top-left and bottom-right; glass at Full and Lite, raised at Reduced.
.hero-card {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--fw-divider);
  border-radius: 12px;
  background: var(--fw-card-surface, var(--fw-glass));
  clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px);
}

// Above the sky: the wings run behind the text to the card's left edge.
.hero-text {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 16px 0 14px 18px;
  text-align: left;
}

.overline {
  margin: 0;
  font-family: var(--fw-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--fw-text-3);
}

.total-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.total {
  display: flex;
  align-items: baseline;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fw-text-1);
  font-family: var(--fw-font-body);
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;
  overflow-wrap: anywhere;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 4px;
  }
}

.total-symbol {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--fw-text-2);
}

.total-whole {
  font-size: 2.25rem;
  font-weight: 800;
  line-height: 1.1;
}

.total-fraction {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--fw-text-2);
}

.change {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--fw-text-2);
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

.caption {
  margin: 0;
  color: var(--fw-text-2);
  font-size: 0.72rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin-top: auto;
  padding-top: 6px;
}

.count-link {
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fw-link);
  font: inherit;
  font-size: 0.75rem;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

.sync-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fw-text-2);
  font-family: var(--fw-font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

.sync-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--fw-text-3);
}

.sync-chip--live .sync-dot {
  background: var(--fw-success);
}

.sync-chip--saved,
.sync-chip--partial {
  color: var(--fw-warning);

  .sync-dot {
    background: var(--fw-warning);
  }
}

// The wing that runs behind the text is veiled there, so every line keeps its contrast over the art.
.hero-sky {
  align-self: flex-end;
  --sky-veil: 0.35;
}

// The legend scrolls within the row; Swap keeps its place at the end of it rather than taking a row of its own.
.hero-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.legend {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0 0 2px;
  list-style: none;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  li {
    flex: none;
  }
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 22px;
  background: var(--fw-raised);
  color: var(--fw-text-1);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

.chip--active {
  border-color: var(--fw-select-edge);
  background: var(--fw-select-fill);
}

.chip-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.chip-share {
  color: var(--fw-text-2);
}

.actions {
  flex: none;
  display: flex;
  gap: 8px;
}

.action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 22px;
  background: var(--fw-raised);
  color: var(--fw-text-1);
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    background: var(--fw-raised-2);
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

// The Polkaswap mark keeps its own colours: this is the brand's Swap, never a generic arrows glyph.
.action-icon {
  flex: none;
}

@media (max-width: 520px) {
  .hero-card {
    flex-direction: column-reverse;
    align-items: center;
  }

  .hero-text {
    align-self: stretch;
    padding-right: 12px;
  }

  // The text sits below the sky here: nothing to veil, and the sun is centred so both wings run off evenly.
  .hero-sky {
    align-self: center;
    --sky-veil: 1;
  }
}

@media (forced-colors: active) {
  .hero-card {
    background: Canvas;
    border-color: CanvasText;
  }
}
</style>
