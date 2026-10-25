<template>
  <PortfolioSheet :title="t('portfolioDashboard.where.swapSheet.title')" testid="portfolioSwapSheet" @close="$emit('close')">
    <section class="pay" data-testid="swapPay">
      <span class="label">{{ t('portfolioDashboard.where.swapSheet.pay') }}</span>
      <div class="pay-row">
        <strong class="pay-symbol">{{ symbol }}</strong>
        <span class="pay-meta">{{ holding.walletName }}</span>
      </div>
      <span class="pay-meta">{{ t('portfolioDashboard.where.swapSheet.transferable', { amount: `${formatAmount(holding.transferable)} ${symbol}` }) }}</span>
    </section>

    <section v-if="targets.length" class="targets" aria-labelledby="swap-targets">
      <span id="swap-targets" class="label">{{ t('portfolioDashboard.where.swapSheet.to') }}</span>
      <div class="target-row" role="radiogroup" :aria-labelledby="'swap-targets'">
        <button
          v-for="target in targets"
          :key="target.assetId"
          type="button"
          role="radio"
          class="target"
          :aria-checked="target.assetId === chosen"
          :data-testid="`swapTarget-${target.symbol}`"
          @click="picked = target.assetId"
        >
          {{ target.symbol }}
        </button>
      </div>
    </section>

    <PortfolioCheckList :checks="checks.checks" :show="['account', 'swaps', 'disclaimer']" :unknownIn="switchTo ?? undefined" />

    <p class="hint">{{ t('portfolioDashboard.where.swapSheet.hint') }}</p>
    <p v-if="blocked" class="blocked" role="note" data-testid="swapBlocked">{{ t(`portfolioDashboard.where.actions.blocked.${blocked}`) }}</p>
    <p v-if="switchTo" class="switch" data-testid="swapSwitchNote">{{ t('portfolioDashboard.where.switchNote', { wallet: switchTo }) }}</p>
    <p v-if="switchFailed" class="blocked" role="alert">{{ t('portfolioDashboard.where.switchFailed', { wallet: switchTo ?? '' }) }}</p>

    <button type="button" class="primary" :disabled="Boolean(blocked) || busy" :aria-busy="busy" data-testid="swapOpen" @click="$emit('confirm', chosen || undefined)">
      {{ busy && switchTo ? t('portfolioDashboard.where.switching', { wallet: switchTo }) : openLabel }}
    </button>
  </PortfolioSheet>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ActionBlock } from '@/portfolio/dashboard/actions';
import type { LocationHolding } from '@/portfolio/dashboard/locations';
import type { PolkaswapChecks } from '@/portfolio/dashboard/polkaswapChecks';
import PortfolioSheet from '@/screens/portfolio/PortfolioSheet.vue';
import PortfolioCheckList from '@/screens/portfolio/PortfolioCheckList.vue';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { useI18n } from '@/locales/useI18n';

export interface SwapTarget {
  assetId: string;
  symbol: string;
}

const props = defineProps<{
  symbol: string;
  holding: LocationHolding;
  /** Popular SORA assets to swap to, the pay asset left out; the first is chosen. */
  targets: SwapTarget[];
  checks: PolkaswapChecks;
  blocked?: ActionBlock;
  /** The wallet to switch to first, when the holding is in another wallet. */
  switchTo: string | null;
  busy: boolean;
  switchFailed: boolean;
}>();

defineEmits<{ (event: 'confirm', targetAssetId?: string): void; (event: 'close'): void }>();

const { t } = useI18n();
const { formatAmount } = usePortfolioFormatting();
const picked = ref('');
// The first target stands until one is picked, including when the registry's assets arrive after the sheet opens.
const chosen = computed(() => (props.targets.some(({ assetId }) => assetId === picked.value) ? picked.value : (props.targets[0]?.assetId ?? '')));

const openLabel = computed(() =>
  props.switchTo
    ? t('portfolioDashboard.where.actions.switchAnd', { wallet: props.switchTo, action: t('portfolioDashboard.where.actions.openPolkaswap') })
    : t('portfolioDashboard.where.swapSheet.open')
);
</script>

<style lang="scss" scoped>
.label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fw-text-3);
}

.pay,
.targets {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pay {
  padding: 10px 12px;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 12px;
  background: var(--fw-raised-2);
}

.pay-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.pay-symbol {
  font-size: 1rem;
}

.pay-meta {
  color: var(--fw-text-2);
  font-size: 0.75rem;
}

.target-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.target {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 22px;
  background: var(--fw-raised);
  color: var(--fw-text-1);
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &[aria-checked='true'] {
    border-color: var(--fw-select-edge);
    background: var(--fw-select-fill);
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

.hint,
.switch {
  margin: 0;
  color: var(--fw-text-2);
  font-size: 0.75rem;
}

.blocked {
  margin: 0;
  padding: 8px 10px;
  border: 1px dashed var(--fw-stroke-control);
  border-radius: 10px;
  color: var(--fw-text-1);
  font-size: 0.75rem;
}

.primary {
  min-height: 48px;
  padding: 0 16px;
  border: 1px solid var(--fw-accent-edge);
  border-radius: 12px;
  background: linear-gradient(180deg, var(--fw-fill-top), var(--fw-fill-bottom));
  color: var(--fw-on-accent);
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    border-style: dashed;
    background: var(--fw-raised-2);
    color: var(--fw-text-2);
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}
</style>
