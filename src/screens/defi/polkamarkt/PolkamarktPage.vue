<template>
  <div class="polkamarkt-page">
    <header class="workspace-header">
      <button v-if="selectedMarket" class="back" type="button" aria-label="Back to markets" @click="closeMarket">←</button>
      <div>
        <h1>{{ selectedMarket?.title ?? 'Polkamarkt' }}</h1>
        <p>SORA Mainnet · KUSD collateral · XOR network fees</p>
      </div>
      <button class="refresh" type="button" :disabled="loading" @click="load">{{ loading ? 'Syncing' : 'Refresh' }}</button>
    </header>

    <ContentForm :height="contentHeight">
      <div v-if="loading && !snapshot" class="center-state" data-testid="polkamarkt-loading">Loading live SORA markets…</div>
      <div v-else-if="fatalError && !snapshot" class="center-state error" data-testid="polkamarkt-error">
        <strong>Markets could not be loaded</strong>
        <span>{{ fatalError }}</span>
        <button type="button" @click="load">Try again</button>
      </div>
      <Scroll v-else-if="snapshot">
        <div class="network-strip">
          <span>Block {{ snapshot.currentBlock }}</span>
          <span>{{ snapshot.markets.length }} markets</span>
          <span :class="snapshot.indexerStale ? 'warning' : 'fresh'">
            {{ snapshot.indexerStale ? 'Indexer delayed' : 'Catalog synced' }}
          </span>
        </div>

        <div v-if="uniqueWarnings.length" class="capability-state" data-testid="polkamarkt-capability-state">
          <strong>Live capability status</strong>
          <span v-for="warning in uniqueWarnings" :key="warning">{{ warning }}</span>
        </div>

        <div v-if="accountsStore.showPolkaswapAlert" class="risk-gate" data-testid="polkamarkt-disclaimer-gate">
          <strong>SORA market risk acknowledgement</strong>
          <p>Polkamarkt trades use KUSD collateral on SORA and pay XOR network fees. Quotes can move before inclusion and losses may be total.</p>
          <label><input v-model="riskAccepted" type="checkbox" /> I understand and accept the Polkaswap and SORA terms.</label>
          <button type="button" :disabled="!riskAccepted" @click="acceptRisk">Accept and continue</button>
        </div>

        <template v-if="selectedMarket">
          <section class="market-detail">
            <div class="market-meta">
              <span>{{ selectedMarket.category }}</span>
              <span class="status" :class="selectedMarket.displayStatus">{{ selectedMarket.displayStatus }}</span>
              <span>Closes at block {{ selectedMarket.closeBlock ?? '—' }}</span>
            </div>
            <p>{{ selectedMarket.description }}</p>
            <dl>
              <div><dt>YES probability</dt><dd>{{ probabilityLabel(selectedMarket.probability) }}</dd></div>
              <div><dt>Liquidity</dt><dd>{{ money(selectedMarket.liquidityUsd) }} KUSD</dd></div>
              <div><dt>Volume</dt><dd>{{ money(selectedMarket.volumeUsd) }} KUSD</dd></div>
            </dl>
            <div class="oracle">
              <strong>Resolution</strong>
              <span>{{ selectedMarket.oracle ?? 'SORA runtime oracle' }}</span>
              <small>{{ selectedMarket.resolutionSource ?? 'Review the final on-chain state before claiming.' }}</small>
            </div>
            <div class="share-row">
              <button type="button" @click="shareMarket">{{ copied ? 'Link copied' : 'Share market' }}</button>
              <span v-if="selectedMarket.runtimeOnly">Runtime-only · indexer pending</span>
            </div>
          </section>

          <section class="history-section">
            <div class="section-heading">
              <h2>Probability history</h2>
              <span>{{ snapshot.history.length ? `${snapshot.history.length} indexed points` : 'No indexed history yet' }}</span>
            </div>
            <svg v-if="historyPolyline" viewBox="0 0 280 76" role="img" aria-label="YES probability history">
              <line x1="0" y1="38" x2="280" y2="38" />
              <polyline :points="historyPolyline" />
            </svg>
          </section>

          <section class="trade-ticket">
            <div class="section-heading"><h2>Trade</h2><span>Runtime-authoritative quote</span></div>
            <div class="segmented">
              <button type="button" :class="{ selected: mode === 'buy' }" @click="setMode('buy')">Buy</button>
              <button type="button" :class="{ selected: mode === 'sell' }" @click="setMode('sell')">Sell</button>
            </div>
            <div class="segmented outcome">
              <button type="button" :class="{ selected: selectedOutcome === 'Yes' }" @click="setOutcome('Yes')">YES</button>
              <button type="button" :class="{ selected: selectedOutcome === 'No' }" @click="setOutcome('No')">NO</button>
            </div>
            <label>
              <span>{{ mode === 'buy' ? 'KUSD collateral' : `${selectedOutcome.toUpperCase()} shares` }}</span>
              <input v-model.trim="amount" inputmode="decimal" placeholder="0" @input="clearQuote" />
            </label>
            <button class="primary" type="button" :disabled="quoteDisabled || quoting" @click="requestQuote">
              {{ quoting ? 'Requesting quote…' : 'Get live quote' }}
            </button>
            <p v-if="actionReason" class="inline-reason">{{ actionReason }}</p>
            <p v-if="quoteError" class="inline-reason error">{{ quoteError }}</p>

            <div v-if="quote" class="quote-preview" data-testid="polkamarkt-quote">
              <div><span>You {{ mode === 'buy' ? 'receive' : 'receive' }}</span><strong>{{ money(quote.resultAmount) }} {{ mode === 'buy' ? 'shares' : 'KUSD' }}</strong></div>
              <div><span>Market fee</span><strong>{{ money(quote.feeAmount) }} KUSD</strong></div>
              <div><span>Network fee</span><strong>{{ money(quote.networkFee) }} XOR</strong></div>
              <div><span>Minimum received</span><strong>{{ money(quote.minimumResult) }}</strong></div>
              <button class="primary" type="button" :disabled="mutationDisabled || mutating" @click="submitTrade">
                {{ mutating ? 'Submitting…' : `Confirm ${mode}` }}
              </button>
            </div>
          </section>

          <section v-if="selectedClaim" class="claim-card">
            <div class="section-heading"><h2>Claims</h2><span>Authoritative runtime state</span></div>
            <div v-if="positive(selectedClaim.claimablePayout ?? selectedClaim.traderPayout)">
              <span>Trader payout</span>
              <strong>{{ codecMoney(selectedClaim.claimablePayout ?? selectedClaim.traderPayout) }} KUSD</strong>
              <button type="button" :disabled="!canClaimMarket || mutating" @click="claim('claimMarket')">Claim payout</button>
            </div>
            <div v-if="selectedClaim.isCreator && positive(selectedClaim.creatorFees)">
              <span>Creator fees</span>
              <strong>{{ codecMoney(selectedClaim.creatorFees) }} KUSD</strong>
              <button type="button" :disabled="!canClaimCreator || mutating" @click="claim('claimCreatorFees')">Claim creator fees</button>
            </div>
          </section>
        </template>

        <template v-else>
          <nav class="view-tabs" aria-label="Polkamarkt views">
            <button v-for="item in views" :key="item" type="button" :class="{ selected: view === item }" @click="view = item">
              {{ item }}
            </button>
          </nav>

          <template v-if="view === 'Markets'">
            <div class="filters">
              <input v-model.trim="search" type="search" placeholder="Search markets" />
              <select v-model="statusFilter" aria-label="Market status">
                <option value="active">Open</option>
                <option value="finalized">Closed</option>
                <option value="all">All</option>
              </select>
            </div>
            <div v-if="!filteredMarkets.length" class="empty-state">
              <strong>{{ statusFilter === 'active' ? 'No active markets' : 'No matching markets' }}</strong>
              <span>Closed markets and your positions remain available.</span>
              <button v-if="statusFilter === 'active'" type="button" @click="statusFilter = 'finalized'">View closed markets</button>
            </div>
            <button
              v-for="market in filteredMarkets"
              :key="market.id"
              class="market-row"
              type="button"
              :data-testid="`polkamarkt-market-${market.id}`"
              @click="openMarket(market.id)"
            >
              <span class="probability">{{ probabilityLabel(market.probability) }}</span>
              <span class="market-copy"><strong>{{ market.title }}</strong><small>{{ market.category }} · #{{ market.id }}</small></span>
              <span class="market-values"><strong>{{ money(market.volumeUsd) }} KUSD</strong><small :class="market.displayStatus">{{ market.displayStatus }}</small></span>
            </button>
          </template>

          <template v-else-if="view === 'Positions'">
            <div v-if="!snapshot.positions.length" class="empty-state"><strong>No positions yet</strong><span>Your indexed SORA market positions will appear here.</span></div>
            <button v-for="position in snapshot.positions" :key="position.id" class="position-row" type="button" @click="openMarket(position.marketId)">
              <span><strong>{{ position.marketTitle ?? `Market #${position.marketId}` }}</strong><small>{{ position.outcome ?? 'Mixed' }} position</small></span>
              <span><strong>{{ money(position.shares ?? position.yesShares ?? position.noShares ?? '0') }} shares</strong><small>{{ position.status ?? 'Indexed' }}</small></span>
            </button>
          </template>

          <template v-else>
            <div v-if="!snapshot.trades.length" class="empty-state"><strong>No market activity</strong><span>Buy, sell, and claim activity will appear after indexing.</span></div>
            <button v-for="trade in snapshot.trades" :key="trade.id" class="position-row" type="button" @click="openMarket(trade.marketId)">
              <span><strong>{{ (trade.side ?? 'trade').toUpperCase() }} {{ trade.outcome ?? '' }}</strong><small>Market #{{ trade.marketId }} · block {{ trade.blockNumber ?? 'pending' }}</small></span>
              <span><strong>{{ money(trade.collateral ?? trade.sharesIn ?? trade.sharesOut ?? '0') }}</strong><small>{{ trade.extrinsicHash ? 'Indexed' : 'Pending index' }}</small></span>
            </button>
          </template>
        </template>

        <div v-if="mutationMessage" class="mutation-message" :class="{ error: !mutationSucceeded }">{{ mutationMessage }}</div>
      </Scroll>
    </ContentForm>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  PolkamarktMutationRequest,
  PolkamarktOutcome,
  PolkamarktQuote,
  PolkamarktSnapshot,
  PolkamarktTradeMode,
} from '@/defi/polkamarkt/types';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import { formatDecimalString } from '@/helpers/numbers';
import { Components } from '@/router/routes';
import { getPolkamarktQuote, getPolkamarktSnapshot, mutatePolkamarkt } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';

