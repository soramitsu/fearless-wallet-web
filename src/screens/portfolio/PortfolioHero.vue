<template>
  <section class="hero" :aria-label="t('portfolioDashboard.totalBalance')" data-testid="portfolioHero">
    <p class="overline" data-testid="heroOverline">{{ t('portfolioDashboard.totalBalance') }}</p>

    <div v-if="loading" class="total-loading" role="status" :aria-label="t('portfolioPage.loadingBalances')" data-testid="heroLoading">
      <Shimmer height="40px" width="196px" />
      <Shimmer height="16px" width="128px" />
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
    </template>

    <div class="meta">
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

      <span class="meta-dot" aria-hidden="true">·</span>

      <button type="button" class="count-link" data-testid="heroHowWeCount" @click="$emit('openCounting')">
        {{ t('portfolioDashboard.howWeCount') }}
      </button>
    </div>

    <p v-if="!loading && captions.length" class="caption" data-testid="heroCaption">{{ captions.join(' · ') }}</p>

    <!-- What a wallet is for, one press away. -->
    <RoundActions v-if="actions.length" class="actions" :actions="actions" data-testid="heroActions" @action="onAction" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SyncState } from '@/portfolio/dashboard/syncState';
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
    /** A single wallet can swap; All wallets asks for a wallet first. */
    showSwap: boolean;
    showSend?: boolean;
    /** False for a recovery-only wallet: nothing new should be sent to it. */
    showReceive?: boolean;
  }>(),
  { showSend: false, showReceive: false }
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

const actions = computed<RoundAction[]>(() =>
  ([] as (RoundAction | false)[]).concat(
    props.showSend && { id: 'send', icon: 'send', testId: 'heroSend', label: t('walletHome.send'), aria: t('walletHome.sendAria') },
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
// The balance first, then what to do with it (Exodus' home): centred, no card, no chart in the way of the list.
.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  padding: 2px 0 10px;
  text-align: center;

  // A soft brand glow under the total, painted behind everything and never in the way of a click.
  &::before {
    content: '';
    position: absolute;
    inset: -24px 8% 30%;
    z-index: 0;
    background: var(--fw-brand-glow);
    pointer-events: none;
  }

  > * {
    position: relative;
    z-index: 1;
  }
}

.overline {
  margin: 0;
  color: var(--fw-text-3);
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

.caption {
  max-width: 420px;
  margin: 0;
  color: var(--fw-text-2);
  font-size: 0.72rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.actions {
  margin-top: 8px;
}

@media (max-width: 380px) {
  .total-whole {
    font-size: 2.2rem;
  }
}
</style>
