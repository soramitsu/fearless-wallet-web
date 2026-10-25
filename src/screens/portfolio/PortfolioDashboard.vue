<template>
  <div class="dashboard" data-testid="portfolioDashboard">
    <PortfolioHero
      :total="heroTotal"
      :changeAmount="heroChangeAmount"
      :changePercent="heroChangePercent"
      :caption="singleWallet ? caption : ''"
      :hiddenCount="exclusions.hidden"
      :unpricedCount="exclusions.unpriced"
      :unavailableCount="exclusions.unavailable"
      :poolStakesExcluded="exclusions.poolStakes"
      :loading="heroLoading"
      :sync="dashboard.syncState.value"
      :groups="dashboard.allocation.value.groups"
      :activeKey="activeKey"
      :showSwap="singleWallet"
      @openFiats="$emit('openFiats')"
      @openCounting="countingOpen = true"
      @openSync="syncOpen = true"
      @select="select"
      @swap="openSwap"
    />

    <div v-if="!singleWallet" class="all-panel" data-testid="allWalletsPanel">
      <PortfolioAllWallets
        :lens="dashboard.lens.value"
        :tokenRows="dashboard.tokenRows.value"
        :networkSections="dashboard.networkSections.value"
        :wallets="dashboard.aggregate.value.wallets"
        :slotOf="slotOf"
        :activeKey="activeKey"
        :focus="focus"
        :loading="dashboard.pending.value"
        :readinessOf="readinessOf"
        @update:lens="setLens"
        @openWallet="openWallet"
        @open="openLocations"
      />
    </div>

    <PortfolioCountingSheet
      v-if="countingOpen"
      :allWallets="!singleWallet"
      :hiddenCount="exclusions.hidden"
      :unpricedCount="exclusions.unpriced"
      :unavailableCount="exclusions.unavailable"
      :poolStakesExcluded="exclusions.poolStakes"
      @close="countingOpen = false"
    />

    <PortfolioSyncSheet v-if="syncOpen" :state="dashboard.syncState.value" :refreshing="refreshing" @close="syncOpen = false" @refresh="refreshBalances" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { PortfolioSummary, PortfolioSummaryInput } from '@/portfolio/assetIdentity';
import type { AllWalletsLens } from '@/portfolio/dashboard/preferences';
import PortfolioAllWallets from '@/screens/portfolio/PortfolioAllWallets.vue';
import PortfolioCountingSheet from '@/screens/portfolio/PortfolioCountingSheet.vue';
import PortfolioHero from '@/screens/portfolio/PortfolioHero.vue';
import PortfolioSyncSheet from '@/screens/portfolio/PortfolioSyncSheet.vue';
import { locationsLocation } from '@/portfolio/dashboard/handoff';
import { registerDashboardMessages } from '@/portfolio/dashboard/locales';
import { usePortfolioDashboard } from '@/portfolio/dashboard/usePortfolioDashboard';
import { useReadiness } from '@/portfolio/dashboard/useReadiness';
import { Components } from '@/router/routes';
import { forceAssetDiscoverySweep, updateCurrentAccount } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';
import { usePortfolioDashboardStore } from '@/stores/portfolioDashboard';

registerDashboardMessages();

const props = defineProps<{
  /** The selected wallet's portfolio summary, as the header has always shown it. */
  summary: PortfolioSummary;
  summaryInput: PortfolioSummaryInput;
  hiddenKeys: ReadonlySet<string>;
  /** The caption the wallet screen has for a filtered view, such as "Showing Ethereum · $1,620.00". */
  caption: string;
  loading: boolean;
}>();

defineEmits<{ (event: 'openFiats'): void }>();

const router = useRouter();
const accountsStore = useAccountsStore();
const dashboardStore = usePortfolioDashboardStore();
const dashboard = usePortfolioDashboard({ summaryInput: toRef(props, 'summaryInput'), hiddenKeys: toRef(props, 'hiddenKeys') });
const { readinessOf } = useReadiness();

const activeKey = ref<string | null>(null);
const focus = ref<{ key: string; count: number } | null>(null);
const countingOpen = ref(false);
const syncOpen = ref(false);
const refreshing = ref(false);

const singleWallet = computed(() => dashboard.scope.value === 'wallet');

// One wallet reads exactly as the header always has; All wallets is the sum of every wallet's own total.
const heroTotal = computed(() => (singleWallet.value ? props.summary.total : dashboard.aggregate.value.total));
const heroChangeAmount = computed(() => (singleWallet.value ? props.summary.changeAmount : dashboard.aggregate.value.changeAmount));
const heroChangePercent = computed(() => (singleWallet.value ? props.summary.changePercent : dashboard.aggregate.value.changePercent));
const heroLoading = computed(() => props.loading || dashboard.pending.value);
const exclusions = computed(() => {
  const source = singleWallet.value ? props.summary : dashboard.aggregate.value;

  return {
    hidden: source.hiddenCount,
    unpriced: source.unpricedCount,
    unavailable: source.unavailableCount,
    poolStakes: source.poolStakesExcluded,
  };
});

const slotOf = (key: string): number => dashboard.allocation.value.slots[key] ?? 0;

// A chip or a ray: the first pick highlights the group, the second opens it (All wallets: its row; one wallet: Where it lives).
function select(key: string): void {
  if (activeKey.value !== key) {
    activeKey.value = key;

    return;
  }

  if (singleWallet.value) {
    // One wallet has no list to open, so the second pick opens the token itself; the others only clear the highlight.
    activeKey.value = null;
    if (dashboard.lens.value === 'token' && key !== 'other') openLocations(key);
  } else focus.value = { key, count: (focus.value?.count ?? 0) + 1 };
}

function openLocations(tokenKey: string, holdingId?: string): void {
  void router.push(locationsLocation(tokenKey, holdingId));
}

// A highlight belongs to one lens of one scope, and to a group that is still there.
watch([dashboard.scope, dashboard.lens], () => {
  activeKey.value = null;
  focus.value = null;
});
watch(
  () => dashboard.allocation.value.groups,
  (groups) => {
    if (activeKey.value && !groups.some(({ key }) => key === activeKey.value)) activeKey.value = null;
  }
);

function setLens(lens: AllWalletsLens): void {
  dashboardStore.setLens(lens);
}

async function openWallet(address: string): Promise<void> {
  const account = accountsStore.accounts.find((candidate) => candidate.address === address);

  if (!account) return;

  await updateCurrentAccount(address, account.walletEcosystem);
  dashboardStore.setScope('wallet');
}

function openSwap(): void {
  void router.push({ name: Components.Polkaswap });
}

async function refreshBalances(): Promise<void> {
  if (refreshing.value) return;

  refreshing.value = true;
  try {
    // The same sweep the list's Refresh runs, then a fresh read of every wallet.
    await forceAssetDiscoverySweep().catch(() => undefined);
    await dashboard.refresh();
  } finally {
    refreshing.value = false;
  }
}
</script>

<style lang="scss" scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

// The same panel the wallet list sits in (ContentForm), without its fixed height: the screen scrolls as one.
.all-panel {
  min-width: 0;
  border: $default-border;
  border-radius: $default-border-radius;
  background: $secondary-background-color;
  clip-path: $big-clip-path-left-top;
}

@include v1-palette {
  .all-panel {
    border-radius: 16px;
  }
}
</style>
