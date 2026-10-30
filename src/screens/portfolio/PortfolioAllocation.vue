<template>
  <section class="allocation" :aria-label="t('walletHome.allocation.title')" data-testid="portfolioAllocation">
    <div class="segmented" role="group" :aria-label="t('walletHome.allocation.lens')" data-testid="allocationLens">
      <button
        v-for="option in lensOptions"
        :key="option.value"
        type="button"
        class="segment"
        :aria-pressed="lens === option.value"
        :data-testid="`allocationLens-${option.value}`"
        @click="setLens(option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-if="pending" class="state" role="status" aria-live="polite" data-testid="allocationLoading">
      <Shimmer height="180px" width="100%" />
      <span class="sr-only">{{ t('portfolioPage.loadingBalances') }}</span>
    </div>

    <p v-else-if="!groups.length" class="state state--empty" data-testid="allocationEmpty">{{ t('walletHome.allocation.empty') }}</p>

    <template v-else>
      <!-- The winged sun is the chart: one ray per percent, coloured by what it stands for (design spec 3.1). -->
      <div class="chart">
        <PortfolioSky class="chart-sky" :groups="groups" :activeKey="activeKey" @select="select" />
      </div>

      <ul class="rows" data-testid="allocationRows">
        <li v-for="group in groups" :key="group.key">
          <button
            type="button"
            class="row"
            :class="{ 'row--active': group.key === activeKey }"
            :aria-pressed="group.key === activeKey"
            :aria-label="rowLabel(group)"
            :data-key="group.key"
            data-testid="allocationRow"
            @click="select(group.key)"
          >
            <span class="dot" :style="{ background: chartColour(group.slot) }" aria-hidden="true"></span>
            <span class="name">{{ nameOf(group) }}</span>
            <span class="bar" aria-hidden="true">
              <span class="bar-fill" :style="{ width: `${Math.max(group.share, 1)}%`, background: chartColour(group.slot) }"></span>
            </span>
            <span class="share">{{ formatShare(group.share) }}%</span>
            <span class="value">{{ formatFiatValue(String(group.value)) }}</span>
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import PortfolioSky from '@/screens/portfolio/PortfolioSky.vue';
import { buildAllocation, type AllocationFacet, type AllocationGroup } from '@/portfolio/dashboard/allocation';
import { allocationEntities, seedSlots } from '@/portfolio/dashboard/facets';
import { formatShare } from '@/portfolio/dashboard/format';
import { locationsLocation } from '@/portfolio/dashboard/handoff';
import { registerDashboardMessages } from '@/portfolio/dashboard/locales';
import { slotMapKey } from '@/portfolio/dashboard/preferences';
import { chartColour } from '@/portfolio/dashboard/skyGeometry';
import { usePortfolioDashboard } from '@/portfolio/dashboard/usePortfolioDashboard';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { Components } from '@/router/routes';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';
import { usePortfolioDashboardStore } from '@/stores/portfolioDashboard';

registerDashboardMessages();

const router = useRouter();
const { t } = useI18n();
const accountsStore = useAccountsStore();
const store = usePortfolioDashboardStore();
const { formatFiatValue } = usePortfolioFormatting();
const { summaryInput, hiddenKeys } = usePortfolio();
const dashboard = usePortfolioDashboard({ summaryInput, hiddenKeys });

// The chart's own lens: picking Networks here never regroups the Assets list.
const lens = ref<AllocationFacet>('token');
const activeKey = ref<string | null>(null);

const lensOptions = computed(() => [
  { value: 'token' as const, label: t('walletHome.allocation.tokens') },
  { value: 'network' as const, label: t('walletHome.allocation.networks') },
  ...(dashboard.scope.value === 'all' ? [{ value: 'wallet' as const, label: t('portfolioDashboard.lens.wallets') }] : []),
]);

const pending = computed(() => dashboard.pending.value || accountsStore.isBalanceLoading);
const slotKey = computed(() => slotMapKey(dashboard.scope.value, lens.value, accountsStore.selectedWallet.address));
const allocation = computed(() =>
  buildAllocation(
    allocationEntities(lens.value, dashboard.refs.value, dashboard.groupOf.value),
    store.preferences.slots[slotKey.value] ?? seedSlots(lens.value, dashboard.refs.value, dashboard.groupOf.value)
  )
);
const groups = computed<AllocationGroup[]>(() => allocation.value.groups);

// A colour follows its entity from one visit to the next, as on the rest of the dashboard.
watch(
  allocation,
  ({ slots }) => {
    if (Object.keys(slots).length) store.setSlots(slotKey.value, slots);
  },
  { immediate: true }
);
// A highlight belongs to one lens of one scope, and to a group that is still there.
watch([lens, dashboard.scope], () => (activeKey.value = null));
watch(groups, (current) => {
  if (activeKey.value && !current.some(({ key }) => key === activeKey.value)) activeKey.value = null;
});
watch(dashboard.scope, (scope) => {
  if (scope === 'wallet' && lens.value === 'wallet') lens.value = 'token';
});

function setLens(value: AllocationFacet): void {
  lens.value = value;
}

const nameOf = (group: AllocationGroup): string => (group.key === 'other' ? t('walletHome.allocation.other') : group.name);

const rowLabel = (group: AllocationGroup): string =>
  t('walletHome.allocation.row', { name: nameOf(group), percent: formatShare(group.share), value: formatFiatValue(String(group.value)) });

// The first pick highlights a group in the chart; picking a token again opens it, as its row in the list does.
function select(key: string): void {
  if (activeKey.value !== key) {
    activeKey.value = key;
    return;
  }

  activeKey.value = null;
  if (lens.value !== 'token' || key === 'other') return;

  if (dashboard.scope.value === 'all') void router.push(locationsLocation(key));
  else void router.push({ name: Components.TokenOverview, params: { token: key } });
}
</script>

<style lang="scss" scoped>
.allocation {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 4px 0 20px;
}

.segmented {
  align-self: center;
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--fw-divider);
  border-radius: 16px;
  background: var(--fw-raised);
}

.segment {
  min-height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--fw-text-2);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;

  &[aria-pressed='true'] {
    background: var(--fw-select-fill);
    color: var(--fw-text-1);
    font-weight: 700;
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 1px;
  }
}

.state {
  margin: 0;
  padding: 24px 8px;
  color: var(--fw-text-2);
  font-size: 0.8rem;
  text-align: center;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

// The sun sits centred; its wings run to the panel's edges.
.chart {
  position: relative;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.chart-sky {
  --sky-veil: 1;
}

.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  display: grid;
  grid-template-columns: 10px minmax(64px, 0.9fr) minmax(48px, 1fr) 44px minmax(72px, auto);
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--fw-text-1);
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--fw-raised-2);
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: -2px;
  }
}

.row--active {
  background: var(--fw-row-selected);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.name {
  min-width: 0;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar {
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: var(--fw-raised-2);
  overflow: hidden;
}

.bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 3px;
}

.share {
  color: var(--fw-text-2);
  font-size: 0.8rem;
  text-align: right;
}

.value {
  font-size: 0.85rem;
  font-weight: 600;
  text-align: right;
}

@media (max-width: 380px) {
  .row {
    grid-template-columns: 10px minmax(56px, 1fr) 40px minmax(64px, auto);
  }

  .bar {
    display: none;
  }
}
</style>
