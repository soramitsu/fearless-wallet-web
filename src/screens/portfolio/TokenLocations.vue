<template>
  <div class="where" data-testid="tokenLocations">
    <div v-if="!locations && view.pending.value" class="state" role="status" aria-live="polite" data-testid="locationsLoading">
      <Shimmer height="48px" width="100%" />
      <Shimmer height="160px" width="100%" />
      <span class="sr-only">{{ t('portfolioDashboard.where.loading') }}</span>
    </div>

    <div v-else-if="!locations" class="state state--empty" data-testid="locationsNotFound">
      <strong>{{ t('portfolioDashboard.where.notFound') }}</strong>
      <button type="button" class="link" @click="router.back()">{{ t('portfolioDashboard.where.back') }}</button>
    </div>

    <template v-else>
      <header class="head" data-testid="locationsHead">
        <span class="head-logo" aria-hidden="true">
          <ExternalLogo v-if="headIcon" :name="headIcon" :width="40" class="head-logo-img" />
          <span v-else class="head-initials">{{ locations.symbol.slice(0, 4) }}</span>
        </span>
        <div class="head-main">
          <h1 class="head-symbol">{{ locations.symbol }}</h1>
          <p class="head-name">{{ locations.name }}</p>
        </div>
        <div class="head-value">
          <strong class="head-fiat" data-testid="locationsFiat">{{ formatFiatValue(locations.fiat) }}</strong>
          <span v-if="change" class="change" :class="`change--${change.direction}`">
            <span aria-hidden="true">{{ change.direction === 'up' ? '▲' : '▼' }}</span> {{ change.percentText }} · {{ t('portfolioDashboard.changeLabel') }}
          </span>
        </div>
      </header>
      <p class="head-line" data-testid="locationsLine">
        {{ formatAmount(locations.amount) }} {{ locations.symbol }} ·
        {{ t('portfolioDashboard.where.portfolioShare', { percent: sharePercent }) }} ·
        {{ tc('portfolioDashboard.where.holdings', locations.holdings.length, { count: locations.holdings.length }) }}
      </p>

      <PortfolioOrbit
        :symbol="locations.symbol"
        :icon="headIcon"
        :networks="locations.networks"
        :selected="view.selectedNetwork.value"
        :networkIcon="view.networkIconOf"
        :amountText="networkAmount"
        :readinessOf="networkReadiness"
        @select="view.selectNetwork"
      />

      <section class="block" aria-labelledby="where-holdings">
        <h2 id="where-holdings" class="block-title">{{ t('portfolioDashboard.where.title') }}</h2>
        <ul class="holdings" data-testid="locationsHoldings">
          <li v-for="holding in locations.holdings" :key="holding.id">
            <button
              type="button"
              class="holding"
              :aria-pressed="holding.id === view.selectedId.value"
              :data-testid="`holding-${holding.id}`"
              @click="view.selectHolding(holding.id)"
            >
              <ExternalLogo :name="view.networkIconOf(holding.networkName)" :width="28" class="holding-logo" />
              <span class="holding-identity">
                <span class="holding-network">{{ holding.networkName }}</span>
                <span class="holding-meta">
                  <span>{{ holding.walletName }}</span>
                  <span v-if="roleLabel(view.roleOf(holding))" class="role-chip">{{ roleLabel(view.roleOf(holding)) }}</span>
                  <PortfolioReadinessChip :readiness="view.readinessOf(holding)" />
                </span>
              </span>
              <span class="holding-value">
                <span class="holding-fiat">{{ formatFiatValue(holding.fiat) }}</span>
                <span class="holding-amount">{{ formatAmount(holding.amount) }} {{ holding.symbol }}</span>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <section v-if="selected && readiness && actions" class="panel" aria-labelledby="where-panel" data-testid="holdingPanel">
        <h2 id="where-panel" class="panel-title">{{ selected.symbol }} · {{ selected.networkName }} · {{ selected.walletName }}</h2>

        <PortfolioBreakdown :amount="selected.amount" :transferable="selected.transferable" :held="selected.held" :symbol="selected.symbol" />
        <PortfolioRouteCard :readiness="readiness" :symbol="selected.symbol" :network="selected.networkName" />

        <div class="actions" data-testid="holdingActions">
          <div class="action-block">
            <button
              type="button"
              class="action action--primary"
              :disabled="!actions.primary.enabled || busy"
              :data-testid="`action-${actions.primary.id}`"
              @click="run(actions.primary)"
            >
              <Icon v-if="actions.primary.id === 'swap'" icon="polkaswap" width="20px" height="20px" :hover="false" />
              {{ actionLabel(actions.primary) }}
            </button>
            <p v-if="actions.primary.blocked" class="reason" data-testid="actionReason">{{ t(`portfolioDashboard.where.actions.blocked.${actions.primary.blocked}`) }}</p>
          </div>

          <div v-for="action in actions.secondary" :key="action.id" class="action-block">
            <button type="button" class="action" :disabled="!action.enabled || busy" :data-testid="`action-${action.id}`" @click="run(action)">
              {{ actionLabel(action) }}
            </button>
            <p v-if="action.blocked" class="reason">{{ t(`portfolioDashboard.where.actions.blocked.${action.blocked}`) }}</p>
          </div>
        </div>

        <p v-if="switchWallet" class="note" data-testid="switchNote">{{ t('portfolioDashboard.where.switchNote', { wallet: switchWallet }) }}</p>
        <p v-if="switchFailed" class="note note--warn" role="alert">{{ t('portfolioDashboard.where.switchFailed', { wallet: selected.walletName }) }}</p>
      </section>
      <p v-else class="hint">{{ t('portfolioDashboard.where.chooseHolding') }}</p>

      <section v-if="checks" class="polkaswap" aria-labelledby="where-polkaswap" data-testid="polkaswapCard">
        <h2 id="where-polkaswap" class="block-title block-title--mark">
          <Icon icon="polkaswap" width="18px" height="18px" :hover="false" />
          {{ t('portfolioDashboard.where.card.title') }}
        </h2>
        <p class="hint">{{ t('portfolioDashboard.where.card.intro') }}</p>
        <PortfolioCheckList :checks="checks.checks" :show="['account', 'moves', 'swaps', 'disclaimer']" :unknownIn="switchWallet ?? undefined" />
        <button type="button" class="action" :disabled="busy || Boolean(checks.blockers.length)" data-testid="cardOpenPolkaswap" @click="openPolkaswap">
          <Icon icon="polkaswap" width="20px" height="20px" :hover="false" />
          {{ openPolkaswapLabel }}
        </button>
      </section>
    </template>

    <PortfolioSwapSheet
      v-if="sheet === 'swap' && selected && actions && checks"
      :symbol="selected.symbol"
      :holding="selected"
      :targets="swapTargets"
      :checks="checks"
      :blocked="swapBlocked"
      :switchTo="switchWallet"
      :busy="busy"
      :switchFailed="switchFailed"
      @close="sheet = null"
      @confirm="confirmSwap"
    />

    <PortfolioMoveSheet
      v-if="sheet === 'move' && selected && readiness && readiness.hops.length"
      :readiness="readiness"
      :holding="selected"
      :symbol="selected.symbol"
      :switchTo="switchWallet"
      :busy="busy"
      :switchFailed="switchFailed"
      :canReceiveOnSora="Boolean(readiness.soraAssetId && view.soraNetwork.value)"
      @close="sheet = null"
      @confirm="confirmMove"
      @receiveOnSora="receiveOnSora"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter, type RouteLocationRaw } from 'vue-router';
