<template>
  <section
    class="token-row"
    :class="{ 'token-row--hidden': row.hidden, 'token-row--enter': entering }"
    :data-token="row.id"
    :data-symbol="row.symbol"
    :data-network="isGroup ? undefined : single.asset.networkName"
  >
    <div class="token-line">
      <button
        class="token-header"
        type="button"
        :aria-label="accessibleLabel"
        :data-testid="isGroup ? 'tokenGroupHeader' : 'tokenRowHeader'"
        @click="onHeaderClick"
      >
        <span class="token-icon">
          <ExternalLogo :name="row.icon" :width="40" class="asset-logo" />
          <!-- Held on one network: its logo. On several: how many, so the row reads as one token held in several places. -->
          <span v-if="held.length > 1" class="network-stack" data-testid="networkCount">{{ held.length }}</span>
          <ExternalLogo v-else :name="held[0].asset.networkIcon" :width="16" class="network-badge" />
        </span>

        <span class="token-identity">
          <span class="token-title">
            <span class="token-symbol">{{ row.symbol }}</span>
            <span v-if="!isGroup && single.asset.trust !== 'verified'" class="row-badge">{{ t('portfolioPage.unverified') }}</span>
            <span v-if="!isGroup && single.asset.isTestnet" class="row-badge" data-testid="testnetBadge">{{ t('portfolioPage.testnetBadge') }}</span>
            <span v-if="!isGroup && single.asset.hidden" class="row-badge" data-testid="hiddenBadge">{{ t('portfolioPage.hiddenBadge') }}</span>
            <span
              v-if="!isGroup && single.asset.hidden && single.asset.preferenceSource === 'legacy305'"
              class="row-badge legacy"
              data-testid="hiddenPreviousVersion"
            >
              {{ t('portfolioPage.hiddenPreviousVersion') }}
            </span>
          </span>

          <!-- Price and its 24h move, then where it is: one network by name, several by count. -->
          <span class="token-subtitle">
            <span v-if="price" class="token-price" data-testid="tokenPrice">{{ price }}</span>
            <span v-if="priceChange" class="token-change" :class="`token-change--${priceChange.direction}`" data-testid="tokenChange">
              {{ priceChange.percentText }}
            </span>
            <span v-if="price" class="token-dot" aria-hidden="true">·</span>
            <span v-if="held.length > 1" class="token-where token-where--count">{{ tc('walletHome.networks', held.length, { count: held.length }) }}</span>
            <span v-else class="token-where" data-testid="tokenNetwork">{{ held[0].asset.networkName }}</span>
          </span>
        </span>

        <!-- A balance no provider could load is unknown, not zero: the row says so instead of an amount. -->
        <span v-if="row.balanceUnavailable" class="token-balance" data-testid="tokenBalanceUnavailable">
          <span class="token-failed">{{ t('portfolioPage.balanceStatus.failed') }}</span>
        </span>
        <span v-else class="token-balance">
          <template v-if="row.fiatValue !== null">
            <span class="token-fiat" data-testid="tokenFiat">{{ formatFiat(row.fiatValue) }}</span>
            <span class="token-amount" data-testid="tokenAmount">{{ formatAmount(row.balanceText) }} {{ row.symbol }}</span>
          </template>
          <template v-else>
            <span class="token-fiat token-fiat--amount" data-testid="tokenAmount">{{ formatAmount(row.balanceText) }} {{ row.symbol }}</span>
            <span v-if="row.hasBalance" class="token-amount" data-testid="tokenFiat">{{ t('portfolioPage.priceUnavailable') }}</span>
          </template>
          <span v-if="row.fiatValue !== null && row.unpricedNetworkCount" class="token-note" data-testid="tokenPartialPrice">
            {{ tc('portfolioPage.priceUnavailableOn', row.unpricedNetworkCount, { count: row.unpricedNetworkCount }) }}
          </span>
          <span v-if="row.balanceFailed" class="token-note token-failed" data-testid="tokenBalanceFailed">
            {{ t('portfolioPage.balanceStatus.failed') }}
          </span>
        </span>

        <Icon icon="chevron-right" className="chevron" width="16px" height="16px" :hover="false" />
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { AssetPreference } from '@/portfolio/assetIdentity';
import type { PortfolioTokenChild, PortfolioTokenRow } from '@/portfolio/tokenLens';
import { formatChange } from '@/portfolio/dashboard/format';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';
import { useI18n } from '@/locales/useI18n';
import { claimListEntrance } from '@/feel/motion';

