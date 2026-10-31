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
      :showSend="true"
      :showReceive="singleWallet ? receiveAvailable : anyWalletTakesFunds"
      :showSwap="singleWallet ? swapAvailable : anyWalletTakesFunds"
      @openFiats="$emit('openFiats')"
      @openCounting="countingOpen = true"
      @openSync="syncOpen = true"
      @send="act('send')"
      @receive="act('receive')"
      @swap="act('swap')"
    />

    <!-- The wallet screen's views (Assets, Portfolio, NFTs) sit right under the balance. -->
    <slot name="toolbar" :allWallets="!singleWallet" />

    <div v-if="!singleWallet && showAllWalletsList" class="all-panel" data-testid="allWalletsPanel">
      <PortfolioAllWallets
        :lens="dashboard.lens.value"
        :tokenRows="dashboard.tokenRows.value"
        :networkSections="dashboard.networkSections.value"
        :wallets="dashboard.aggregate.value.wallets"
        :slotOf="slotOf"
        :activeKey="null"
        :focus="null"
        :loading="dashboard.pending.value"
        :readinessOf="readinessOf"
        :iconOf="dashboard.iconOf"
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

    <!-- All wallets acts through one wallet: it is chosen first, then selected, then the action goes on there. -->
    <PortfolioSheet v-if="walletChoice" :title="walletChoiceTitle" testid="walletChooser" @close="walletChoice = null">
      <p v-if="switchFailed" class="chooser-note" role="alert">{{ t('portfolioDashboard.where.switchFailed', { wallet: switchFailed }) }}</p>
      <ul class="chooser" data-testid="walletChooserOptions">
        <li v-for="wallet in walletChoices" :key="wallet.address">
          <button
            type="button"
            class="chooser-option"
            :disabled="Boolean(switching)"
            :data-address="wallet.address"
            data-testid="walletChooserOption"
            @click="chooseWallet(wallet.address, wallet.name)"
          >
            <span class="chooser-name">{{ wallet.name }}</span>
            <span class="chooser-total">{{ formatFiatValue(wallet.total) }}</span>
          </button>
        </li>
      </ul>
      <p v-if="switching" class="chooser-note" role="status">{{ t('portfolioDashboard.where.switching', { wallet: switching }) }}</p>
    </PortfolioSheet>

    <AssetPickerSheet v-if="assetPicker" :action="assetPicker" @close="assetPicker = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, onDeactivated, ref, toRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { PortfolioSummary, PortfolioSummaryInput } from '@/portfolio/assetIdentity';
import type { AllWalletsLens } from '@/portfolio/dashboard/preferences';
import AssetPickerSheet from '@/screens/portfolio/AssetPickerSheet.vue';
import PortfolioAllWallets from '@/screens/portfolio/PortfolioAllWallets.vue';
import PortfolioCountingSheet from '@/screens/portfolio/PortfolioCountingSheet.vue';
import PortfolioHero from '@/screens/portfolio/PortfolioHero.vue';
import PortfolioSheet from '@/screens/portfolio/PortfolioSheet.vue';
import PortfolioSyncSheet from '@/screens/portfolio/PortfolioSyncSheet.vue';
import { locationsLocation } from '@/portfolio/dashboard/handoff';
import { registerDashboardMessages } from '@/portfolio/dashboard/locales';
import { usePortfolioDashboard } from '@/portfolio/dashboard/usePortfolioDashboard';
import { useReadiness } from '@/portfolio/dashboard/useReadiness';
import { useWalletSwitch } from '@/portfolio/dashboard/useWalletSwitch';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { Components } from '@/router/routes';
import { forceAssetDiscoverySweep, updateCurrentAccount } from '@/extension/messaging';
import { IS_EXTENSION } from '@/consts/global';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';
import { usePortfolioDashboardStore } from '@/stores/portfolioDashboard';
import { isSelectedWalletRecoveryOnly } from '@/util/walletRecoveryPolicy';

registerDashboardMessages();

type HomeAction = 'send' | 'receive' | 'swap';