import type { ActionBlock, LocationAction } from '@/portfolio/dashboard/actions';
import type { LocationNetwork } from '@/portfolio/dashboard/locations';
import PortfolioBreakdown from '@/screens/portfolio/PortfolioBreakdown.vue';
import PortfolioCheckList from '@/screens/portfolio/PortfolioCheckList.vue';
import PortfolioMoveSheet from '@/screens/portfolio/PortfolioMoveSheet.vue';
import PortfolioOrbit from '@/screens/portfolio/PortfolioOrbit.vue';
import PortfolioReadinessChip from '@/screens/portfolio/PortfolioReadinessChip.vue';
import PortfolioRouteCard from '@/screens/portfolio/PortfolioRouteCard.vue';
import PortfolioSwapSheet, { type SwapTarget } from '@/screens/portfolio/PortfolioSwapSheet.vue';
import { formatChange } from '@/portfolio/dashboard/format';
import {
  ROUTE_NAMES,
  holdingAssetId,
  moveLocation,
  needsWalletSwitch,
  receiveLocation,
  receiveOnSoraLocation,
  sendLocation,
  swapLocation,
} from '@/portfolio/dashboard/handoff';
import { registerDashboardMessages } from '@/portfolio/dashboard/locales';
import { useTokenLocations } from '@/portfolio/dashboard/useTokenLocations';
import { useWalletSwitch } from '@/portfolio/dashboard/useWalletSwitch';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';

