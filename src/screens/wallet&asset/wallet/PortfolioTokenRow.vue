<template>
  <section class="token-row" :class="{ 'token-row--hidden': row.hidden }" :data-token="row.id">
    <div class="token-line">
      <button
        class="token-header"
        type="button"
        :aria-expanded="isGroup ? expanded : undefined"
        :aria-label="accessibleLabel"
        :data-testid="isGroup ? 'tokenGroupHeader' : 'tokenRowHeader'"
        @click="onHeaderClick"
      >
        <span class="token-icon">
          <ExternalLogo :name="row.icon" :width="38" class="asset-logo" />
          <ExternalLogo :name="row.networkIcon" :width="16" class="network-badge" />
        </span>

        <span class="token-identity">
          <span class="token-symbol">
            {{ row.symbol }}
            <span v-if="isGroup" class="network-count" data-testid="networkCount">
              {{ tc('portfolioPage.networkCount', row.networkCount, { count: row.networkCount }) }}
            </span>
            <span v-else-if="single.asset.trust !== 'verified'" class="trust-badge">{{ t('portfolioPage.unverified') }}</span>
          </span>

          <span v-if="isGroup" class="token-subtitle">{{ row.name }}</span>
          <span v-else class="token-subtitle">
            <span data-testid="tokenNetwork">{{ single.asset.networkName }}</span>
            <span v-if="roleLabel(single.role)" class="role-chip" data-testid="memberRole">{{ roleLabel(single.role) }}</span>
            <span v-if="single.asset.isTestnet" class="row-badge" data-testid="testnetBadge">{{ t('portfolioPage.testnetBadge') }}</span>
          </span>

          <span v-if="!isGroup && single.asset.hidden" class="asset-badges">
            <span class="row-badge" data-testid="hiddenBadge">{{ t('portfolioPage.hiddenBadge') }}</span>
            <span v-if="single.asset.preferenceSource === 'legacy305'" class="row-badge legacy" data-testid="hiddenPreviousVersion">
              {{ t('portfolioPage.hiddenPreviousVersion') }}
            </span>
          </span>
        </span>

        <span class="token-balance">
          <span data-testid="tokenAmount">{{ formatAmount(row.balanceText) }} {{ row.symbol }}</span>
          <span class="token-fiat" data-testid="tokenFiat">{{ formatFiat(row.fiatValue) }}</span>
          <span v-if="row.fiatValue !== null && row.unpricedNetworkCount" class="token-note" data-testid="tokenPartialPrice">
            {{ tc('portfolioPage.priceUnavailableOn', row.unpricedNetworkCount, { count: row.unpricedNetworkCount }) }}
          </span>
          <span v-if="showsTransferable" class="token-note" data-testid="transferable">
            {{ t('portfolioPage.transferable', { amount: `${formatAmount(row.transferableText)} ${row.symbol}` }) }}
          </span>
        </span>

        <!-- In Manage a single row has only its switch; a group still opens to its networks. -->
        <Icon
          v-if="!manage || isGroup"
          :icon="isGroup && expanded ? 'down' : 'chevron-right'"
          className="chevron"
          width="20px"
          height="20px"
          :hover="false"
        />
      </button>

      <Switcher
        v-if="manage"
        class="row-switch"
        data-testid="tokenRowSwitch"
        :value="!row.hidden"
        @change="setRowPreference($event ? 'shown' : 'hidden')"
      />
    </div>

    <div v-if="isGroup && expanded" class="token-networks" data-testid="tokenNetworks">
      <div v-for="child in visibleChildren" :key="child.asset.key" class="network-line">
        <button
          class="network-row"
          :class="{ 'network-row--hidden': child.asset.hidden }"
          type="button"
          :data-asset-key="child.asset.key"
          :aria-label="childLabel(child)"
          @click="openChild(child)"
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

          <span class="network-balance">
            <span>{{ formatAmount(child.asset.balanceText) }} {{ child.asset.symbol }}</span>
            <span class="token-fiat">{{ formatFiat(child.asset.fiatValue) }}</span>
            <span v-if="childShowsTransferable(child)" class="token-note">
              {{ t('portfolioPage.transferable', { amount: `${formatAmount(child.asset.transferableText)} ${child.asset.symbol}` }) }}
            </span>
          </span>

          <Icon v-if="!manage" icon="chevron-right" className="chevron" width="18px" height="18px" :hover="false" />
        </button>

        <Switcher
          v-if="manage"
          class="row-switch"
          :value="!child.asset.hidden"
          @change="setPreference(child.asset.key, $event ? 'shown' : 'hidden')"
        />
      </div>

      <button
        v-if="row.zeroChildren.length && !showZeroChildren"
        class="zero-children"
        type="button"
        data-testid="tokenZeroNetworks"
        @click="zeroChildrenOpen = true"
      >
        {{ tc('portfolioPage.moreZeroNetworks', row.zeroChildren.length, { count: row.zeroChildren.length }) }}
      </button>

      <div v-if="!manage" class="token-actions">
        <button type="button" class="token-action" data-testid="groupSend" :disabled="!canSend" @click="$emit('send', row)">
          <Icon icon="send" className="action-icon" :hover="false" />
          {{ t('assets.sendButtonText') }}
        </button>
        <button type="button" class="token-action" data-testid="groupReceive" @click="$emit('receive', row)">
          <Icon icon="receive" className="action-icon" :hover="false" />
          {{ t('assets.receiveButtonText') }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AssetPreference } from '@/portfolio/assetIdentity';
