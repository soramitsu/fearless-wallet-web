<template>
  <div class="polkamarkt-page">
    <header class="workspace-header">
      <button
        v-if="selectedMarket"
        class="back"
        type="button"
        :aria-label="t('polkamarktPage.backToMarkets')"
        @click="closeMarket"
      >
        ←
      </button>
      <div>
        <h1>{{ selectedMarket?.title ?? 'Polkamarkt' }}</h1>
        <p>{{ t('polkamarktPage.subtitle') }}</p>
      </div>
      <button class="refresh" type="button" :disabled="loading" @click="load">
        {{ loading ? t('polkamarktPage.syncing') : t('polkamarktPage.refresh') }}
      </button>
    </header>

    <ContentForm :height="contentHeight">
      <div v-if="loading && !snapshot" class="center-state" data-testid="polkamarkt-loading">
        {{ t('polkamarktPage.loading') }}
      </div>
      <div v-else-if="fatalError && !snapshot" class="center-state error" data-testid="polkamarkt-error">
        <strong>{{ t('polkamarktPage.loadErrorTitle') }}</strong>
        <span>{{ fatalError }}</span>
        <button type="button" @click="load">{{ t('polkamarktPage.tryAgain') }}</button>
      </div>
      <Scroll v-else-if="snapshot">
        <div class="network-strip">
          <span>{{ t('polkamarktPage.block', { block: snapshot.currentBlock }) }}</span>
          <span>{{ tc('polkamarktPage.marketCount', snapshot.markets.length, { count: snapshot.markets.length }) }}</span>
          <span :class="snapshot.indexerStale ? 'warning' : 'fresh'">
            {{ snapshot.indexerStale ? t('polkamarktPage.indexerDelayed') : t('polkamarktPage.catalogSynced') }}
          </span>
        </div>

        <div v-if="uniqueWarnings.length" class="capability-state" data-testid="polkamarkt-capability-state">
          <strong>{{ t('polkamarktPage.capabilityStatus') }}</strong>
          <span>{{ t('polkamarktPage.fallback.dataError') }}</span>
        </div>

        <div v-if="accountsStore.showPolkaswapAlert" class="risk-gate" data-testid="polkamarkt-disclaimer-gate">
          <strong>{{ t('polkamarktPage.risk.title') }}</strong>
          <p>{{ t('polkamarktPage.risk.description') }}</p>
          <label>
            <input v-model="riskAccepted" type="checkbox" />
            {{ t('polkamarktPage.risk.agreement') }}
          </label>
          <button type="button" :disabled="!riskAccepted" @click="acceptRisk">
            {{ t('polkamarktPage.risk.accept') }}
          </button>
        </div>

        <template v-if="selectedMarket">
          <section class="market-detail">
            <div class="market-meta">
              <span>{{ selectedMarket.category }}</span>
              <span class="status" :class="selectedMarket.displayStatus">{{ marketStatusLabel(selectedMarket.displayStatus) }}</span>
              <span>{{ t('polkamarktPage.closesAtBlock', { block: selectedMarket.closeBlock ?? '—' }) }}</span>
            </div>
            <p>{{ selectedMarket.description }}</p>
            <dl>
              <div><dt>{{ t('polkamarktPage.yesProbability') }}</dt><dd>{{ probabilityLabel(selectedMarket.probability) }}</dd></div>
              <div><dt>{{ t('polkamarktPage.liquidity') }}</dt><dd>{{ money(selectedMarket.liquidityUsd) }} KUSD</dd></div>
              <div><dt>{{ t('polkamarktPage.volume') }}</dt><dd>{{ money(selectedMarket.volumeUsd) }} KUSD</dd></div>
            </dl>
            <div class="oracle">
              <strong>{{ t('polkamarktPage.resolution') }}</strong>
              <span>{{ selectedMarket.oracle ?? t('polkamarktPage.runtimeOracle') }}</span>
              <small>{{ selectedMarket.resolutionSource ?? t('polkamarktPage.reviewFinalState') }}</small>
            </div>
            <div class="share-row">
              <button type="button" @click="shareMarket">
                {{ copied ? t('polkamarktPage.linkCopied') : t('polkamarktPage.shareMarket') }}
              </button>
              <span v-if="selectedMarket.runtimeOnly">{{ t('polkamarktPage.runtimeOnly') }}</span>
            </div>
          </section>

          <section class="history-section">
            <div class="section-heading">
              <h2>{{ t('polkamarktPage.probabilityHistory') }}</h2>
              <span>
                {{
                  snapshot.history.length
                    ? tc('polkamarktPage.indexedPointCount', snapshot.history.length, { count: snapshot.history.length })
                    : t('polkamarktPage.noIndexedHistory')
                }}
              </span>
            </div>
            <svg
              v-if="historyPolyline"
              viewBox="0 0 280 76"
              role="img"
              :aria-label="t('polkamarktPage.yesProbabilityHistory')"
            >
              <line x1="0" y1="38" x2="280" y2="38" />
              <polyline :points="historyPolyline" />
            </svg>
          </section>

          <section class="trade-ticket">
            <div class="section-heading">
              <h2>{{ t('polkamarktPage.trade') }}</h2>
              <span>{{ t('polkamarktPage.authoritativeQuote') }}</span>
            </div>
            <div class="segmented">
              <button type="button" :class="{ selected: mode === 'buy' }" @click="setMode('buy')">
                {{ t('polkamarktPage.buy') }}
              </button>
              <button type="button" :class="{ selected: mode === 'sell' }" @click="setMode('sell')">
                {{ t('polkamarktPage.sell') }}
              </button>
            </div>
            <div class="segmented outcome">
              <button type="button" :class="{ selected: selectedOutcome === 'Yes' }" @click="setOutcome('Yes')">
                {{ t('polkamarktPage.outcome.yes') }}
              </button>
              <button type="button" :class="{ selected: selectedOutcome === 'No' }" @click="setOutcome('No')">
                {{ t('polkamarktPage.outcome.no') }}
              </button>
            </div>
            <label>
              <span>
                {{
                  mode === 'buy'
                    ? t('polkamarktPage.kusdCollateral')
                    : t('polkamarktPage.outcomeShares', { outcome: outcomeLabel(selectedOutcome) })
                }}
              </span>
              <input v-model.trim="amount" inputmode="decimal" placeholder="0" @input="clearQuote" />
            </label>
            <button class="primary" type="button" :disabled="quoteDisabled || quoting" @click="requestQuote">
              {{ quoting ? t('polkamarktPage.requestingQuote') : t('polkamarktPage.getLiveQuote') }}
            </button>
            <p v-if="actionReason" class="inline-reason">{{ actionReason }}</p>
            <p v-if="quoteError" class="inline-reason error">{{ quoteError }}</p>

            <div v-if="quote" class="quote-preview" data-testid="polkamarkt-quote">
              <div>
                <span>{{ t('polkamarktPage.youReceive') }}</span>
                <strong>
                  {{ money(quote.resultAmount) }} {{ mode === 'buy' ? t('polkamarktPage.shares') : 'KUSD' }}
                </strong>
              </div>
              <div><span>{{ t('polkamarktPage.marketFee') }}</span><strong>{{ money(quote.feeAmount) }} KUSD</strong></div>
              <div><span>{{ t('polkamarktPage.networkFee') }}</span><strong>{{ money(quote.networkFee) }} XOR</strong></div>
              <div><span>{{ t('polkamarktPage.minimumReceived') }}</span><strong>{{ money(quote.minimumResult) }}</strong></div>
              <button class="primary" type="button" :disabled="mutationDisabled || mutating" @click="submitTrade">
                {{ mutating ? t('polkamarktPage.submitting') : confirmTradeLabel }}
              </button>
            </div>
          </section>

          <section v-if="selectedClaim" class="claim-card">
            <div class="section-heading">
              <h2>{{ t('polkamarktPage.claims') }}</h2>
              <span>{{ t('polkamarktPage.authoritativeState') }}</span>
            </div>
            <div v-if="positive(selectedClaim.claimablePayout ?? selectedClaim.traderPayout)">
              <span>{{ t('polkamarktPage.traderPayout') }}</span>
              <strong>{{ codecMoney(selectedClaim.claimablePayout ?? selectedClaim.traderPayout) }} KUSD</strong>
              <button type="button" :disabled="!canClaimMarket || mutating" @click="claim('claimMarket')">
                {{ t('polkamarktPage.claimPayout') }}
              </button>
            </div>
            <div v-if="selectedClaim.isCreator && positive(selectedClaim.creatorFees)">
              <span>{{ t('polkamarktPage.creatorFees') }}</span>
              <strong>{{ codecMoney(selectedClaim.creatorFees) }} KUSD</strong>
              <button type="button" :disabled="!canClaimCreator || mutating" @click="claim('claimCreatorFees')">
                {{ t('polkamarktPage.claimCreatorFees') }}
              </button>
            </div>
          </section>
        </template>

        <template v-else>
          <nav class="view-tabs" :aria-label="t('polkamarktPage.viewsLabel')">
            <button v-for="item in views" :key="item" type="button" :class="{ selected: view === item }" @click="view = item">
              {{ viewLabel(item) }}
            </button>
          </nav>

          <template v-if="view === 'Markets'">
            <div class="filters">
              <input v-model.trim="search" type="search" :placeholder="t('polkamarktPage.searchMarkets')" />
              <select v-model="statusFilter" :aria-label="t('polkamarktPage.marketStatusLabel')">
                <option value="active">{{ t('polkamarktPage.status.open') }}</option>
                <option value="finalized">{{ t('polkamarktPage.status.closed') }}</option>
                <option value="all">{{ t('polkamarktPage.all') }}</option>
              </select>
            </div>
            <div v-if="!filteredMarkets.length" class="empty-state">
              <strong>
                {{ statusFilter === 'active' ? t('polkamarktPage.noActiveMarkets') : t('polkamarktPage.noMatchingMarkets') }}
              </strong>
              <span>{{ t('polkamarktPage.closedMarketsRemain') }}</span>
              <button v-if="statusFilter === 'active'" type="button" @click="statusFilter = 'finalized'">
                {{ t('polkamarktPage.viewClosedMarkets') }}
              </button>
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
              <span class="market-values">
                <strong>{{ money(market.volumeUsd) }} KUSD</strong>
                <small :class="market.displayStatus">{{ marketStatusLabel(market.displayStatus) }}</small>
              </span>
            </button>
          </template>

          <template v-else-if="view === 'Positions'">
            <div v-if="!snapshot.positions.length" class="empty-state">
              <strong>{{ t('polkamarktPage.noPositions') }}</strong>
              <span>{{ t('polkamarktPage.positionsDescription') }}</span>
            </div>
            <button v-for="position in snapshot.positions" :key="position.id" class="position-row" type="button" @click="openMarket(position.marketId)">
              <span>
                <strong>{{ position.marketTitle ?? t('polkamarktPage.marketNumber', { id: position.marketId }) }}</strong>
                <small>{{ t('polkamarktPage.positionOutcome', { outcome: positionOutcomeLabel(position.outcome) }) }}</small>
              </span>
              <span>
                <strong>
                  {{ money(position.shares ?? position.yesShares ?? position.noShares ?? '0') }}
                  {{ t('polkamarktPage.shares') }}
                </strong>
                <small>{{ positionStatusLabel(position.status) }}</small>
              </span>
            </button>
          </template>

          <template v-else>
            <div v-if="!snapshot.trades.length" class="empty-state">
              <strong>{{ t('polkamarktPage.noActivity') }}</strong>
              <span>{{ t('polkamarktPage.activityDescription') }}</span>
            </div>
            <button v-for="trade in snapshot.trades" :key="trade.id" class="position-row" type="button" @click="openMarket(trade.marketId)">
              <span>
                <strong>{{ tradeSideLabel(trade.side) }} {{ tradeOutcomeLabel(trade.outcome) }}</strong>
                <small>
                  {{
                    t('polkamarktPage.marketBlock', {
                      id: trade.marketId,
                      block: trade.blockNumber ?? t('polkamarktPage.pending'),
                    })
                  }}
                </small>
              </span>
              <span>
                <strong>{{ money(trade.collateral ?? trade.sharesIn ?? trade.sharesOut ?? '0') }}</strong>
                <small>{{ trade.extrinsicHash ? t('polkamarktPage.indexed') : t('polkamarktPage.pendingIndex') }}</small>
              </span>
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
  PolkamarktDisplayStatus,
  PolkamarktMutationRequest,
  PolkamarktOutcome,
  PolkamarktPosition,
  PolkamarktQuote,
  PolkamarktSnapshot,
  PolkamarktTrade,
  PolkamarktTradeMode,
} from '@/defi/polkamarkt/types';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import { formatDecimalString } from '@/helpers/numbers';
import { Components } from '@/router/routes';
import { getPolkamarktQuote, getPolkamarktSnapshot, mutatePolkamarkt } from '@/extension/messaging';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';

