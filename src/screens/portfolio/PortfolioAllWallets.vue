<template>
  <div class="all" data-testid="portfolioAllWallets">
    <div class="segmented" role="group" :aria-label="t('portfolioDashboard.lens.label')" data-testid="allWalletsLens">
      <button
        v-for="option in lensOptions"
        :key="option.value"
        type="button"
        class="segment"
        :aria-pressed="lens === option.value"
        :data-testid="`allLens-${option.value}`"
        @click="$emit('update:lens', option.value)"
      >
        {{ t(option.label) }}
      </button>
    </div>

    <div v-if="loading" class="state" role="status" aria-live="polite" data-testid="allWalletsLoading">
      <Shimmer height="48px" width="100%" />
      <Shimmer height="48px" width="100%" />
      <span class="sr-only">{{ t('portfolioDashboard.rows.loading') }}</span>
    </div>

    <div v-else-if="isEmpty" class="state state--empty" data-testid="allWalletsEmpty">
      <strong>{{ t('portfolioDashboard.rows.emptyTitle') }}</strong>
      <span>{{ t('portfolioDashboard.rows.emptyText') }}</span>
    </div>

    <ul v-else-if="lens === 'token'" class="rows" data-testid="allTokens">
      <li v-for="row in tokenRows" :key="row.id" class="row" :class="{ 'row--active': row.id === activeKey }" :data-key="row.id">
        <button
          type="button"
          class="row-head"
          :aria-expanded="row.children.length > 1 ? isOpen(row.id) : undefined"
          :aria-label="rowLabel(row)"
          :data-testid="`tokenRow-${row.id}`"
          @click="onRowClick(row)"
        >
          <span class="orb" :style="orbStyle(row.id)" aria-hidden="true">{{ row.symbol.slice(0, 4) }}</span>
          <span class="identity">
            <span class="title">
              {{ row.symbol }}
              <span v-if="change(row.changePercent)" class="change" :class="`change--${change(row.changePercent)?.direction}`">
                {{ change(row.changePercent)?.percentText }}
              </span>
            </span>
            <span class="sub">
              {{ tc('portfolioDashboard.rows.networks', row.networks.length, { count: row.networks.length }) }} · {{ row.wallets.join(', ') }}
              <PortfolioReadinessChip v-if="row.children.length === 1" :readiness="readinessOf(row.children[0])" />
            </span>
          </span>
          <span class="value">
            <span class="fiat">{{ formatFiatValue(row.fiat) }}</span>
            <span class="amount">{{ formatAmount(row.amount) }} {{ row.symbol }}</span>
          </span>
          <Icon
            v-if="row.children.length > 1"
            icon="down"
            width="12px"
            height="10px"
            :hover="false"
            class="chevron"
            :class="{ 'chevron--open': isOpen(row.id) }"
          />
          <Icon v-else icon="chevron-right" width="16px" height="16px" :hover="false" class="chevron" />
        </button>

        <ul v-if="row.children.length > 1 && isOpen(row.id)" class="children" :data-testid="`tokenChildren-${row.id}`">
          <li v-for="(child, index) in row.children" :key="`${child.address}-${child.networkName}-${index}`" class="child">
            <span class="identity">
              <span class="title">{{ child.networkName }}</span>
              <span class="sub">
                {{ child.walletName }}
                <PortfolioReadinessChip :readiness="readinessOf(child)" />
              </span>
            </span>
            <span class="value">
              <span class="fiat">{{ formatFiatValue(child.fiat) }}</span>
              <span class="amount">{{ formatAmount(child.amount) }} {{ child.symbol }}</span>
            </span>
          </li>
        </ul>
        <button v-if="row.children.length > 1 && isOpen(row.id)" type="button" class="open" :data-testid="`whereItLives-${row.id}`" @click="$emit('open', row.id)">
          {{ t('portfolioDashboard.where.action') }}
        </button>
      </li>
    </ul>

    <div v-else-if="lens === 'network'" class="sections" data-testid="allNetworks">
      <section v-for="section in networkSections" :key="section.name" class="section" :class="{ 'row--active': section.name === activeKey }" :data-key="section.name">
        <header class="section-head">
          <span class="dot" :style="{ background: colourOf(section.name) }" aria-hidden="true"></span>
          <h3 class="section-title">{{ section.name }}</h3>
          <span class="fiat">{{ formatFiatValue(section.fiat) }}</span>
        </header>
        <ul class="children">
          <li v-for="row in section.rows" :key="row.id" class="child child--button">
            <button
              type="button"
              class="child-open"
              :aria-label="t('portfolioDashboard.where.open', { name: row.symbol })"
              :data-testid="`networkRow-${row.id}`"
              @click="$emit('open', row.tokenKey, row.holdingId)"
            >
              <span class="identity">
                <span class="title">{{ row.symbol }}</span>
                <span class="sub">
                  {{ row.walletName }}
                  <PortfolioReadinessChip :readiness="readinessOf({ key: row.key, symbol: row.symbol, networkName: section.name })" />
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
      </section>
    </div>

    <ul v-else class="rows" data-testid="allWalletRows">
      <li v-for="wallet in wallets" :key="wallet.address" class="row" :class="{ 'row--active': wallet.address === activeKey }" :data-key="wallet.address">
        <div class="row-head" :data-testid="`walletRow-${wallet.address}`">
          <span class="avatar" :style="orbStyle(wallet.address)" aria-hidden="true">{{ initial(wallet.name) }}</span>
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
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { AggregatedWallet } from '@/portfolio/dashboard/aggregate';
import type { AggregateNetworkSection, AggregateTokenRow } from '@/portfolio/dashboard/facets';
import type { AllWalletsLens } from '@/portfolio/dashboard/preferences';
import type { Readiness, ReadinessSubject } from '@/portfolio/dashboard/readiness';
import { formatChange, formatShare } from '@/portfolio/dashboard/format';
import { chartColour } from '@/portfolio/dashboard/skyGeometry';
import { formatSyncAge } from '@/portfolio/syncFreshness';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import PortfolioReadinessChip from '@/screens/portfolio/PortfolioReadinessChip.vue';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  lens: AllWalletsLens;
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
}>();