const props = defineProps<{
  row: PortfolioTokenRow;
  search?: string;
}>();

const router = useRouter();
const { t, tc } = useI18n();
const accountsStore = useAccountsStore();
const { formatAmount, formatFiat, formatPrice } = usePortfolioFormatting();

// Brand kit v3: the rows of the page's first list rise in one after another, once; rows that come later just appear.
const entering = claimListEntrance();

const isGroup = computed(() => props.row.children.length + props.row.zeroChildren.length > 1);
const single = computed<PortfolioTokenChild>(() => props.row.children[0] ?? props.row.zeroChildren[0]);
// Where the token is held: its funded networks (a group's zero networks wait on its page), or all of them at zero.
const held = computed<PortfolioTokenChild[]>(() => (props.row.children.length ? props.row.children : props.row.zeroChildren));

// A group's members are one asset with one trusted price: the first member that has one speaks for the row.
const pricedChild = computed(() => [...props.row.children, ...props.row.zeroChildren].find(({ asset }) => asset.unitPrice !== null));
const price = computed(() => {
  const unitPrice = pricedChild.value?.asset.unitPrice;

  return unitPrice ? formatPrice(unitPrice) : '';
});
const priceChange = computed(() => {
  const percent = pricedChild.value?.asset.priceChangePercent;
  if (percent === null || percent === undefined) return null;

  const change = formatChange('0', percent, '');

  return change.direction === 'flat' ? null : change;
});

// The label replaces what a row shows for assistive technology, so it says what the row says: a balance nobody could
// load has neither an amount nor a value (not "0", not "$0.00", not "Price unavailable"), and a kept amount whose
// update failed is marked as such.
const withFailure = (label: string, failed?: boolean): string =>
  failed ? `${label} · ${t('portfolioPage.balanceStatus.failed')}` : label;

const accessibleLabel = computed(() => {
  const { row } = props;

  if (row.balanceUnavailable) {
    const values = { symbol: row.symbol, status: t('portfolioPage.balanceStatus.failed') };

    return isGroup.value
      ? tc('portfolioPage.tokenGroupFailedLabel', row.networkCount, { ...values, count: row.networkCount })
      : t('portfolioPage.tokenSingleFailedLabel', { ...values, network: single.value.asset.networkName });
  }

  const values = {
    symbol: row.symbol,
    amount: `${formatAmount(row.balanceText)} ${row.symbol}`,
    value: formatFiat(row.fiatValue),
  };
  const label = isGroup.value
    ? tc('portfolioPage.tokenGroupLabel', row.networkCount, { ...values, count: row.networkCount })
    : t('portfolioPage.tokenSingleLabel', { ...values, network: single.value.asset.networkName });

  return withFailure(label, row.balanceFailed);
});

// A token opens: a group on its own page, which lists its networks; a single network on its asset page.
function onHeaderClick(): void {
  if (!isGroup.value) {
    openChild(single.value);
    return;
  }

  // A token found by a search keeps it there, so its page lists the networks the search found, hidden ones included.
  const search = props.search?.trim();

  router.push({ name: Components.TokenOverview, params: { token: props.row.id }, ...(search ? { query: { search } } : {}) });
}

function openChild({ asset }: PortfolioTokenChild): void {
  if (props.search?.trim() && asset.preference === 'hidden') setPreference(asset.key, 'auto');

  router.push({
    name: Components.AssetHistory,
    params: { assetId: asset.assetId, selectedNetwork: asset.networkName },
  });
}

