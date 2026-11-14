<template>
  <div class="token-page" data-testid="tokenOverview">
    <div v-if="!row && loading" class="state" role="status" aria-live="polite" data-testid="tokenOverviewLoading">
      <Shimmer height="56px" width="56px" />
      <Shimmer height="28px" width="160px" />
      <Shimmer height="120px" width="100%" />
      <span class="sr-only">{{ t('portfolioPage.loadingBalances') }}</span>
    </div>

    <div v-else-if="!row" class="state" data-testid="tokenOverviewNotFound">
      <strong>{{ t('walletHome.token.notFound') }}</strong>
      <button type="button" class="link" @click="backToAssets">{{ t('walletHome.token.back') }}</button>
    </div>

    <template v-else>
      <header class="head" data-testid="tokenHead">
        <span class="head-logo" aria-hidden="true">
          <ExternalLogo :name="row.icon" :width="56" class="head-logo-img" />
        </span>
        <h1 class="head-symbol">{{ row.symbol }}</h1>
        <p v-if="groupName" class="head-name">{{ groupName }}</p>

        <p v-if="row.balanceUnavailable" class="head-total head-total--failed" data-testid="tokenTotal">
          {{ t('portfolioPage.balanceStatus.failed') }}
        </p>
        <template v-else>
          <p class="head-total" data-testid="tokenTotal">{{ formatAmount(row.balanceText) }} {{ row.symbol }}</p>
          <p class="head-fiat" data-testid="tokenValue">
            {{ formatFiat(row.fiatValue) }}<template v-if="share"> · {{ t('walletHome.token.share', { percent: share }) }}</template>
          </p>
        </template>

        <p v-if="price" class="head-price" data-testid="tokenUnitPrice">
          {{ t('walletHome.token.price', { symbol: row.symbol, price }) }}
          <span v-if="priceChange" class="change" :class="`change--${priceChange.direction}`">
            · {{ priceChange.percentText }} {{ t('walletHome.change24h') }}
          </span>
        </p>
        <p v-if="row.balanceFailed && !row.balanceUnavailable" class="head-note" data-testid="tokenBalanceFailed">
          {{ t('portfolioPage.balanceStatus.failed') }}
        </p>
      </header>

      <RoundActions v-if="actions.length" class="actions" :actions="actions" data-testid="tokenActions" @action="onAction" />

      <section class="networks" aria-labelledby="token-networks-title">
        <h2 id="token-networks-title" class="networks-title">{{ t('walletHome.token.networks') }}</h2>
        <p class="networks-hint">{{ t('walletHome.token.networksHint', { symbol: row.symbol }) }}</p>

        <ul class="network-list" data-testid="tokenNetworkList">
          <li v-for="child in listedChildren" :key="child.asset.key">
            <button
              type="button"
              class="network"
              :class="{ 'network--hidden': child.asset.hidden }"
              :aria-label="networkLabel(child)"
              :data-network="child.asset.networkName"
              data-testid="tokenNetworkRow"
              @click="openNetwork(child)"
            >
              <ExternalLogo :name="child.asset.networkIcon" :width="36" class="network-logo" />

              <span class="network-identity">
                <span class="network-name">{{ child.asset.networkName }}</span>
                <span class="network-meta">
                  <span v-if="roleLabel(child.role)" data-testid="memberRole">{{ roleLabel(child.role) }}</span>
                  <span v-if="child.asset.hidden" class="badge">{{ t('portfolioPage.hiddenBadge') }}</span>
                </span>
              </span>

              <span v-if="child.asset.balanceUnavailable" class="network-balance" data-testid="networkBalanceUnavailable">
                <span class="failed">{{ t('portfolioPage.balanceStatus.failed') }}</span>
              </span>
              <span v-else class="network-balance">
                <span class="network-amount">{{ formatAmount(child.asset.balanceText) }} {{ child.asset.symbol }}</span>
                <span class="network-fiat">{{ formatFiat(child.asset.fiatValue) }}</span>
                <span v-if="showsAvailable(child)" class="network-note" data-testid="networkAvailable">
                  {{ t('walletHome.token.available', { amount: `${formatAmount(child.asset.transferableText)} ${child.asset.symbol}` }) }}
                </span>
                <span v-if="child.asset.balanceFailed" class="network-note failed" data-testid="networkBalanceFailed">
                  {{ t('portfolioPage.balanceStatus.failed') }}
                </span>
              </span>

              <Icon icon="chevron-right" width="16px" height="16px" :hover="false" class="chevron" />
            </button>
          </li>
        </ul>

        <button
          v-if="row.zeroChildren.length && row.children.length"
          type="button"
          class="zero-toggle"
          :aria-expanded="zeroOpen"
          data-testid="tokenZeroToggle"
          @click="zeroOpen = !zeroOpen"
        >
          {{
            zeroOpen
              ? t('walletHome.token.hideZero')
              : tc('walletHome.token.showZero', row.zeroChildren.length, { count: row.zeroChildren.length })
          }}
        </button>
      </section>
    </template>

    <!-- The network is always named before Send or Receive, with the wrong-network warning (portfolio contract §7). -->
    <PortfolioGroupNetworkPicker
      v-if="picker"
      :action="picker.action"
      :symbol="picker.symbol"
      :options="picker.options"
      @pick="pickNetwork"
      @close="picker = null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onDeactivated, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { GroupNetworkOption, PortfolioTokenChild } from '@/portfolio/tokenLens';