registerDashboardMessages();

const props = defineProps<{ token?: string; holding?: string }>();

const router = useRouter();
const { t, tc } = useI18n();
const accountsStore = useAccountsStore();
const { formatAmount, formatFiatValue, roleLabel } = usePortfolioFormatting();
const view = useTokenLocations(
  computed(() => props.token ?? ''),
  computed(() => props.holding)
);
const { failed: switchFailed, switchTo } = useWalletSwitch();

const locations = view.locations;
const selected = view.selectedHolding;
const sheet = ref<'swap' | 'move' | null>(null);
const busy = ref(false);

const readiness = computed(() => (selected.value ? view.readinessOf(selected.value) : undefined));
const actions = computed(() => (selected.value ? view.actionsFor(selected.value) : undefined));
const checks = computed(() => (selected.value ? view.checksFor(selected.value) : undefined));
// What keeps a swap from opening: the action's own reason, otherwise the first thing the swap screen needs.
const swapBlocked = computed<ActionBlock | undefined>(() =>
  actions.value?.primary.id === 'swap' && actions.value.primary.blocked ? actions.value.primary.blocked : checks.value?.blockers[0]
);
const switchWallet = computed(() =>
  selected.value && needsWalletSwitch(selected.value.address, view.selectedAddress.value) ? selected.value.walletName : null
);

const headIcon = computed(() => (locations.value?.holdings[0] ? view.tokenIconOf(locations.value.holdings[0]) : ''));
const sharePercent = computed(() => {
  const share = locations.value?.portfolioShare ?? 0;

  return share > 0 && share < 1 ? '<1' : String(Math.round(share));
});
const change = computed(() => {
  const percent = locations.value?.changePercent;

  if (percent === null || percent === undefined) return null;

  const formatted = formatChange('0', percent, accountsStore.fiatSymbol);

  return formatted.direction === 'flat' ? null : formatted;
});

// The orbit says how much of the token each network holds, and how that network stands to a swap.
const networkAmount = (network: LocationNetwork): string => formatAmount(network.amount);
const networkReadiness = (name: string) => {
  const holding = locations.value?.networks.find((network) => network.name === name)?.holdings[0];

  return holding ? view.readinessOf(holding).state : 'none';
};