const props = withDefaults(
  defineProps<{
    /** The selected wallet's portfolio summary, as the header has always shown it. */
    summary: PortfolioSummary;
    summaryInput: PortfolioSummaryInput;
    hiddenKeys: ReadonlySet<string>;
    /** The caption the wallet screen has for a filtered view, such as "Showing Ethereum · $1,620.00". */
    caption: string;
    loading: boolean;
    /** False for a recovery-only wallet: swaps are closed to it, so a Swap button would only bounce back. */
    swapAvailable?: boolean;
    /** False for a recovery-only wallet: nothing new should be sent to it. */
    receiveAvailable?: boolean;
    /** All wallets lists its holdings on the Assets view; its Portfolio view is the wallet screen's own. */
    showAllWalletsList?: boolean;
  }>(),
  { swapAvailable: true, receiveAvailable: true, showAllWalletsList: true }
);

defineEmits<{ (event: 'openFiats'): void }>();

const router = useRouter();
const { t } = useI18n();
const accountsStore = useAccountsStore();
const dashboardStore = usePortfolioDashboardStore();
const dashboard = usePortfolioDashboard({ summaryInput: toRef(props, 'summaryInput'), hiddenKeys: toRef(props, 'hiddenKeys') });
const { readinessOf } = useReadiness();
const { switching, switchTo } = useWalletSwitch();
const { formatFiatValue } = usePortfolioFormatting();

const countingOpen = ref(false);
const syncOpen = ref(false);
const refreshing = ref(false);
const assetPicker = ref<'send' | 'receive' | null>(null);
const walletChoice = ref<HomeAction | null>(null);
const switchFailed = ref('');

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

const recoveryOnly = (address: string): boolean => IS_EXTENSION && isSelectedWalletRecoveryOnly(accountsStore.accounts, address);

// Receive and Swap are closed to a recovery-only wallet (walletRecoveryPolicy.ts), so it is not offered for them, and
// All wallets offers neither when no wallet could take them.
const walletChoices = computed(() =>
  dashboard.aggregate.value.wallets.filter(({ address }) => walletChoice.value === 'send' || !recoveryOnly(address))
);
const anyWalletTakesFunds = computed(() => dashboard.aggregate.value.wallets.some(({ address }) => !recoveryOnly(address)));
const walletChoiceTitle = computed(() =>
  t(
    walletChoice.value === 'send'
      ? 'walletHome.picker.sendTitle'
      : walletChoice.value === 'receive'
        ? 'walletHome.picker.receiveTitle'
        : 'walletHome.swap'
  )
);

function continueWith(action: HomeAction): void {
  if (action === 'swap') void router.push({ name: Components.Polkaswap });
  else assetPicker.value = action;
}

function act(action: HomeAction): void {
  if (singleWallet.value) {
    continueWith(action);
    return;
  }

  switchFailed.value = '';
  walletChoice.value = action;
}

async function chooseWallet(address: string, name: string): Promise<void> {
  const action = walletChoice.value;
  if (!action || switching.value) return;

  // The switch waits for the app's own redirect to the portfolio, so what comes next is not overtaken by it.
  if (!(await switchTo(address))) {
    switchFailed.value = name;
    return;
  }

  walletChoice.value = null;
  dashboardStore.setScope('wallet');
  continueWith(action);
}

function openLocations(tokenKey: string, holdingId?: string): void {
  void router.push(locationsLocation(tokenKey, holdingId));
}

function setLens(lens: AllWalletsLens): void {
  dashboardStore.setLens(lens);
}

async function openWallet(address: string): Promise<void> {
  const account = accountsStore.accounts.find((candidate) => candidate.address === address);

  if (!account) return;

  await updateCurrentAccount(address, account.walletEcosystem);
  dashboardStore.setScope('wallet');
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

// A sheet that belongs to one scope closes when the scope changes; none stays open over another screen.
watch(dashboard.scope, () => (walletChoice.value = null));
onDeactivated(() => {
  walletChoice.value = null;
  assetPicker.value = null;
});
</script>

<style lang="scss" scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.all-panel {
  min-width: 0;
}

.chooser {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chooser-option {
  box-sizing: border-box;
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--fw-text-1);
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--fw-raised-2);
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: -2px;
  }
}

.chooser-name {
  min-width: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.chooser-total {
  color: var(--fw-text-2);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.chooser-note {
  margin: 0;
  color: var(--fw-text-2);
  font-size: 0.78rem;
}
</style>