import RoundActions, { type RoundAction } from '@/screens/portfolio/RoundActions.vue';
import PortfolioGroupNetworkPicker from '@/screens/wallet&asset/wallet/PortfolioGroupNetworkPicker.vue';
import { formatChange } from '@/portfolio/dashboard/format';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { useWalletTokenRows } from '@/portfolio/useWalletTokenRows';
import { FPNumber } from '@/sora/number';
import { Components } from '@/router/routes';
import { IS_EXTENSION } from '@/consts/global';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';
import { isSelectedWalletRecoveryOnly } from '@/util/walletRecoveryPolicy';

const props = withDefaults(
  defineProps<{
    /** The row id of the wallet's list: `group:<id>` for a token on several networks. */
    token: string;
    /** The list's search the token was found by: its networks are listed as the search found them, hidden ones too. */
    search?: string;
  }>(),
  { search: '' }
);

const router = useRouter();
const { t, tc } = useI18n();
const accountsStore = useAccountsStore();
const { formatAmount, formatFiat, formatPrice, roleLabel } = usePortfolioFormatting();
const portfolio = usePortfolio();
const { findRow, groupIdOf, groupIndex, sendOptions, receiveOptions } = useWalletTokenRows({
  portfolio,
  search: computed(() => props.search),
});

const row = computed(() => findRow(props.token));
const loading = computed(() => accountsStore.isBalanceLoading || portfolio.loadStatus.value.state === 'loading');
const zeroOpen = ref(false);
const picker = ref<null | { action: 'send' | 'receive'; symbol: string; options: GroupNetworkOption[] }>(null);

// A curated group name ("Polkadot", "Tether USD") reads better than a registry id; a lone asset has only its symbol.
const groupName = computed(() => {
  const groupId = row.value ? groupIdOf(row.value) : undefined;
  const name = groupId ? groupIndex.value.groups.get(groupId)?.name : undefined;

  return name && name !== row.value?.symbol ? name : '';
});

const listedChildren = computed(() => (row.value ? [...row.value.children, ...(zeroOpen.value ? row.value.zeroChildren : [])] : []));

