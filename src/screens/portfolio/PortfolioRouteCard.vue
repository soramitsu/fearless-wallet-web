<template>
  <section v-if="readiness.state !== 'unknown'" class="route" :class="`route--${readiness.state}`" data-testid="portfolioRouteCard">
    <header class="head">
      <h3 class="title">{{ t('portfolioDashboard.where.route.title') }}</h3>
      <PortfolioReadinessChip :readiness="readiness" />
    </header>

    <template v-if="readiness.state === 'ready'">
      <strong class="lead">{{ t('portfolioDashboard.where.route.readyTitle') }}</strong>
      <p class="text" data-testid="routeText">{{ t('portfolioDashboard.where.route.readyText', { symbol }) }}</p>
    </template>

    <template v-else-if="readiness.state === 'route' || (readiness.state === 'off' && readiness.cause === 'moves-off')">
      <strong class="lead">
        {{ readiness.state === 'route' ? tc('portfolioDashboard.where.route.movesTitle', readiness.hops.length, { count: readiness.hops.length }) : t('portfolioDashboard.readiness.movesPaused') }}
      </strong>
      <p class="text" data-testid="routeText">
        {{ t(readiness.state === 'route' ? 'portfolioDashboard.where.route.movesText' : 'portfolioDashboard.where.route.pausedText') }}
      </p>

      <ol class="hops" data-testid="routeHops">
        <li v-for="(hop, index) in readiness.hops" :key="hop.routeId" class="hop">
          <span class="hop-number" aria-hidden="true">{{ index + 1 }}</span>
          <span class="hop-body">
            <span class="hop-path">{{ t('portfolioDashboard.where.route.hop', { from: hop.originNetwork, to: hop.destinationNetwork }) }}</span>
            <span class="hop-meta">{{ t('portfolioDashboard.where.route.hopMeta', { provider: hop.providerName, time: estimatedTime(hop.providerId) }) }}</span>
            <span v-if="hop.minimum" class="hop-meta">{{ t('portfolioDashboard.where.route.minimum', { amount: hop.minimum, symbol }) }}</span>
          </span>
        </li>
      </ol>
    </template>

    <template v-else-if="readiness.state === 'off'">
      <strong class="lead">{{ t('portfolioDashboard.readiness.swapsPaused') }}</strong>
      <p class="text" data-testid="routeText">{{ t('portfolioDashboard.where.route.swapsPausedText', { symbol }) }}</p>
    </template>

    <template v-else>
      <strong class="lead">{{ t('portfolioDashboard.where.route.noneTitle') }}</strong>
      <p class="text" data-testid="routeText">{{ t('portfolioDashboard.where.route.noneText', { network }) }}</p>
      <p v-if="readiness.unavailable" class="text" data-testid="routeUnavailable">{{ t('crossChainPage.route.ethereumToSoraUnavailable') }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { Readiness } from '@/portfolio/dashboard/readiness';
import PortfolioReadinessChip from '@/screens/portfolio/PortfolioReadinessChip.vue';
import { useI18n } from '@/locales/useI18n';

defineProps<{ readiness: Readiness; symbol: string; /** The holding's own network, for "no route from here". */ network: string }>();

const { t, tc } = useI18n();

// The cross-chain screen's own wording for how long each kind of move takes.
const TIME_KEYS: Record<string, string> = {
  'wallet-xcm': 'walletXcm',
  'sora-substrate-bridge': 'soraSubstrate',
  'sora-evm-bridge': 'soraEvm',
  'liberland-bridge': 'liberland',
};
const estimatedTime = (providerId: string): string => (TIME_KEYS[providerId] ? t(`crossChainPage.estimatedTimeValues.${TIME_KEYS[providerId]}`) : '');
</script>

<style lang="scss" scoped>
.route {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 12px;
  background: var(--fw-raised);
  text-align: left;
}

.route--ready {
  border-color: var(--fw-accent-edge);
}

.route--off {
  border-style: dashed;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fw-text-3);
}

.lead {
  font-size: 0.9rem;
}

.text {
  margin: 0;
  color: var(--fw-text-2);
  font-size: 0.78rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.hops {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.hop {
  display: flex;
  gap: 10px;
}

.hop-number {
  flex: none;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 1px solid var(--fw-hud-trace);
  border-radius: 50%;
  color: var(--fw-info);
  font-size: 0.68rem;
  font-weight: 700;
}

.hop-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.hop-path {
  font-weight: 700;
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}

.hop-meta {
  color: var(--fw-text-2);
  font-size: 0.72rem;
}
</style>