import { toggleListEntry } from '@/portfolio/portfolioViewSettings';
import { tokenRowKeys, type PortfolioTokenChild, type PortfolioTokenRow } from '@/portfolio/tokenLens';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{
  row: PortfolioTokenRow;
  manage?: boolean;
  /** Keeps a group open while a search or the Hidden filter shows its matching networks. */
  forceExpanded?: boolean;
  /** Whether the Send of this group has a network to offer. */
  canSend?: boolean;
}>();

defineEmits<{ (event: 'send', row: PortfolioTokenRow): void; (event: 'receive', row: PortfolioTokenRow): void }>();

const router = useRouter();
const { t, tc } = useI18n();
const accountsStore = useAccountsStore();
const { formatAmount, formatFiat, roleLabel } = usePortfolioFormatting();
const zeroChildrenOpen = ref(false);

const isGroup = computed(() => props.row.children.length + props.row.zeroChildren.length > 1);
const single = computed<PortfolioTokenChild>(() => props.row.children[0] ?? props.row.zeroChildren[0]);

// Expansion is remembered per wallet; only By token rows use `expandedGroups`, so it is per lens as well.
const expanded = computed(() => props.forceExpanded || accountsStore.portfolioView.expandedGroups.includes(props.row.id));
const showZeroChildren = computed(() => zeroChildrenOpen.value || props.forceExpanded || props.manage || !props.row.children.length);
const visibleChildren = computed(() =>
  showZeroChildren.value ? [...props.row.children, ...props.row.zeroChildren] : props.row.children
);

const showsTransferable = computed(
  () => props.row.hasBalance && formatAmount(props.row.transferableText) !== formatAmount(props.row.balanceText)
);

function childShowsTransferable({ asset }: PortfolioTokenChild): boolean {
  return asset.hasBalance && formatAmount(asset.transferableText) !== formatAmount(asset.balanceText);
}

const accessibleLabel = computed(() => {
  const values = {
    symbol: props.row.symbol,
    amount: `${formatAmount(props.row.balanceText)} ${props.row.symbol}`,
    value: formatFiat(props.row.fiatValue),
  };

  return isGroup.value
    ? tc('portfolioPage.tokenGroupLabel', props.row.networkCount, { ...values, count: props.row.networkCount })
    : t('portfolioPage.tokenSingleLabel', { ...values, network: single.value.asset.networkName });
});

function childLabel({ asset, role }: PortfolioTokenChild): string {
  const network = roleLabel(role) ? `${asset.networkName} (${roleLabel(role)})` : asset.networkName;

  return t('portfolioPage.tokenSingleLabel', {
    symbol: asset.symbol,
    network,
    amount: `${formatAmount(asset.balanceText)} ${asset.symbol}`,
    value: formatFiat(asset.fiatValue),
  });
}

