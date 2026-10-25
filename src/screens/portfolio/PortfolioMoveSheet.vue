<template>
  <PortfolioSheet :title="t('portfolioDashboard.where.moveSheet.title')" testid="portfolioMoveSheet" @close="$emit('close')">
    <div class="cards">
      <section class="card" data-testid="moveFrom">
        <span class="label">{{ t('portfolioDashboard.where.moveSheet.from') }}</span>
        <strong>{{ first.originNetwork }}</strong>
        <span class="meta">{{ holding.walletName }}</span>
        <span class="meta">{{ t('portfolioDashboard.where.swapSheet.transferable', { amount: `${formatAmount(holding.transferable)} ${symbol}` }) }}</span>
      </section>
      <span class="arrow" aria-hidden="true">→</span>
      <section class="card" data-testid="moveTo">
        <span class="label">{{ t('portfolioDashboard.where.moveSheet.to') }}</span>
        <strong>{{ last.destinationNetwork }}</strong>
        <span class="meta">{{ holding.walletName }}</span>
      </section>
    </div>

    <dl class="facts" data-testid="moveFacts">
      <div class="fact">
        <dt>{{ t('portfolioDashboard.where.moveSheet.route') }}</dt>
        <dd>
          <span v-for="hop in readiness.hops" :key="hop.routeId" class="hop">
            {{ t('portfolioDashboard.where.route.hop', { from: hop.originNetwork, to: hop.destinationNetwork }) }}
            <small>{{ hop.providerName }}</small>
          </span>
        </dd>
      </div>
      <div class="fact">
        <dt>{{ t('portfolioDashboard.where.moveSheet.arrives') }}</dt>
        <dd>{{ readiness.hops.map((hop) => estimatedTime(hop.providerId)).join(' + ') }}</dd>
      </div>
      <div class="fact">
        <dt>{{ t('portfolioDashboard.where.moveSheet.fee') }}</dt>
        <dd>{{ feeText }}</dd>
      </div>
      <div class="fact">
        <dt>{{ t('portfolioDashboard.where.moveSheet.minimum') }}</dt>
        <dd>{{ first.minimum ? `${first.minimum} ${symbol}` : t('crossChainPage.quotedLive') }}</dd>
      </div>
    </dl>

    <p class="hint">{{ t('portfolioDashboard.where.moveSheet.amountNext') }}</p>
    <p class="banner" :class="{ 'banner--off': off }" role="note" data-testid="moveBanner">
      {{ off ? t('portfolioDashboard.where.route.pausedText') : t('portfolioDashboard.where.moveSheet.banner') }}
    </p>
    <p v-if="switchTo && !off" class="hint" data-testid="moveSwitchNote">{{ t('portfolioDashboard.where.switchNote', { wallet: switchTo }) }}</p>
    <p v-if="switchFailed" class="banner banner--off" role="alert">{{ t('portfolioDashboard.where.switchFailed', { wallet: switchTo ?? '' }) }}</p>

    <div class="buttons">
      <button type="button" class="primary" :disabled="off || busy" :aria-busy="busy" data-testid="moveReview" @click="$emit('confirm')">
        {{ primaryLabel }}
      </button>
      <button v-if="canReceiveOnSora" type="button" class="secondary" data-testid="moveReceiveOnSora" @click="$emit('receiveOnSora')">
        {{ t('portfolioDashboard.where.actions.receiveOnSora') }}
      </button>
    </div>
  </PortfolioSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LocationHolding } from '@/portfolio/dashboard/locations';
import type { Readiness } from '@/portfolio/dashboard/readiness';
import PortfolioSheet from '@/screens/portfolio/PortfolioSheet.vue';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{
  readiness: Readiness;
  holding: LocationHolding;
  symbol: string;
  /** The wallet to switch to first, when the holding is in another wallet. */
  switchTo: string | null;
  busy: boolean;
  switchFailed: boolean;
  canReceiveOnSora: boolean;
}>();

defineEmits<{ (event: 'confirm'): void; (event: 'receiveOnSora'): void; (event: 'close'): void }>();

const { t } = useI18n();
const { formatAmount } = usePortfolioFormatting();

const first = computed(() => props.readiness.hops[0]);
const last = computed(() => props.readiness.hops[props.readiness.hops.length - 1]);
// Paused means release policy keeps the move closed; nothing is hidden, the sheet says so and offers what is open.
const off = computed(() => props.readiness.state !== 'route');

const TIME_KEYS: Record<string, string> = {
  'wallet-xcm': 'walletXcm',
  'sora-substrate-bridge': 'soraSubstrate',
  'sora-evm-bridge': 'soraEvm',
  'liberland-bridge': 'liberland',
};
const estimatedTime = (providerId: string): string => (TIME_KEYS[providerId] ? t(`crossChainPage.estimatedTimeValues.${TIME_KEYS[providerId]}`) : '');

const feeText = computed(() =>
  first.value.destinationFee && first.value.destinationFee !== '0'
    ? t('crossChainPage.route.originAndDownstreamFee', { fee: first.value.destinationFee, symbol: props.symbol })
    : t('crossChainPage.route.originFeeLive')
);

const primaryLabel = computed(() => {
  if (off.value) return t('portfolioDashboard.where.actions.moveUnavailable');
  if (props.busy && props.switchTo) return t('portfolioDashboard.where.switching', { wallet: props.switchTo });
  if (props.switchTo) {
    return t('portfolioDashboard.where.actions.switchAnd', {
      wallet: props.switchTo,
      action: t('portfolioDashboard.where.actions.reviewMove'),
    });
  }

  // With two or more moves the first one is started; the next ones are reviewed as they come.
  return props.readiness.hops.length > 1
    ? t('portfolioDashboard.where.actions.moveFirst', { network: first.value.destinationNetwork })
    : t('portfolioDashboard.where.moveSheet.review');
});
</script>

<style lang="scss" scoped>
.cards {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: stretch;
  gap: 8px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 12px;
  background: var(--fw-raised-2);
  overflow-wrap: anywhere;
}

.arrow {
  align-self: center;
  color: var(--fw-text-2);
  font-size: 1.1rem;
}

.label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fw-text-3);
}

.meta {
  color: var(--fw-text-2);
  font-size: 0.72rem;
}

.facts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.fact {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.78rem;

  dt {
    flex: none;
    color: var(--fw-text-2);
  }

  dd {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    margin: 0;
    font-weight: 600;
    text-align: right;
    overflow-wrap: anywhere;
  }
}

.hop small {
  display: block;
  color: var(--fw-text-2);
  font-weight: 400;
}

.hint {
  margin: 0;
  color: var(--fw-text-2);
  font-size: 0.75rem;
}

.banner {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--fw-hud-trace);
  border-radius: 10px;
  color: var(--fw-text-1);
  font-size: 0.75rem;
}

.banner--off {
  border-style: dashed;
  border-color: var(--fw-stroke-control);
}

.buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.primary,
.secondary {
  min-height: 48px;
  padding: 0 16px;
  border-radius: 12px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

.primary {
  border: 1px solid var(--fw-accent-edge);
  background: linear-gradient(180deg, var(--fw-fill-top), var(--fw-fill-bottom));
  color: var(--fw-on-accent);

  &:disabled {
    border-style: dashed;
    background: var(--fw-raised-2);
    color: var(--fw-text-2);
    cursor: default;
  }
}

.secondary {
  border: 1px solid var(--fw-stroke-control);
  background: var(--fw-raised);
  color: var(--fw-text-1);
}
</style>
