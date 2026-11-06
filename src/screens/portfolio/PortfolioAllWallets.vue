<template>
  <div class="all" data-testid="portfolioAllWallets">
    <!-- The same one list as a single wallet's: search tokens, networks and wallets; a chip narrows it to one network. -->
    <div class="list-tools">
      <AssetSearchField :value="search" data-testid="allWalletsSearch" @change="search = $event" />

      <NetworkFilterChips :options="networkOptions" :labels="networkFilterLabels" :selected="network" @select="network = $event" />
    </div>

    <div v-if="loading" class="state" role="status" aria-live="polite" data-testid="allWalletsLoading">
      <Shimmer height="48px" width="100%" />
      <Shimmer height="48px" width="100%" />
      <span class="sr-only">{{ t('portfolioDashboard.rows.loading') }}</span>
    </div>

    <div v-else-if="!tokenRows.length" class="state state--empty" data-testid="allWalletsEmpty">
      <strong>{{ t('portfolioDashboard.rows.emptyTitle') }}</strong>
      <span>{{ t('portfolioDashboard.rows.emptyText') }}</span>
    </div>

    <div v-else-if="!rows.length" class="state state--empty" data-testid="allWalletsNoMatch">
      <strong>{{ t('portfolioPage.noMatchingAssets') }}</strong>
      <button type="button" class="clear" data-testid="allWalletsShowAll" @click="showEverything">
        {{ t('walletHome.search.showAll') }}
      </button>
    </div>

    <ul v-else class="rows" data-testid="allTokens">
      <li v-for="row in rows" :key="row.id" class="row" :class="{ 'row--active': row.id === activeKey }" :data-key="row.id">
        <button
          type="button"
          class="row-head"
          :aria-label="t('portfolioDashboard.where.open', { name: row.symbol })"
          :data-testid="`tokenRow-${row.id}`"
          @click="onRowClick(row)"
        >
          <span class="orb" :style="orbStyle(row.id)" aria-hidden="true">
            <ExternalLogo v-if="logos.get(row.id)" :name="logos.get(row.id)" :width="36" class="orb-logo" />
            <template v-else>{{ row.symbol.slice(0, 4) }}</template>
            <span v-if="row.networks.length > 1" class="orb-count">{{ row.networks.length }}</span>
          </span>
          <span class="identity">
            <span class="title">
              {{ row.symbol }}
              <span v-if="change(row.changePercent)" class="change" :class="`change--${change(row.changePercent)?.direction}`">
                {{ change(row.changePercent)?.percentText }}
              </span>
            </span>
            <span class="sub">
              {{ where(row) }} · {{ row.wallets.join(', ') }}
              <PortfolioReadinessChip v-if="row.children.length === 1" :readiness="readinessOf(row.children[0])" />
            </span>
          </span>
          <span class="value">
            <span class="fiat">{{ formatFiatValue(row.fiat) }}</span>
            <span class="amount">{{ formatAmount(row.amount) }} {{ row.symbol }}</span>
          </span>
          <Icon icon="chevron-right" width="16px" height="16px" :hover="false" class="chevron" />
        </button>
      </li>
    </ul>

    <!-- Each wallet's part of the total, under the list rather than behind a switch; Open makes it the wallet on screen. -->
    <section v-if="!loading && !filtering && wallets.length" class="wallets" data-testid="allWalletRows">
      <h3 class="wallets-title">{{ t('portfolioDashboard.lens.wallets') }}</h3>
      <ul class="rows">
        <li v-for="(wallet, index) in wallets" :key="wallet.address" class="row" :class="{ 'row--active': wallet.address === activeKey }" :data-key="wallet.address">
          <div class="row-head" :data-testid="`walletRow-${wallet.address}`">
            <span class="avatar" :style="{ '--orb': walletColour(index) }" aria-hidden="true">{{ initial(wallet.name) }}</span>
            <span class="identity">
              <span class="title">{{ wallet.name }}</span>
              <span class="sub">{{ walletMeta(wallet) }}</span>
            </span>
            <span class="value">
              <span class="fiat">{{ formatFiatValue(wallet.total) }}</span>
              <span class="amount">{{ t('portfolioDashboard.rows.share', { percent: formatShare(wallet.share) }) }}</span>
            </span>
          </div>
          <button type="button" class="open" :data-testid="`openWallet-${wallet.address}`" @click="$emit('openWallet', wallet.address)">
            {{ t('portfolioDashboard.rows.openWallet', { wallet: wallet.name }) }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { AggregatedWallet } from '@/portfolio/dashboard/aggregate';
import type { AggregateNetworkSection, AggregateTokenRow } from '@/portfolio/dashboard/facets';
import type { Readiness, ReadinessSubject } from '@/portfolio/dashboard/readiness';
import { formatChange, formatShare } from '@/portfolio/dashboard/format';
import { CHART_SLOT_COUNT } from '@/portfolio/dashboard/allocation';
import { chartColour } from '@/portfolio/dashboard/skyGeometry';
import { formatSyncAge } from '@/portfolio/syncFreshness';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import PortfolioReadinessChip from '@/screens/portfolio/PortfolioReadinessChip.vue';
import AssetSearchField from '@/screens/wallet&asset/wallet/AssetSearchField.vue';
import NetworkFilterChips, { type NetworkFilterLabels, type NetworkFilterOption } from '@/screens/wallet&asset/wallet/NetworkFilterChips.vue';
import { ALL_NETWORKS } from '@/consts/networks';
import { isSameString } from '@/helpers';
import { useI18n } from '@/locales/useI18n';
import { FPNumber } from '@/sora/number';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  tokenRows: AggregateTokenRow[];
  networkSections: AggregateNetworkSection[];
  wallets: AggregatedWallet[];
  /** Entity key to chart slot, so a row wears the colour its ray and chip have. */
  slotOf: (key: string) => number;
  /** The group the legend or the sky has picked. */
  activeKey: string | null;
  /** The group to open: the row expands and scrolls into view. The count makes a repeated pick count again. */
  focus: { key: string; count: number } | null;
  loading: boolean;
  /** How a holding stands to a swap on Polkaswap; a chip says so when it is actionable. */
  readinessOf: (holding: ReadinessSubject) => Readiness;
  /** A token's logo, inside the ring of its chart colour; its initials stand in when it has none. */
  iconOf?: (row: AggregateTokenRow) => string;
  /** A network's logo for its chip, by the network's name. */
  networkIconOf?: (networkName: string) => string;
}>();