// Popular SORA assets to swap to; the pay asset is left out. They come from the registry, never from the wallet's symbols.
const POPULAR_TARGETS = ['XOR', 'VAL', 'PSWAP', 'XSTUSD'];
const swapTargets = computed<SwapTarget[]>(() => {
  const pay = selected.value ? holdingAssetId(selected.value) : undefined;
  const assets = view.soraNetwork.value?.assets ?? [];

  return POPULAR_TARGETS.flatMap((symbol) => {
    const found = assets.find((asset) => asset.symbol.toUpperCase() === symbol && String(asset.id) !== pay);

    return found ? [{ assetId: String(found.id), symbol }] : [];
  });
});

const ACTION_VERBS: Record<LocationAction['id'], string> = {
  swap: 'openPolkaswap',
  move: 'reviewMove',
  send: 'sendIt',
  receive: 'receiveIt',
  receiveOnSora: 'receiveIt',
};

function actionLabel(action: LocationAction): string {
  const symbol = selected.value?.symbol ?? '';
  const base = (() => {
    switch (action.id) {
      case 'swap':
        return action.enabled ? t('portfolioDashboard.where.actions.swap', { symbol }) : t('portfolioDashboard.where.actions.swapUnavailable');
      case 'move':
        if (!action.enabled) return t('portfolioDashboard.where.actions.moveUnavailable');

        return (readiness.value?.hops.length ?? 0) > 1
          ? t('portfolioDashboard.where.actions.moveFirst', { network: readiness.value?.hops[0].destinationNetwork ?? '' })
          : t('portfolioDashboard.where.actions.move', { symbol });
      case 'send':
        return t('portfolioDashboard.where.actions.send');
      case 'receive':
        return t('portfolioDashboard.where.actions.receive');
      default:
        return t('portfolioDashboard.where.actions.receiveOnSora');
    }
  })();

  // Acting on another wallet's holding says so on the button: "Switch to Savings and review move".
  return action.switchFirst && action.enabled && selected.value
    ? t('portfolioDashboard.where.actions.switchAnd', {
        wallet: selected.value.walletName,
        action: t(`portfolioDashboard.where.actions.${ACTION_VERBS[action.id]}`),
      })
    : base;
}

/** Switches to the holding's wallet when it is not the selected one, then opens the screen the extension already has. */
async function handOff(location: RouteLocationRaw | undefined): Promise<void> {
  const holding = selected.value;

  if (!location || !holding || busy.value) return;

  busy.value = true;
  try {
    if (!(await switchTo(holding.address))) return;

    sheet.value = null;
    await router.push(location);
  } finally {
    busy.value = false;
  }
}

function run(action: LocationAction): void {
  const holding = selected.value;

  if (!holding || !action.enabled) return;

  if (action.id === 'swap') sheet.value = 'swap';
  else if (action.id === 'move') sheet.value = 'move';
  else if (action.id === 'send') void handOff(sendLocation(holding));
  else if (action.id === 'receive') void handOff(receiveLocation(holding));
  else void receiveOnSora();
}

function confirmSwap(targetAssetId?: string): void {
  const from = selected.value ? holdingAssetId(selected.value) : undefined;

  void handOff(from ? swapLocation({ from, ...(targetAssetId ? { to: targetAssetId } : {}) }) : undefined);
}

function confirmMove(): void {
  const first = readiness.value?.hops[0];

  void handOff(first ? moveLocation(first) : undefined);
}

function receiveOnSora(): Promise<void> {
  const soraAssetId = readiness.value?.soraAssetId;
  const sora = view.soraNetwork.value;

  return handOff(soraAssetId && sora ? receiveOnSoraLocation(soraAssetId, sora.name) : undefined);
}

// Opening Polkaswap for another wallet's holding switches to that wallet first, and the button says so like the others do.
const openPolkaswapLabel = computed(() =>
  switchWallet.value
    ? t('portfolioDashboard.where.actions.switchAnd', { wallet: switchWallet.value, action: t('portfolioDashboard.where.actions.openPolkaswap') })
    : t('portfolioDashboard.where.card.open')
);

