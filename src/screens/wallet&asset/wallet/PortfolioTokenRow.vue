<template>
  <section
    class="token-row"
    :class="{ 'token-row--hidden': row.hidden, 'token-row--manage': manage }"
    :data-token="row.id"
    :data-symbol="row.symbol"
    :data-network="isGroup ? undefined : single.asset.networkName"
  >
    <div class="token-line">
      <!-- In Manage a single row is not a button: its switch is the one control (as in a network section). -->
      <component
        :is="headerIsButton ? 'button' : 'div'"
        class="token-header"
        :type="headerIsButton ? 'button' : undefined"
        :aria-expanded="isGroup && manage ? expanded : undefined"
        :aria-label="headerIsButton ? accessibleLabel : undefined"
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

        <!-- In Manage a single row has only its switch; a group still opens to its networks. -->
        <Icon
          v-if="!manage || isGroup"
          :icon="isGroup && manage && expanded ? 'down' : 'chevron-right'"
          className="chevron"
          width="16px"
          height="16px"
          :hover="false"
        />
      </component>

      <Switcher
        v-if="manage"
        class="row-switch"
        data-testid="tokenRowSwitch"
        :value="!row.hidden"
        :ariaLabel="rowSwitchLabel"
        @change="setRowPreference($event ? 'shown' : 'hidden')"
      />
    </div>

    <!-- Manage opens a token to its networks, each with its own switch; outside Manage the token's own page does. -->
    <div v-if="isGroup && manage && expanded" class="token-networks" data-testid="tokenNetworks">
      <div v-for="child in visibleChildren" :key="child.asset.key" class="network-line">
        <div
          class="network-row"
          :class="{ 'network-row--hidden': child.asset.hidden }"
          :data-asset-key="child.asset.key"
          :data-network="child.asset.networkName"
          :data-symbol="child.asset.symbol"
        >
          <ExternalLogo :name="child.asset.networkIcon" :width="28" class="network-logo" />

          <span class="network-identity">
            <span class="network-name">{{ child.asset.networkName }}</span>
            <span class="network-meta">
              <span v-if="roleLabel(child.role)" class="role-chip" data-testid="memberRole">{{ roleLabel(child.role) }}</span>
              <span v-if="child.asset.hidden" class="row-badge" data-testid="hiddenBadge">{{ t('portfolioPage.hiddenBadge') }}</span>
              <span
                v-if="child.asset.hidden && child.asset.preferenceSource === 'legacy305'"
                class="row-badge legacy"
                data-testid="hiddenPreviousVersion"
              >
                {{ t('portfolioPage.hiddenPreviousVersion') }}
              </span>
            </span>
          </span>

          <span v-if="child.asset.balanceUnavailable" class="network-balance" data-testid="networkBalanceUnavailable">
            <span class="token-failed">{{ t('portfolioPage.balanceStatus.failed') }}</span>
          </span>
          <span v-else class="network-balance">
            <span>{{ formatAmount(child.asset.balanceText) }} {{ child.asset.symbol }}</span>
            <span class="token-amount">{{ formatFiat(child.asset.fiatValue) }}</span>
            <span v-if="child.asset.balanceFailed" class="token-note token-failed" data-testid="networkBalanceFailed">
              {{ t('portfolioPage.balanceStatus.failed') }}
            </span>
          </span>
        </div>

        <Switcher
          class="row-switch"
          :value="!child.asset.hidden"
          :ariaLabel="t('portfolioPage.showAssetOnNetwork', { symbol: child.asset.symbol, network: child.asset.networkName })"
          @change="setPreference(child.asset.key, $event ? 'shown' : 'hidden')"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { AssetPreference } from '@/portfolio/assetIdentity';
import { formatChange } from '@/portfolio/dashboard/format';
import { toggleListEntry } from '@/portfolio/portfolioViewSettings';
import { tokenRowKeys, type PortfolioTokenChild, type PortfolioTokenRow } from '@/portfolio/tokenLens';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{
  row: PortfolioTokenRow;
  manage?: boolean;
  search?: string;
  /** Keeps a group open in Manage while the Hidden filter shows its hidden networks. */
  forceExpanded?: boolean;
}>();

const router = useRouter();
const { t, tc } = useI18n();
const accountsStore = useAccountsStore();
const { formatAmount, formatFiat, formatPrice, roleLabel } = usePortfolioFormatting();