function setPreference(key: string, preference: AssetPreference): void {
  accountsStore.setAssetPreference({ key, preference });
}
</script>

<style lang="scss" scoped>
// One line per token, as in Exodus: logo, symbol and price on the left, value and amount on the right.
// The list scrolls in the page gutter (Currencies.vue), so a row keeps clear of it.
.token-row {
  margin-right: 16px;
  text-align: left;
}

// 12 px rise and fade, 30 ms apart, the thirteenth row onwards together.
.token-row--enter {
  animation: token-row-rise 320ms var(--fw-ease) both;
  animation-delay: 360ms;

  @for $index from 1 through 12 {
    &:nth-child(#{$index}) {
      animation-delay: ($index - 1) * 30ms;
    }
  }
}

@keyframes token-row-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

html[data-fw-effects='reduced'] .token-row--enter,
.fw-calm .token-row--enter {
  animation: none;
}

.token-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.token-header {
  box-sizing: border-box;
  width: 100%;
  min-height: 60px;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 0;
  border-radius: 12px;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--fw-dur-fast) var(--fw-ease);

  &:hover {
    background: var(--fw-raised-2);
  }

  &:focus-visible {
    outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
    outline-offset: -2px;
  }
}

.token-icon {
  position: relative;
  width: 40px;
  height: 40px;

  .asset-logo {
    border-radius: 50%;
  }

  .network-badge {
    position: absolute;
    right: -3px;
    bottom: -3px;
    border: 2px solid var(--fw-bg-base);
    border-radius: 50%;
    background: var(--fw-bg-base);
  }
}

// Several networks: a small count where one network would show its logo.
.network-stack {
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
  font-variant-numeric: tabular-nums;
}

.token-identity,
.token-balance {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.token-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  min-width: 0;
}

.token-symbol {
  color: var(--fw-text-1);
  font-size: 0.95rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.token-subtitle {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
  color: var(--fw-text-2);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.token-where {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.token-dot {
  color: var(--fw-text-3);
}

// Aqua and orange never carry the direction alone (design-system 3.5): the sign is in the text.
.token-change--up {
  color: var(--fw-up);
}

.token-change--down {
  color: var(--fw-down);
}

.token-balance {
  align-items: flex-end;
  text-align: right;
  overflow-wrap: anywhere;
}

.token-fiat {
  color: var(--fw-text-1);
  font-size: 0.95rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.token-amount {
  color: var(--fw-text-2);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.token-note {
  color: var(--fw-text-2);
  font-size: 0.66rem;
}

// An unknown or out-of-date balance reads as a warning, never as an amount.
.token-failed {
  color: $simple-orange-color;
}

.row-badge {
  display: inline-block;
  padding: 1px 6px;
  border: $default-border;
  border-radius: 8px;
  color: $grayish-white;
  font-size: 0.6rem;
  font-weight: 600;
  line-height: 1.5;
}

.row-badge {
  text-transform: uppercase;

  &.legacy {
    color: $pink-lavender-color;
    text-transform: none;
  }
}

.token-row--hidden > .token-line {
  .token-icon,
  .token-symbol,
  .token-subtitle,
  .token-balance {
    opacity: 0.5;
  }
}

.chevron {
  color: var(--fw-text-3);
}

@media (prefers-reduced-motion: reduce) {
  .token-header {
    transition: none;
  }
}

// In a narrow column the amounts keep their side; the price line gives way first.
@media (max-width: 380px) {
  .token-header {
    grid-template-columns: 36px minmax(0, 1fr) auto 12px;
    gap: 10px;
    padding: 8px 6px;
  }

  // The badge on the logo already counts the networks; the price keeps the line.
  .token-where--count,
  .token-where--count + .token-dot,
  .token-dot:has(+ .token-where--count) {
    display: none;
  }

  .token-icon {
    width: 36px;
    height: 36px;
  }
}
</style>