function openPolkaswap(): void {
  const from = selected.value && readiness.value?.state === 'ready' ? holdingAssetId(selected.value) : undefined;

  void handOff(from ? swapLocation({ from }) : { name: ROUTE_NAMES.polkaswap });
}
</script>

<style lang="scss" scoped>
.where {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  // The scrollbar sits in the page gutter, as the portfolio list's own does.
  width: calc(100% + #{$default-padding});
  margin-right: -$default-padding;
  padding: 0 $default-padding 16px 0;
  text-align: left;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--fw-stroke-strong);
    border-radius: $default-border-radius;
  }
}

.state {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0;
}

.state--empty {
  align-items: center;
  padding: 32px 8px;
  color: var(--fw-text-2);
  text-align: center;
}

.link {
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fw-link);
  font: inherit;
  cursor: pointer;
}

.head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.head-logo {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid var(--fw-accent-edge);
  border-radius: 50%;
  background: var(--fw-raised);
}

.head-logo-img {
  border-radius: 50%;
}

.head-initials {
  font-size: 0.7rem;
  font-weight: 800;
}

.head-symbol {
  margin: 0;
  font-family: var(--fw-font-display);
  font-size: 1.35rem;
  line-height: 1.1;
}

.head-name {
  margin: 2px 0 0;
  color: var(--fw-text-2);
  font-size: 0.78rem;
  overflow-wrap: anywhere;
}

.head-value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-variant-numeric: tabular-nums;
}

.head-fiat {
  font-size: 1.15rem;
}

.change {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--fw-text-2);
}

.change--up {
  color: var(--fw-up);
}

.change--down {
  color: var(--fw-down);
}

.head-line {
  margin: -6px 0 0;
  color: var(--fw-text-2);
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
}

.block,
.polkaswap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fw-text-3);
}

.block-title--mark {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--fw-text-1);
}

.holdings {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--fw-divider);
  border-radius: 12px;
  overflow: hidden;
}

.holding {
  width: 100%;
  min-height: 56px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 0;
  border-top: 1px solid var(--fw-divider);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  li:first-child & {
    border-top: 0;
  }

  &[aria-pressed='true'] {
    background: var(--fw-row-selected);
    box-shadow: inset 3px 0 0 var(--fw-select-edge);
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: -2px;
  }
}

.holding-logo {
  border-radius: 50%;
}

.holding-identity {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.holding-network {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.holding-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  color: var(--fw-text-2);
  font-size: 0.72rem;
}

.role-chip {
  padding: 1px 6px;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 8px;
  font-size: 0.64rem;
}

.holding-value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.holding-fiat {
  font-weight: 700;
}

.holding-amount {
  color: var(--fw-text-2);
  font-size: 0.72rem;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 14px;
  background: var(--fw-card-surface, var(--fw-glass));
}

.panel-title {
  margin: 0;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 16px;
  border: 1px solid var(--fw-stroke-control);
  border-radius: 12px;
  background: var(--fw-raised);
  color: var(--fw-text-1);
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--fw-raised-2);
  }

  &:disabled {
    border-style: dashed;
    color: var(--fw-text-2);
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

.action--primary {
  border-color: var(--fw-accent-edge);
  background: linear-gradient(180deg, var(--fw-fill-top), var(--fw-fill-bottom));
  color: var(--fw-on-accent);

  &:hover:not(:disabled) {
    background: linear-gradient(180deg, var(--fw-fill-top), var(--fw-fill-bottom));
    filter: brightness(1.08);
  }

  &:disabled {
    background: var(--fw-raised-2);
    color: var(--fw-text-2);
  }
}

.reason,
.note,
.hint {
  margin: 0;
  color: var(--fw-text-2);
  font-size: 0.74rem;
  line-height: 1.4;
}

.note--warn {
  color: var(--fw-warning);
}

.polkaswap {
  padding: 14px;
  border: 1px solid var(--fw-divider);
  border-radius: 14px;
  background: var(--fw-raised);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