const emit = defineEmits<{
  (event: 'openWallet', address: string): void;
  /** Where it lives for a token, with one holding chosen when the row names one. */
  (event: 'open', tokenKey: string, holdingId?: string): void;
}>();

const { t, tc } = useI18n();
const accountsStore = useAccountsStore();
const { formatAmount, formatFiatValue } = usePortfolioFormatting();

const search = ref('');
const network = ref<string>(ALL_NETWORKS);
const query = computed(() => search.value.trim().toLowerCase());
const filtering = computed(() => Boolean(query.value) || !isSameString(network.value, ALL_NETWORKS));

const numberOf = (value: string): FPNumber => new FPNumber(value);
const byFiatDescending = (a: { fiat: string }, b: { fiat: string }): number => {
  const left = numberOf(a.fiat);
  const right = numberOf(b.fiat);

  return left.eq(right) ? 0 : right.gt(left) ? 1 : -1;
};

/** Every network a wallet holds something on, largest first: the chips after All. */
const networkOptions = computed<NetworkFilterOption[]>(() =>
  [...props.networkSections]
    .sort((a, b) => byFiatDescending(a, b) || a.name.localeCompare(b.name))
    .map(({ name }) => ({ name, icon: props.networkIconOf?.(name) ?? '' }))
);

// A network nothing is held on any more leaves the filter, so the list never stays empty because of it.
watch(networkOptions, (options) => {
  if (!isSameString(network.value, ALL_NETWORKS) && !options.some(({ name }) => isSameString(name, network.value))) {
    network.value = ALL_NETWORKS;
  }
});

const networkFilterLabels = computed<NetworkFilterLabels>(() => ({
  group: t('walletHome.networkFilter.label'),
  all: t('walletHome.networkFilter.all'),
  more: t('walletHome.networkFilter.more'),
}));

const matches = (text: string): boolean => text.toLowerCase().includes(query.value);

/**
 * The rows under the search and the chip. A token whose name matches keeps every holding; otherwise a holding stays
 * when its network or wallet matches. A row then sums only the holdings it keeps, which are one asset (one group).
 */
const rows = computed<AggregateTokenRow[]>(() => {
  if (!filtering.value) return props.tokenRows;

  const anyNetwork = isSameString(network.value, ALL_NETWORKS);

  return props.tokenRows
    .flatMap((row) => {
      const tokenMatches = !query.value || matches(`${row.symbol} ${row.name}`);
      const children = row.children.filter(
        (child) =>
          (anyNetwork || isSameString(child.networkName, network.value)) &&
          (tokenMatches || matches(child.networkName) || matches(child.walletName))
      );

      if (!children.length) return [];
      if (children.length === row.children.length) return [row];

      return [
        {
          ...row,
          children,
          fiat: children.reduce((total, child) => total.add(numberOf(child.fiat)), FPNumber.ZERO).toString(),
          amount: children.reduce((total, child) => total.add(numberOf(child.amount)), FPNumber.ZERO).toString(),
          networks: [...new Set(children.map(({ networkName }) => networkName))],
          wallets: [...new Set(children.map(({ walletName }) => walletName))],
        },
      ];
    })
    .sort((a, b) => byFiatDescending(a, b) || a.symbol.localeCompare(b.symbol));
});

