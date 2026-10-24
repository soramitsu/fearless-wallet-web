<template>
  <section class="breakdown" :aria-labelledby="titleId" data-testid="portfolioBreakdown">
    <h3 :id="titleId" class="title">{{ t('portfolioDashboard.where.breakdown.title') }}</h3>

    <!-- A bar with a pattern: the solid part can be sent now, the hatched part is held back. Words carry it as well. -->
    <div class="bar" role="img" :aria-label="t('portfolioDashboard.where.breakdown.bar', { percent: sendablePercent })">
      <span class="bar-sendable" :style="{ width: `${sendablePercent}%` }"></span>
      <span class="bar-held"></span>
    </div>

    <dl class="rows">
      <div class="row">
        <dt><span class="swatch swatch--sendable" aria-hidden="true"></span>{{ t('portfolioDashboard.where.breakdown.transferable') }}</dt>
        <dd data-testid="breakdownTransferable">{{ formatAmount(transferable) }} {{ symbol }}</dd>
      </div>
      <div class="row">
        <dt><span class="swatch swatch--held" aria-hidden="true"></span>{{ t('portfolioDashboard.where.breakdown.held') }}</dt>
        <dd data-testid="breakdownHeld">{{ formatAmount(held) }} {{ symbol }}</dd>
      </div>
      <div class="row row--total">
        <dt>{{ t('portfolioDashboard.where.breakdown.total') }}</dt>
        <dd data-testid="breakdownTotal">{{ formatAmount(amount) }} {{ symbol }}</dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FPNumber } from '@sora-substrate/util';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{ amount: string; transferable: string; held: string; symbol: string }>();

const { t } = useI18n();
const { formatAmount } = usePortfolioFormatting();
const titleId = `breakdown-${Math.random().toString(36).slice(2, 8)}`;

// How much of what is counted can be sent now, as a whole percent for the bar and its words.
const sendablePercent = computed(() => {
  const total = new FPNumber(props.amount || '0');

  if (!total.isGtZero()) return 0;

  const percent = new FPNumber(props.transferable || '0').div(total).mul(FPNumber.HUNDRED).toNumber();

  return Math.min(100, Math.max(0, Math.round(percent)));
});
</script>

<style lang="scss" scoped>
.breakdown {
  display: flex;
  flex-direction: column;
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

.bar {
  display: flex;
  height: 10px;
  overflow: hidden;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 5px;
}

.bar-sendable {
  flex: none;
  background: var(--fw-info);
}

.bar-held {
  flex: 1;
  background: repeating-linear-gradient(135deg, var(--fw-text-3) 0 2px, transparent 2px 5px);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.78rem;

  dt {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--fw-text-2);
  }

  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    text-align: right;
  }
}

.row--total {
  padding-top: 4px;
  border-top: 1px solid var(--fw-divider);

  dt {
    color: var(--fw-text-1);
    font-weight: 700;
  }
}

.swatch {
  width: 10px;
  height: 10px;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 2px;
}

.swatch--sendable {
  background: var(--fw-info);
}

.swatch--held {
  background: repeating-linear-gradient(135deg, var(--fw-text-3) 0 2px, transparent 2px 4px);
}

@media (forced-colors: active) {
  .bar-sendable,
  .swatch--sendable {
    background: Highlight;
  }
}
</style>
