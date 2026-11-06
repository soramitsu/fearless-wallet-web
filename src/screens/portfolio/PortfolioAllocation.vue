<template>
  <section class="allocation" :aria-label="t('walletHome.allocation.title')" data-testid="portfolioAllocation">
    <div v-if="pending" class="state" role="status" aria-live="polite" data-testid="allocationLoading">
      <Shimmer height="180px" width="100%" />
      <span class="sr-only">{{ t('portfolioPage.loadingBalances') }}</span>
    </div>

    <p v-else-if="!tokenGroups.length" class="state state--empty" data-testid="allocationEmpty">{{ t('walletHome.allocation.empty') }}</p>

    <template v-else>
      <!-- The winged sun is the chart: one ray per percent, coloured by token (design spec 3.1). -->
      <div class="chart">
        <PortfolioSky class="chart-sky" :groups="tokenGroups" :activeKey="activeKey" @select="select" />
      </div>

      <!-- Every split of the total on one page, one after another: by token, by network and, for All wallets, by wallet. -->
      <div v-for="part in parts" :key="part.facet" class="part" :data-facet="part.facet">
        <h3 class="part-title">{{ part.title }}</h3>

        <ul class="rows" :data-testid="part.facet === 'token' ? 'allocationRows' : `allocationRows-${part.facet}`">
          <li v-for="group in part.groups" :key="group.key">
            <component
              :is="opens(part.facet, group) ? 'button' : 'div'"
              :type="opens(part.facet, group) ? 'button' : undefined"
              class="row"
              :class="{ 'row--active': part.facet === 'token' && group.key === activeKey }"
              :aria-pressed="part.facet === 'token' ? group.key === activeKey : undefined"
              :aria-label="rowLabel(group)"
              :data-key="group.key"
              :data-testid="part.facet === 'token' ? 'allocationRow' : `allocationRow-${part.facet}`"
              @click="pick(part.facet, group)"
            >
              <span class="dot" :style="{ background: chartColour(group.slot) }" aria-hidden="true"></span>
              <span class="name">{{ nameOf(group) }}</span>
              <span class="bar" aria-hidden="true">
                <span class="bar-fill" :style="{ width: `${Math.max(group.share, 1)}%`, background: chartColour(group.slot) }"></span>
              </span>
              <span class="share">{{ formatShare(group.share) }}%</span>
              <span class="value">{{ formatFiatValue(String(group.value)) }}</span>
            </component>
          </li>
        </ul>
      </div>
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

const activeKey = ref<string | null>(null);

const pending = computed(() => dashboard.pending.value || accountsStore.isBalanceLoading);
const allWallets = computed(() => dashboard.scope.value === 'all');
const facets = computed<AllocationFacet[]>(() => (allWallets.value ? ['token', 'network', 'wallet'] : ['token', 'network']));

// Each split keeps its own colours from one visit to the next, as on the rest of the dashboard.
const allocations = computed(() =>
  facets.value.map((facet) => {
    const key = slotMapKey(dashboard.scope.value, facet, accountsStore.selectedWallet.address);
    const allocation = buildAllocation(
      allocationEntities(facet, dashboard.refs.value, dashboard.groupOf.value),
      store.preferences.slots[key] ?? seedSlots(facet, dashboard.refs.value, dashboard.groupOf.value)
    );

    return { facet, key, allocation };
  })
);

watch(
  allocations,
  (list) =>
    list.forEach(({ key, allocation }) => {
      if (Object.keys(allocation.slots).length) store.setSlots(key, allocation.slots);
    }),
  { immediate: true }
);

const tokenGroups = computed<AllocationGroup[]>(() => allocations.value.find(({ facet }) => facet === 'token')?.allocation.groups ?? []);

const titles: Record<AllocationFacet, string> = {
  token: 'walletHome.allocation.tokens',
  network: 'walletHome.allocation.networks',
  wallet: 'portfolioDashboard.lens.wallets',
};

const parts = computed(() =>
  allocations.value
    .filter(({ allocation }) => allocation.groups.length)
    .map(({ facet, allocation }) => ({ facet, title: t(titles[facet]), groups: allocation.groups }))
);

// A highlight belongs to one scope, and to a token that is still there.
watch(dashboard.scope, () => (activeKey.value = null));
watch(tokenGroups, (current) => {
  if (activeKey.value && !current.some(({ key }) => key === activeKey.value)) activeKey.value = null;
});

const nameOf = (group: AllocationGroup): string => (group.key === 'other' ? t('walletHome.allocation.other') : group.name);

const rowLabel = (group: AllocationGroup): string =>
  t('walletHome.allocation.row', { name: nameOf(group), percent: formatShare(group.share), value: formatFiatValue(String(group.value)) });

/** A token row highlights its rays, then opens; one wallet's network row opens the list on that network. */
const opens = (facet: AllocationFacet, group: AllocationGroup): boolean =>
  group.key !== 'other' && (facet === 'token' || (facet === 'network' && !allWallets.value));

function pick(facet: AllocationFacet, group: AllocationGroup): void {
  if (!opens(facet, group)) return;
  if (facet === 'token') {
    select(group.key);
    return;
  }

  // Only networks that hold something have a row, so their balances are already read.
  accountsStore.setSelectedNetwork(group.key);
  void router.push({ name: Components.Currencies });
}

// The first pick highlights a token in the chart; picking it again opens it, as its row in the list does.
function select(key: string): void {
  if (activeKey.value !== key) {
    activeKey.value = key;
    return;
  }

  activeKey.value = null;
  if (key === 'other') return;

  if (allWallets.value) void router.push(locationsLocation(key));
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

.part {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.part-title {
  margin: 4px 10px 0;
  // The app centres its text; a list's heading sits over its rows.
  text-align: left;
  color: var(--fw-text-2);
  font-size: 0.75rem;
  font-weight: 700;
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

  &:is(button) {
    cursor: pointer;
  }

  &:is(button):hover {
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