/** One network by name; several by how many. */
const where = (row: AggregateTokenRow): string =>
  row.networks.length === 1 ? row.networks[0] : tc('portfolioDashboard.rows.networks', row.networks.length, { count: row.networks.length });

function showEverything(): void {
  search.value = '';
  network.value = ALL_NETWORKS;
}

const colourOf = (key: string): string => chartColour(props.slotOf(key));
const orbStyle = (key: string): Record<string, string> => ({ '--orb': colourOf(key) });
// The chart's colours are the tokens'; wallets take the palette in their order, so each avatar still has its own.
const walletColour = (index: number): string => chartColour((index % CHART_SLOT_COUNT) + 1);
// Each row's logo, looked up again only when the rows or the registry behind iconOf change.
const logos = computed(() => new Map(props.tokenRows.map((row) => [row.id, props.iconOf?.(row) ?? ''])));
const change = (percent: string | null) => {
  if (percent === null) return null;

  const formatted = formatChange('0', percent, accountsStore.fiatSymbol);

  return formatted.direction === 'flat' ? null : formatted;
};
const initial = (name: string): string => Array.from(name.trim())[0]?.toUpperCase() ?? '';

// A token opens Where it lives, its page across every wallet and network; with one holding, that holding is chosen.
function onRowClick(row: AggregateTokenRow): void {
  emit('open', row.id, row.children.length === 1 ? row.children[0]?.holdingId : undefined);
}

function walletMeta(wallet: AggregatedWallet): string {
  const networks = new Set(wallet.holdings.map(({ networkName }) => networkName)).size;
  const parts = [tc('portfolioDashboard.rows.networks', networks, { count: networks })];

  if (wallet.latestTimestamp) parts.push(formatSyncAge(wallet.latestTimestamp, Date.now(), (key, values) => t(key, values ?? {})));

  return parts.join(' · ');
}

// "Open" on a legend chip or a ray: the row for that group comes into view.
watch(
  () => props.focus,
  async (focus) => {
    if (!focus) return;

    await nextTick();

    const row = Array.from(document.querySelectorAll<HTMLElement>('[data-key]')).find((element) => element.dataset.key === focus.key);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    row?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }
);
</script>

<style lang="scss" scoped>
.all {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 0 16px;
  min-width: 0;
  // The app centres its text; a list reads from the left.
  text-align: left;
}

.list-tools {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.state {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.state--empty {
  align-items: center;
  padding: 24px 8px;
  color: var(--fw-text-2);
  font-size: 0.8rem;
  text-align: center;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rows {
  display: flex;
  flex-direction: column;
}

// Each wallet's part of the total, below the tokens.
.wallets {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--fw-divider);
}

.wallets-title {
  margin: 4px 4px 0;
  color: var(--fw-text-2);
  font-size: 0.75rem;
  font-weight: 700;
}

.clear {
  min-height: 36px;
  margin-top: 6px;
  padding: 0 16px;
  border: 1px solid var(--fw-divider);
  border-radius: 18px;
  background: var(--fw-raised);
  color: var(--fw-text-1);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

.row--active {
  background: var(--fw-row-selected);
}

.row-head {
  box-sizing: border-box;
  width: 100%;
  min-height: 60px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}

button.row-head {
  cursor: pointer;

  &:hover {
    background: var(--fw-raised-2);
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: -2px;
  }
}

.orb,
.avatar {
  position: relative;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--orb);
  border-radius: 50%;
  background: color-mix(in srgb, var(--orb) 28%, var(--fw-raised));
  color: var(--fw-text-1);
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

// On several networks: how many, as on a wallet's own list.
.orb-count {
  position: absolute;
  right: -5px;
  bottom: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border: 2px solid var(--fw-bg-base);
  border-radius: 9px;
  background: var(--fw-raised-2);
  color: var(--fw-text-1);
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
}

.avatar {
  font-size: 0.9rem;
}

// The logo sits inside the ring, so the row keeps the colour of its ray and chip.
.orb-logo {
  border-radius: 50%;
}

.identity {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  color: var(--fw-text-2);
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}

.change {
  font-size: 0.7rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.change--up {
  color: var(--fw-up);
}

.change--down {
  color: var(--fw-down);
}

.value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.fiat {
  font-weight: 700;
}

.amount {
  color: var(--fw-text-2);
  font-size: 0.72rem;
}

.chevron {
  color: var(--fw-text-2);
  transition: transform var(--fw-dur-fast) var(--fw-ease);
}

.open {
  min-height: 44px;
  margin: 0 0 4px 50px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fw-link);
  font: inherit;
  font-size: 0.75rem;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}
</style>