const isGroup = computed(() => props.row.children.length + props.row.zeroChildren.length > 1);
const single = computed<PortfolioTokenChild>(() => props.row.children[0] ?? props.row.zeroChildren[0]);
// Where the token is held: its funded networks (a group's zero networks wait on its page), or all of them at zero.
const held = computed<PortfolioTokenChild[]>(() => (props.row.children.length ? props.row.children : props.row.zeroChildren));

// Expansion is remembered per wallet; only By token rows use `expandedGroups`, so it is per lens as well.
const expanded = computed(() => props.forceExpanded || accountsStore.portfolioView.expandedGroups.includes(props.row.id));
const visibleChildren = computed(() => [...props.row.children, ...props.row.zeroChildren]);

// Outside Manage every row opens something; in Manage only a group does (its networks).
const headerIsButton = computed(() => !props.manage || isGroup.value);

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

// Outside Manage a token opens: a group on its own page, which lists its networks; a single network on its asset page.
function onHeaderClick(): void {
  if (!isGroup.value) {
    openChild(single.value);
    return;
  }

  // A token found by a search keeps it there, so its page lists the networks the search found, hidden ones included.
  if (!props.manage) {
    const search = props.search?.trim();

    router.push({ name: Components.TokenOverview, params: { token: props.row.id }, ...(search ? { query: { search } } : {}) });
    return;
  }

  accountsStore.updatePortfolioView({
    expandedGroups: toggleListEntry(accountsStore.portfolioView.expandedGroups, props.row.id, !expanded.value),
  });
}

function openChild({ asset }: PortfolioTokenChild): void {
  if (props.manage) return;
  if (props.search?.trim() && asset.preference === 'hidden') setPreference(asset.key, 'auto');

  router.push({
    name: Components.AssetHistory,
    params: { assetId: asset.assetId, selectedNetwork: asset.networkName },
  });
}

function setPreference(key: string, preference: AssetPreference): void {
  accountsStore.setAssetPreference({ key, preference });
}

/** The switch of a row in Manage: one write for every network of the token, so a group is shown or hidden at once. */
function setRowPreference(preference: AssetPreference): void {
  accountsStore.setAssetPreferences({ entries: tokenRowKeys(props.row).map((key) => ({ key, preference })) });
}

// That switch is named for what it writes: every network of the token, or the one network of a single row.
const rowSwitchLabel = computed(() =>
  isGroup.value
    ? tc('portfolioPage.showTokenOnNetworks', props.row.networkCount, { symbol: props.row.symbol, count: props.row.networkCount })
    : t('portfolioPage.showAssetOnNetwork', { symbol: props.row.symbol, network: single.value.asset.networkName })
);
</script>

<style lang="scss" scoped>
// One line per token, as in Exodus: logo, symbol and price on the left, value and amount on the right.
// The list scrolls in the page gutter (Currencies.vue), so a row keeps clear of it.
.token-row {
  margin-right: 16px;
  text-align: left;
}

.token-row--manage {
  border-bottom: $default-border;
}

.token-line,
.network-line {
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

  &:is(button):hover {
    background: var(--fw-raised-2);
  }

  &:focus-visible {
    outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
    outline-offset: -2px;
  }
}

div.token-header {
  cursor: default;
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
.network-identity,
.token-balance,
.network-balance {
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

.token-symbol,
.network-name {
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

.token-balance,
.network-balance {
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

.network-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.role-chip,
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

.role-chip {
  // A tag in the HUD style: cyan text on a cyan trace.
  border-color: $fw-hud-trace;
  color: $pink-lavender-color;
}

.row-badge {
  text-transform: uppercase;

  &.legacy {
    color: $pink-lavender-color;
    text-transform: none;
  }
}

.token-networks {
  margin: 0 0 10px 30px;
  padding-left: 12px;
  // The circuit trace that joins a token's networks (design-system 5.5).
  border-left: 2px solid $fw-hud-selection-line;
}

.network-row {
  flex: 1;
  min-width: 0;
  min-height: 52px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-top: $default-border;
}

.network-logo {
  border-radius: 50%;
}

.network-row--hidden,
.token-row--hidden > .token-line {
  .network-logo,
  .network-name,
  .network-balance,
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

.row-switch {
  flex: none;
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