const pricedChild = computed(() =>
  row.value ? [...row.value.children, ...row.value.zeroChildren].find(({ asset }) => asset.unitPrice !== null) : undefined
);
const price = computed(() => (pricedChild.value?.asset.unitPrice ? formatPrice(pricedChild.value.asset.unitPrice) : ''));
const priceChange = computed(() => {
  const percent = pricedChild.value?.asset.priceChangePercent;
  if (percent === null || percent === undefined) return null;

  const change = formatChange('0', percent, '');

  return change.direction === 'flat' ? null : change;
});

// The token's part of the wallet total, which counts the same priced, visible holdings.
const share = computed(() => {
  const value = row.value?.fiatValue;
  const total = new FPNumber(portfolio.summary.value.total || '0');
  if (!value || total.isZero() || row.value?.hidden) return '';

  const percent = new FPNumber(value).div(total).mul(FPNumber.HUNDRED).toNumber();

  return percent > 0 && percent < 1 ? '<1' : String(Math.round(percent));
});

const recoveryOnly = computed(
  () => IS_EXTENSION && isSelectedWalletRecoveryOnly(accountsStore.accounts, accountsStore.selectedWallet.address)
);

const actions = computed<RoundAction[]>(() => {
  if (!row.value) return [];

  return [
    {
      id: 'send',
      icon: 'send',
      label: t('walletHome.send'),
      aria: t('walletHome.token.sendAria', { symbol: row.value.symbol }),
      testId: 'tokenSend',
      disabled: sendOptions(row.value).length === 0,
    },
    // An old wallet takes nothing new (walletRecoveryPolicy.ts), so it offers no Receive.
    ...(recoveryOnly.value
      ? []
      : [
          {
            id: 'receive',
            icon: 'receive',
            label: t('walletHome.receive'),
            aria: t('walletHome.token.receiveAria', { symbol: row.value.symbol }),
            testId: 'tokenReceive',
          },
          { id: 'swap', icon: 'polkaswap', label: t('walletHome.swap'), aria: t('walletHome.swapAria'), testId: 'tokenSwap' },
        ]),
  ];
});

function onAction(id: string): void {
  if (!row.value) return;

  if (id === 'swap') {
    void router.push({ name: Components.Polkaswap });
    return;
  }

  const action = id === 'send' ? 'send' : 'receive';
  const options = action === 'send' ? sendOptions(row.value) : receiveOptions(row.value);

  picker.value = { action, symbol: row.value.symbol, options };
}

function pickNetwork(option: GroupNetworkOption): void {
  const action = picker.value?.action;
  picker.value = null;
  if (!action) return;

  void router.push({
    name: action === 'send' ? Components.SendForm : Components.ReceiveForm,
    params: { assetId: option.assetId, network: option.networkName },
  });
}

// A hidden network a search found is shown again once it is opened, as the list does; the others stay hidden.
function openNetwork({ asset }: PortfolioTokenChild): void {
  if (props.search.trim() && asset.preference === 'hidden') accountsStore.setAssetPreference({ key: asset.key, preference: 'auto' });

  void router.push({ name: Components.AssetHistory, params: { assetId: asset.assetId, selectedNetwork: asset.networkName } });
}

function backToAssets(): void {
  void router.push({ name: Components.Currencies });
}

const showsAvailable = ({ asset }: PortfolioTokenChild): boolean =>
  asset.hasBalance && formatAmount(asset.transferableText) !== formatAmount(asset.balanceText);

function networkLabel({ asset, role }: PortfolioTokenChild): string {
  const network = roleLabel(role) ? `${asset.networkName} (${roleLabel(role)})` : asset.networkName;

  if (asset.balanceUnavailable)
    return t('portfolioPage.tokenSingleFailedLabel', { symbol: asset.symbol, network, status: t('portfolioPage.balanceStatus.failed') });

  const label = t('portfolioPage.tokenSingleLabel', {
    symbol: asset.symbol,
    network,
    amount: `${formatAmount(asset.balanceText)} ${asset.symbol}`,
    value: formatFiat(asset.fiatValue),
  });

  return asset.balanceFailed ? `${label} · ${t('portfolioPage.balanceStatus.failed')}` : label;
}