const route = useRoute();
const router = useRouter();
const accountsStore = useAccountsStore();
const contentHeight = CONTENT_FORM_HEIGHT;
const views = ['Markets', 'Positions', 'Activity'] as const;
const view = ref<(typeof views)[number]>('Markets');
const snapshot = ref<PolkamarktSnapshot | null>(null);
const loading = ref(false);
const fatalError = ref('');
const search = ref('');
const statusFilter = ref<'active' | 'finalized' | 'all'>('active');
const mode = ref<PolkamarktTradeMode>('buy');
const selectedOutcome = ref<PolkamarktOutcome>('Yes');
const amount = ref('');
const quote = ref<PolkamarktQuote | null>(null);
const quoteError = ref('');
const quoting = ref(false);
const mutating = ref(false);
const mutationMessage = ref('');
const mutationSucceeded = ref(false);
const copied = ref(false);
const riskAccepted = ref(false);

const routeMarketId = computed(() => {
  const value = route.params.marketId;
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '');
});
const selectedMarket = computed(() => snapshot.value?.markets.find((market) => market.id === routeMarketId.value));
const selectedClaim = computed(() => snapshot.value?.claimable.find((claim) => claim.marketId === routeMarketId.value));
const uniqueWarnings = computed(() => [...new Set(snapshot.value?.warnings ?? [])]);
const filteredMarkets = computed(() => {
  const term = search.value.toLowerCase();
  return (snapshot.value?.markets ?? []).filter((market) => {
    const statusMatches =
      statusFilter.value === 'all' ||
      (statusFilter.value === 'active' && market.displayStatus === 'open') ||
      (statusFilter.value === 'finalized' && market.displayStatus !== 'open');
    const termMatches = !term || `${market.title} ${market.category} ${market.id}`.toLowerCase().includes(term);
    return statusMatches && termMatches;
  });
});
const actionReason = computed(() => {
  const state = snapshot.value;
  if (!state) return 'Market state is loading.';
  if (selectedMarket.value?.displayStatus !== 'open') return 'This market is closed for trading.';
  if (!state.account.signable) return state.account.reason ?? 'Add a signable SORA account.';
  if (accountsStore.showPolkaswapAlert) return 'Accept the Polkaswap and SORA risk disclaimer before trading.';
  if (!state.account.hasXorForFees) return 'Add XOR to pay the network fee.';
  if (mode.value === 'buy' && !state.account.hasKusd) return 'Add KUSD collateral to buy shares.';
  const capability = mode.value === 'buy'
    ? state.capabilities.buy && state.capabilities.quoteBuy
    : state.capabilities.sell && state.capabilities.quoteSell;
  if (!state.capabilities.marketState || !capability) return 'This SORA runtime does not support this trade safely.';
  return '';
});
const quoteDisabled = computed(() => Boolean(actionReason.value || !/^\d+(\.\d+)?$/.test(amount.value) || amount.value === '0'));
const mutationDisabled = computed(() => Boolean(actionReason.value || !quote.value));
const canClaimMarket = computed(() => Boolean(snapshot.value?.account.signable && snapshot.value?.account.hasXorForFees && snapshot.value?.capabilities.claimMarket && !accountsStore.showPolkaswapAlert));
const canClaimCreator = computed(() => Boolean(snapshot.value?.account.signable && snapshot.value?.account.hasXorForFees && snapshot.value?.capabilities.claimCreatorFees && !accountsStore.showPolkaswapAlert));
const historyPolyline = computed(() => {
  const history = snapshot.value?.history ?? [];
  if (!history.length) return '';
  return history.map((point, index) => {
    const probability = Math.max(0, Math.min(100, Number(point.probability)));
    const x = history.length === 1 ? 140 : (index / (history.length - 1)) * 280;
    const y = 72 - (probability / 100) * 68;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
});

function money(value: string): string {
  return formatDecimalString(value, { maximumFractionDigits: 4, preserveSmallValue: true });
}
function codecMoney(value: string): string {
  const digits = value.padStart(19, '0');
  const natural = `${digits.slice(0, -18)}.${digits.slice(-18)}`.replace(/\.?0+$/, '');
  return money(natural || '0');
}
function positive(value: string): boolean {
  return /^\d+$/.test(value) && BigInt(value) > 0n;
}
function probabilityLabel(value: string | null): string {
  return value === null ? '—' : `${money(value)}% YES`;
}
function clearQuote() {
  quote.value = null;
  quoteError.value = '';
}
async function acceptRisk() {
  if (!riskAccepted.value) return;
  await accountsStore.hidePolkaswapAlert();
}
function setMode(value: PolkamarktTradeMode) {
  mode.value = value;
  clearQuote();
}
function setOutcome(value: PolkamarktOutcome) {
  selectedOutcome.value = value;
  clearQuote();
}
async function load() {
  loading.value = true;
  fatalError.value = '';
  try {
    snapshot.value = await getPolkamarktSnapshot(routeMarketId.value || undefined);
    if (routeMarketId.value && !selectedMarket.value) fatalError.value = `Market #${routeMarketId.value} is not available on SORA.`;
  } catch (error) {
    fatalError.value = error instanceof Error ? error.message : 'Polkamarkt is unavailable.';
  } finally {
    loading.value = false;
  }
}
function openMarket(id: string) {
  router.push({ name: Components.Polkamarkt, params: { marketId: id } });
}
function closeMarket() {
  router.push({ name: Components.Polkamarkt });
}
async function requestQuote() {
  if (!selectedMarket.value || quoteDisabled.value) return;
  quoting.value = true;
  quoteError.value = '';
  quote.value = null;
  try {
    quote.value = await getPolkamarktQuote({
      marketId: selectedMarket.value.id,
      mode: mode.value,
      outcome: selectedOutcome.value,
      amount: amount.value,
    });
  } catch (error) {
    quoteError.value = error instanceof Error ? error.message : 'Quote unavailable.';
  } finally {
    quoting.value = false;
  }
}
async function runMutation(request: PolkamarktMutationRequest) {
  mutating.value = true;
  mutationMessage.value = '';
  try {
    const result = await mutatePolkamarkt(request);
    mutationSucceeded.value = result.status;
    mutationMessage.value = result.status ? 'Transaction submitted to SORA.' : result.error ?? 'Transaction failed.';
    if (result.status) {
      quote.value = null;
      await load();
    }
  } catch (error) {
    mutationSucceeded.value = false;
    mutationMessage.value = error instanceof Error ? error.message : 'Transaction failed.';
  } finally {
    mutating.value = false;
  }
}
function submitTrade() {
  if (!selectedMarket.value || !quote.value) return;
  runMutation({
    action: mode.value,
    marketId: selectedMarket.value.id,
    mode: mode.value,
    outcome: selectedOutcome.value,
    amount: amount.value,
    minimumResult: quote.value.minimumResult,
    disclaimerAccepted: !accountsStore.showPolkaswapAlert,
  });
}
function claim(action: 'claimMarket' | 'claimCreatorFees') {
  if (!selectedMarket.value) return;
  runMutation({ action, marketId: selectedMarket.value.id, disclaimerAccepted: !accountsStore.showPolkaswapAlert });
}
async function shareMarket() {
  if (!selectedMarket.value) return;
  const href = `${window.location.origin}${router.resolve({ name: Components.Polkamarkt, params: { marketId: selectedMarket.value.id } }).href}`;
  await navigator.clipboard.writeText(href);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1500);
}

watch(routeMarketId, () => {
  clearQuote();
  load();
});
onMounted(load);
</script>

<style lang="scss" scoped>
.polkamarkt-page { display: flex; min-height: 0; flex-direction: column; }
.workspace-header { min-height: 56px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 10px; margin-bottom: 8px; text-align: left; }
.workspace-header h1 { margin: 0; max-width: 270px; overflow: hidden; font-size: 1.18rem; text-overflow: ellipsis; white-space: nowrap; }
.workspace-header p { margin: 4px 0 0; color: $gray-color; font-size: 0.7rem; }
.back, .refresh { border: 0; background: transparent; color: $pink-color; cursor: pointer; }
.back { padding: 2px 0; font-size: 1.3rem; }
.refresh { padding: 4px 0; font-size: 0.7rem; }
.center-state { height: 100%; display: grid; place-content: center; gap: 8px; padding: 24px; color: $gray-color; text-align: center; }
.center-state button, .empty-state button { border: 0; background: transparent; color: $pink-color; cursor: pointer; }
.network-strip { display: flex; justify-content: space-between; gap: 8px; padding: 12px 16px; border-bottom: $default-border; color: $gray-color; font-size: 0.68rem; }
.fresh { color: $success-color; } .warning { color: $simple-orange-color; } .error { color: $reject-color; }
.capability-state { display: flex; flex-direction: column; gap: 3px; margin: 12px 16px 0; padding: 10px 12px; border-left: 2px solid $simple-orange-color; background: rgba(247, 151, 30, 0.06); color: $gray-color; font-size: 0.68rem; text-align: left; }
.capability-state strong { color: inherit; }
.risk-gate { margin: 12px 16px 0; padding: 12px; border: $default-border; border-radius: 9px; color: $gray-color; font-size: 0.69rem; text-align: left; }
.risk-gate p { margin: 6px 0 9px; line-height: 1.35; }
.risk-gate label { display: flex; align-items: flex-start; gap: 7px; }
.risk-gate button { width: 100%; min-height: 34px; margin-top: 9px; border: 0; border-radius: 8px; background: $pink-color; color: white; cursor: pointer; }
.view-tabs, .segmented { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; margin: 14px 16px 10px; padding: 3px; border-radius: 9px; background: rgba(127, 127, 127, 0.09); }
.view-tabs button, .segmented button { min-height: 30px; border: 0; border-radius: 7px; background: transparent; color: $gray-color; cursor: pointer; font: inherit; font-size: 0.72rem; }
.view-tabs button.selected, .segmented button.selected { background: $plain-white; color: #111; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); font-weight: 600; }
.filters { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 0 16px 10px; }
.filters input, .filters select, .trade-ticket input { min-width: 0; height: 36px; padding: 0 10px; border: $default-border; border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 0.75rem; }
.market-row { width: 100%; display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 12px 16px; border: 0; border-top: $default-border; background: transparent; color: inherit; cursor: pointer; text-align: left; }
.probability { color: $pink-color; font-size: 0.72rem; font-weight: 700; }
.market-copy, .market-values, .position-row > span { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.market-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.market-copy small, .market-values small, .position-row small { color: $gray-color; font-size: 0.66rem; }
.market-values { align-items: flex-end; font-size: 0.68rem; }
.market-values .open { color: $success-color; } .market-values .closed, .market-values .resolved, .market-values .cancelled { color: $gray-color; }
.empty-state { display: flex; min-height: 170px; align-items: center; justify-content: center; flex-direction: column; gap: 7px; padding: 20px; color: $gray-color; text-align: center; }
.empty-state strong { color: inherit; }
.position-row { width: 100%; display: flex; justify-content: space-between; gap: 16px; padding: 13px 16px; border: 0; border-top: $default-border; background: transparent; color: inherit; cursor: pointer; text-align: left; }
.position-row > span:last-child { align-items: flex-end; }
.market-detail, .history-section, .trade-ticket, .claim-card { padding: 16px; border-bottom: $default-border; text-align: left; }
.market-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; color: $gray-color; font-size: 0.68rem; }
.status { padding: 2px 7px; border-radius: 999px; background: rgba(127, 127, 127, 0.1); text-transform: capitalize; }
.status.open { color: $success-color; }
.market-detail > p { color: $gray-color; font-size: 0.75rem; line-height: 1.4; }
.market-detail dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0; }
.market-detail dl div { display: flex; flex-direction: column; gap: 4px; }
.market-detail dt { color: $gray-color; font-size: 0.62rem; }
.market-detail dd { margin: 0; font-size: 0.75rem; font-weight: 700; }
.oracle { display: flex; flex-direction: column; gap: 3px; padding: 10px 0; border-top: $default-border; color: $gray-color; font-size: 0.7rem; }
.oracle strong { color: inherit; font-size: 0.62rem; text-transform: uppercase; }
.share-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: $gray-color; font-size: 0.65rem; }
.share-row button, .claim-card button { border: 0; background: transparent; color: $pink-color; cursor: pointer; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.section-heading h2 { margin: 0; font-size: 0.8rem; }
.section-heading span { color: $gray-color; font-size: 0.62rem; }
.history-section svg { width: 100%; height: 76px; margin-top: 10px; overflow: visible; }
.history-section line { stroke: rgba(127, 127, 127, 0.2); stroke-dasharray: 3 3; }
.history-section polyline { fill: none; stroke: $pink-color; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
.trade-ticket .segmented { margin: 10px 0; }
.trade-ticket .outcome { margin-top: 6px; }
.trade-ticket label { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; color: $gray-color; font-size: 0.68rem; }
.primary { width: 100%; min-height: 38px; margin-top: 10px; border: 0; border-radius: 9px; background: $pink-color; color: $plain-white; cursor: pointer; font-weight: 700; }
button:disabled { cursor: default; opacity: 0.45; }
.inline-reason { margin: 8px 0 0; color: $gray-color; font-size: 0.67rem; }
.quote-preview { margin-top: 12px; padding-top: 10px; border-top: $default-border; }
.quote-preview > div { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; color: $gray-color; font-size: 0.69rem; }
.quote-preview strong { color: inherit; }
.claim-card > div:not(.section-heading) { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; padding-top: 10px; font-size: 0.7rem; }
.claim-card button { grid-column: 2; grid-row: 1 / span 2; }
.mutation-message { position: sticky; bottom: 0; padding: 10px 16px; background: $success-color; color: white; font-size: 0.7rem; text-align: center; }
.mutation-message.error { background: $reject-color; }
</style>
