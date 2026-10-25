<template>
  <PortfolioSheet :title="t('portfolioDashboard.counting.title')" testid="portfolioCountingSheet" @close="$emit('close')">
    <ul class="rules" data-testid="countingRules">
      <li>{{ t('portfolioDashboard.counting.rules.amount') }}</li>
      <li>{{ t('portfolioDashboard.counting.rules.value') }}</li>
      <li>{{ t('portfolioDashboard.counting.rules.testnets') }}</li>
      <li>{{ t('portfolioDashboard.counting.rules.excluded') }}</li>
      <li>{{ t('portfolioDashboard.counting.rules.filter') }}</li>
      <li v-if="allWallets" data-testid="countingAllWalletsRule">{{ t('portfolioDashboard.counting.rules.allWallets') }}</li>
    </ul>

    <section class="now" aria-labelledby="counting-now">
      <h3 id="counting-now" class="now-title">{{ t('portfolioDashboard.counting.now') }}</h3>

      <ul v-if="items.length" class="now-list" data-testid="countingExcluded">
        <li v-for="item in items" :key="item.id" :data-testid="item.id">{{ item.text }}</li>
      </ul>
      <p v-else class="now-none" data-testid="countingNone">{{ t('portfolioDashboard.counting.none') }}</p>
    </section>
  </PortfolioSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PortfolioSheet from '@/screens/portfolio/PortfolioSheet.vue';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{
  /** The scope the total is for: All wallets adds one rule. */
  allWallets: boolean;
  hiddenCount: number;
  unpricedCount: number;
  unavailableCount: number;
  poolStakesExcluded: boolean;
}>();

defineEmits<{ (event: 'close'): void }>();

const { t, tc } = useI18n();

// Named, never dropped silently: each exclusion the total has right now, in words.
const items = computed(() =>
  [
    props.hiddenCount ? { id: 'countingHidden', text: tc('portfolioDashboard.counting.hidden', props.hiddenCount, { count: props.hiddenCount }) } : null,
    props.unpricedCount ? { id: 'countingUnpriced', text: tc('portfolioDashboard.counting.unpriced', props.unpricedCount, { count: props.unpricedCount }) } : null,
    props.unavailableCount ? { id: 'countingUnavailable', text: tc('portfolioDashboard.counting.unavailable', props.unavailableCount, { count: props.unavailableCount }) } : null,
    props.poolStakesExcluded ? { id: 'countingPoolStakes', text: t('portfolioDashboard.counting.poolStakes') } : null,
  ].filter((item): item is { id: string; text: string } => item !== null)
);
</script>

<style lang="scss" scoped>
.rules,
.now-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--fw-text-2);
}

.now {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--fw-divider);
}

.now-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fw-text-3);
}

.now-none {
  margin: 0;
  color: var(--fw-text-2);
}
</style>