// Another token, or the same page come back to: start from its funded networks, with nothing asked.
watch(
  () => props.token,
  () => {
    zeroOpen.value = false;
    picker.value = null;
  }
);
// The picker lives in the body: a kept-alive page must not leave it open over another screen.
onDeactivated(() => (picker.value = null));
</script>

<style lang="scss" scoped>
.token-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 4px 4px 24px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--fw-stroke-strong);
    border-radius: $default-border-radius;
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

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 16px;
  color: var(--fw-text-2);
  text-align: center;

  strong {
    color: var(--fw-text-1);
  }
}

.link {
  border: 0;
  background: transparent;
  color: var(--fw-link);
  font: inherit;
  cursor: pointer;
}

.head {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;

  // The same soft glow as the home's total.
  &::before {
    content: '';
    position: absolute;
    inset: -20px 10% 20%;
    background: var(--fw-brand-glow);
    pointer-events: none;
  }

  > * {
    position: relative;
  }

  p,
  h1 {
    margin: 0;
  }
}

.head-logo {
  margin-bottom: 4px;
}

.head-logo-img {
  border-radius: 50%;
}

.head-symbol {
  color: var(--fw-text-1);
  font-size: 1rem;
  font-weight: 700;
}

.head-name {
  color: var(--fw-text-3);
  font-size: 0.75rem;
}

.head-total {
  margin-top: 6px !important;
  color: var(--fw-text-1);
  font-size: 1.9rem;
  font-weight: 800;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.head-total--failed {
  color: var(--fw-warning);
  font-size: 1.1rem;
}

.head-fiat {
  color: var(--fw-text-2);
  font-size: 0.95rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.head-price {
  color: var(--fw-text-2);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.head-note,
.failed {
  color: var(--fw-warning);
}

.head-note {
  font-size: 0.72rem;
}

// Aqua and orange never carry the direction alone (design-system 3.5): the sign is in the text.
.change--up {
  color: var(--fw-up);
}

.change--down {
  color: var(--fw-down);
}

.networks {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.networks-title {
  margin: 0;
  color: var(--fw-text-1);
  font-size: 0.85rem;
  font-weight: 700;
}

.networks-hint {
  margin: 0 0 4px;
  color: var(--fw-text-3);
  font-size: 0.72rem;
}

.network-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--fw-divider);
  border-radius: 14px;
  background: var(--fw-raised);
  overflow: hidden;

  li + li {
    border-top: 1px solid var(--fw-divider);
  }
}

.network {
  box-sizing: border-box;
  width: 100%;
  min-height: 60px;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--fw-dur-fast) var(--fw-ease);

  &:hover {
    background: var(--fw-raised-2);
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: -2px;
  }
}

.network--hidden {
  .network-logo,
  .network-identity,
  .network-balance {
    opacity: 0.5;
  }
}

.network-logo {
  border-radius: 50%;
}

.network-identity,
.network-balance {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.network-name {
  color: var(--fw-text-1);
  font-size: 0.9rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.network-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  color: var(--fw-text-3);
  font-size: 0.7rem;
}

.badge {
  padding: 0 5px;
  border: 1px solid var(--fw-divider);
  border-radius: 6px;
  text-transform: uppercase;
}

.network-balance {
  align-items: flex-end;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.network-amount {
  color: var(--fw-text-1);
  font-size: 0.85rem;
  font-weight: 700;
}

.network-fiat,
.network-note {
  color: var(--fw-text-2);
  font-size: 0.72rem;
}

.chevron {
  color: var(--fw-text-3);
}

.zero-toggle {
  align-self: center;
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: var(--fw-link);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .network {
    transition: none;
  }
}

@media (max-width: 380px) {
  .network {
    grid-template-columns: 32px minmax(0, 1fr) auto 12px;
    gap: 10px;
    padding: 10px;
  }
}
</style>