const emit = defineEmits<{
  (event: 'update:lens', lens: AllWalletsLens): void;
  (event: 'openWallet', address: string): void;
  /** Where it lives for a token, with one holding chosen when the row names one. */
  (event: 'open', tokenKey: string, holdingId?: string): void;
}>();

const { t, tc } = useI18n();
const accountsStore = useAccountsStore();
const { formatAmount, formatFiatValue } = usePortfolioFormatting();

const lensOptions: Array<{ value: AllWalletsLens; label: string }> = [
  { value: 'token', label: 'portfolioDashboard.lens.tokens' },
  { value: 'network', label: 'portfolioDashboard.lens.networks' },
  { value: 'wallet', label: 'portfolioDashboard.lens.wallets' },
];

const isEmpty = computed(() =>
  props.lens === 'token' ? !props.tokenRows.length : props.lens === 'network' ? !props.networkSections.length : !props.wallets.length
);

const colourOf = (key: string): string => chartColour(props.slotOf(key));
const orbStyle = (key: string): Record<string, string> => ({ '--orb': colourOf(key) });
const change = (percent: string | null) => {
  if (percent === null) return null;

  const formatted = formatChange('0', percent, accountsStore.fiatSymbol);

  return formatted.direction === 'flat' ? null : formatted;
};
const initial = (name: string): string => Array.from(name.trim())[0]?.toUpperCase() ?? '';

// A token with several holdings opens to them; one holding opens Where it lives at once (spec 4.3).
function onRowClick(row: AggregateTokenRow): void {
  if (row.children.length > 1) toggle(row.id);
  else emit('open', row.id, row.children[0]?.holdingId);
}
const rowLabel = (row: AggregateTokenRow): string =>
  row.children.length > 1
    ? t(isOpen(row.id) ? 'portfolioDashboard.rows.collapse' : 'portfolioDashboard.rows.expand', { name: row.symbol })
    : t('portfolioDashboard.where.open', { name: row.symbol });

const open = ref<Set<string>>(new Set());
const isOpen = (id: string): boolean => open.value.has(id);
const toggle = (id: string): void => {
  const next = new Set(open.value);

  if (next.has(id)) next.delete(id);
  else next.add(id);
  open.value = next;
};

function walletMeta(wallet: AggregatedWallet): string {
  const networks = new Set(wallet.holdings.map(({ networkName }) => networkName)).size;
  const parts = [tc('portfolioDashboard.rows.networks', networks, { count: networks })];

  if (wallet.latestTimestamp) parts.push(formatSyncAge(wallet.latestTimestamp, Date.now(), (key, values) => t(key, values ?? {})));

  return parts.join(' · ');
}

// "Open" on a legend chip or a ray: the row for that group opens and comes into view.
watch(
  () => props.focus,
  async (focus) => {
    if (!focus) return;

    if (props.lens === 'token' && !open.value.has(focus.key)) toggle(focus.key);
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
  padding: $default-padding;
  min-width: 0;
  // The app centres its text; a list reads from the left.
  text-align: left;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px;
  padding: 2px;
  border-radius: 12px;
  background: var(--fw-sunken);
}

.segment {
  min-height: 40px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--fw-text-2);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;

  &[aria-pressed='true'] {
    border-color: var(--fw-select-edge);
    background: var(--fw-raised-2);
    color: var(--fw-text-1);
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
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

.rows,
.children {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rows {
  display: flex;
  flex-direction: column;
}

.row,
.section {
  border-top: 1px solid var(--fw-divider);

  &:first-child {
    border-top: 0;
  }
}

.row--active {
  background: var(--fw-row-selected);
}

.row-head {
  width: 100%;
  min-height: 56px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}

button.row-head {
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: -2px;
  }
}

.orb,
.avatar {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--orb);
  border-radius: 50%;
  background: color-mix(in srgb, var(--orb) 28%, var(--fw-raised));
  color: var(--fw-text-1);
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  overflow: hidden;
}

.avatar {
  font-size: 0.9rem;
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

.chevron--open {
  transform: rotate(180deg);
}

.children {
  padding: 0 4px 8px 50px;
}

.child {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 4px 0;
  border-top: 1px dashed var(--fw-divider);

  &:first-child {
    border-top: 0;
  }
}

.child--button {
  display: block;
  padding: 0;
}

.child-open {
  width: 100%;
  min-height: 52px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: -2px;
  }
}

.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 4px;
}

.section-title {
  flex: 1;
  margin: 0;
  min-width: 0;
  font-size: 0.85rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
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