function onHeaderClick(): void {
  if (!isGroup.value) {
    openChild(single.value);
    return;
  }

  accountsStore.updatePortfolioView({
    expandedGroups: toggleListEntry(accountsStore.portfolioView.expandedGroups, props.row.id, !expanded.value),
  });
}

function openChild({ asset }: PortfolioTokenChild): void {
  if (props.manage) return;

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
</script>

<style lang="scss" scoped>
.token-row {
  margin-right: 16px;
  border-bottom: $default-border;
  text-align: left;
}

.token-line,
.network-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.token-header,
.network-row,
.zero-children {
  width: 100%;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
  text-align: left;

  &:focus-visible {
    outline: 2px solid $pink-lavender-color;
    outline-offset: 2px;
  }
}

.token-header {
  min-height: 64px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto 20px;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
}

.token-icon {
  position: relative;
  width: 38px;
  height: 38px;

  .asset-logo {
    border-radius: 50%;
  }

  .network-badge {
    position: absolute;
    right: -3px;
    bottom: -3px;
    border: 2px solid $default-background-color;
    border-radius: 50%;
    background: $default-background-color;
  }
}

.token-identity,
.network-identity,
.token-balance,
.network-balance {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.token-symbol,
.network-name {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.network-count {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 8px;
  background: $pink-purple-color;
  color: $plain-white;
  font-size: 0.62rem;
  font-weight: 600;
  vertical-align: middle;
}

.token-subtitle,
.token-fiat {
  margin-top: 4px;
  color: $gray-color;
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}

.token-note {
  margin-top: 2px;
  color: $gray-color;
  font-size: 0.66rem;
}

.token-balance,
.network-balance {
  align-items: flex-end;
  text-align: right;
  overflow-wrap: anywhere;
}

.network-meta,
.asset-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
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
  border-color: rgba(187, 119, 255, 0.45);
  color: $pink-lavender-color;
}

.token-subtitle .role-chip,
.token-subtitle .row-badge {
  margin-left: 4px;
  vertical-align: middle;
}

.row-badge {
  text-transform: uppercase;

  &.legacy {
    color: $pink-lavender-color;
    text-transform: none;
  }
}

.trust-badge {
  margin-left: 5px;
  color: $gray-color;
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
}

.token-networks {
  margin: 0 0 10px 18px;
  padding-left: 12px;
  border-left: 2px solid rgba(187, 119, 255, 0.35);
}

.network-row {
  min-height: 52px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto 18px;
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

.zero-children {
  min-height: 40px;
  padding: 8px 0;
  border-top: $default-border;
  color: $gray-color;
  font-size: 0.75rem;
}

.token-actions {
  display: flex;
  gap: 8px;
  padding-top: 10px;
  border-top: $default-border;
}

.token-action {
  flex: 1;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(187, 119, 255, 0.45);
  border-radius: 17px;
  background: $pink-purple-color;
  color: $plain-white;
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 700;

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }

  &:focus-visible {
    outline: 2px solid $plain-white;
    outline-offset: 2px;
  }

  .action-icon {
    width: 16px;
    height: 16px;
  }
}

.chevron {
  color: $gray-color;
}

.row-switch {
  flex: none;
}

// Below the popup's width, amounts move under the name so long numbers and network names never clip.
@media (max-width: 480px) {
  .token-header {
    grid-template-columns: 38px minmax(0, 1fr) 20px;
    gap: 6px 10px;
  }

  .token-icon {
    grid-row: 1 / 3;
  }

  .token-balance {
    grid-column: 2;
    grid-row: 2;
    align-items: flex-start;
    text-align: left;
  }

  .token-header > .chevron {
    grid-column: 3;
    grid-row: 1 / 3;
  }

  .network-row {
    grid-template-columns: 28px minmax(0, 1fr) 18px;
    gap: 4px 8px;
  }

  .network-logo {
    grid-row: 1 / 3;
  }

  .network-balance {
    grid-column: 2;
    grid-row: 2;
    align-items: flex-start;
    text-align: left;
  }

  .network-row > .chevron {
    grid-column: 3;
    grid-row: 1 / 3;
  }

  .token-networks {
    margin-left: 8px;
    padding-left: 10px;
  }
}
</style>