const route = useRoute();
const router = useRouter();
const { t, tc } = useI18n();
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
  if (!state) return t('polkamarktPage.actionReason.loading');
  if (selectedMarket.value?.displayStatus !== 'open') return t('polkamarktPage.actionReason.closed');
  if (!state.account.signable) {
    return state.account.address
      ? t('polkamarktPage.actionReason.unsupportedSigner')
      : t('polkamarktPage.actionReason.addAccount');
  }
  if (accountsStore.showPolkaswapAlert) return t('polkamarktPage.actionReason.acceptRisk');
  if (!state.account.hasXorForFees) return t('polkamarktPage.actionReason.addXor');
  if (mode.value === 'buy' && !state.account.hasKusd) return t('polkamarktPage.actionReason.addKusd');
  const capability = mode.value === 'buy'
    ? state.capabilities.buy && state.capabilities.quoteBuy
    : state.capabilities.sell && state.capabilities.quoteSell;
  if (!state.capabilities.marketState || !capability) return t('polkamarktPage.fallback.capability');
  return '';
});
const confirmTradeLabel = computed(() =>
  mode.value === 'buy' ? t('polkamarktPage.confirmBuy') : t('polkamarktPage.confirmSell')
);
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
  return value === null ? '—' : `${money(value)}% ${outcomeLabel('Yes')}`;
}
function viewLabel(value: (typeof views)[number]): string {
  const keys: Record<(typeof views)[number], string> = {
    Markets: 'polkamarktPage.views.markets',
    Positions: 'polkamarktPage.views.positions',
    Activity: 'polkamarktPage.views.activity',
  };
  return t(keys[value]);
}
function marketStatusLabel(value: PolkamarktDisplayStatus): string {
  return t(`polkamarktPage.status.${value}`);
}
function outcomeLabel(value: PolkamarktOutcome): string {
  return value === 'Yes' ? t('polkamarktPage.outcome.yes') : t('polkamarktPage.outcome.no');
}
function positionOutcomeLabel(value: PolkamarktPosition['outcome']): string {
  if (value === 'YES') return outcomeLabel('Yes');
  if (value === 'NO') return outcomeLabel('No');
  return t('polkamarktPage.outcome.mixed');
}
function tradeOutcomeLabel(value: PolkamarktTrade['outcome']): string {
  if (value === 'YES') return outcomeLabel('Yes');
  if (value === 'NO') return outcomeLabel('No');
  return '';
}
function tradeSideLabel(value: PolkamarktTrade['side']): string {
  if (value === 'buy') return t('polkamarktPage.side.buy');
  if (value === 'sell') return t('polkamarktPage.side.sell');
  if (value === 'claim') return t('polkamarktPage.side.claim');
  return t('polkamarktPage.side.trade');
}
function positionStatusLabel(value: string | undefined): string {
  const normalized = (value ?? '').replace(/[_\s-]/g, '').toLowerCase();
  if (['open', 'active', 'trading'].includes(normalized)) return t('polkamarktPage.status.open');
  if (normalized === 'closed') return t('polkamarktPage.status.closed');
  if (normalized === 'resolved') return t('polkamarktPage.status.resolved');
  if (['cancelled', 'canceled'].includes(normalized)) return t('polkamarktPage.status.cancelled');
  if (['locked', 'earlyreportlocked'].includes(normalized)) return t('polkamarktPage.status.locked');
  if (normalized === 'claimable') return t('polkamarktPage.status.claimable');
  if (normalized === 'claimed') return t('polkamarktPage.status.claimed');
  if (normalized === 'pending') return t('polkamarktPage.status.pending');
  return t('polkamarktPage.status.indexed');
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
    if (routeMarketId.value && !selectedMarket.value) {
      fatalError.value = t('polkamarktPage.marketUnavailable', { id: routeMarketId.value });
    }
  } catch {
    fatalError.value = t('polkamarktPage.fallback.dataError');
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
  } catch {
    quoteError.value = t('polkamarktPage.fallback.quote');
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
    mutationMessage.value = result.status
      ? t('polkamarktPage.transactionSubmitted')
      : t('polkamarktPage.fallback.mutation');
    if (result.status) {
      quote.value = null;
      await load();
    }
  } catch {
    mutationSucceeded.value = false;
    mutationMessage.value = t('polkamarktPage.fallback.mutation');
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
