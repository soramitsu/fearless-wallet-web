<template>
  <section class="network-section" :data-network="section.name">
    <button class="network-header" type="button" :aria-expanded="expanded" @click="toggleExpanded">
      <ExternalLogo :name="section.icon" :width="34" class="network-icon" />

      <span class="network-identity">
        <span class="network-title"
          >{{ section.name
          }}<span v-if="section.isTestnet" class="row-badge" data-testid="testnetBadge">{{ t('portfolioPage.testnetBadge') }}</span></span
        >
        <span v-if="syncLabel" class="sync-state">{{ syncLabel }}</span>
      </span>

      <span class="network-value">
        <span v-if="formattedSubtotal">{{ formattedSubtotal }}</span>
      </span>

      <Icon :icon="expanded ? 'down' : 'chevron-right'" className="chevron" :hover="false" />
    </button>

    <div v-if="expanded" class="network-assets">
      <button
        v-for="asset in section.assets"
        :key="asset.key"
        class="asset-row"
        :class="{ 'asset-row--hidden': asset.hidden }"
        type="button"
        :data-asset-key="asset.key"
        @click="openAsset(asset)"
      >
        <ExternalLogo :name="asset.icon" :width="38" class="asset-icon" />

        <span class="asset-identity">
          <span class="asset-symbol">
            {{ asset.symbol }}
            <span v-if="asset.trust !== 'verified'" class="trust-badge">{{ t('portfolioPage.unverified') }}</span>
          </span>
          <span class="asset-name">{{ asset.name || t('portfolioPage.unknownAsset') }}</span>
          <span v-if="asset.hidden" class="asset-badges">
            <span class="row-badge" data-testid="hiddenBadge">{{ t('portfolioPage.hiddenBadge') }}</span>
            <span v-if="asset.preferenceSource === 'legacy305'" class="row-badge legacy" data-testid="hiddenPreviousVersion">
              {{ t('portfolioPage.hiddenPreviousVersion') }}
            </span>
          </span>
        </span>

        <span class="asset-balance">
          <span>{{ formatAmount(asset.balanceText) }} {{ asset.symbol }}</span>
          <span class="asset-fiat">{{ formatFiat(asset.fiatValue) }}</span>
          <span v-if="showsTransferable(asset)" class="asset-transferable" data-testid="transferable">
            {{ t('portfolioPage.transferable', { amount: `${formatAmount(asset.transferableText)} ${asset.symbol}` }) }}
          </span>
        </span>

        <Switcher
          v-if="manage"
          :value="!asset.hidden"
          @click.stop
          @change="setPreference(asset, $event ? 'shown' : 'hidden')"
        />
        <Icon v-else icon="chevron-right" className="asset-chevron" :hover="false" />
      </button>

      <div v-if="section.detectedAssets.length && !manage" class="detected-assets">
        <button class="detected-header" type="button" @click="showDetected = !showDetected">
          <span>{{ tc('portfolioPage.detectedAssets', section.detectedAssets.length, { count: section.detectedAssets.length }) }}</span>
          <Icon :icon="showDetected ? 'down' : 'chevron-right'" :hover="false" />
        </button>

        <div v-if="showDetected" class="detected-list">
          <div v-for="asset in section.detectedAssets" :key="asset.key" class="detected-row">
            <span class="asset-identity">
              <span class="asset-symbol">{{ asset.symbol || t('portfolioPage.unknownAsset') }}</span>
              <span class="asset-name">{{ t('portfolioPage.unverifiedMetadata', { source: sourceLabel(asset.source) }) }}</span>
              <span class="asset-name canonical-id">{{ asset.assetId }}</span>
            </span>
            <span class="detected-balance">{{ formatAmount(asset.balanceText) }}</span>
            <button type="button" class="review-action" @click="setPreference(asset, 'shown')">{{ t('portfolioPage.show') }}</button>
            <button type="button" class="review-action secondary" @click="setPreference(asset, 'hidden')">{{ t('portfolioPage.hide') }}</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AssetPreference, PortfolioAsset, PortfolioNetworkSection } from '@/portfolio/assetIdentity';
import { toggleListEntry } from '@/portfolio/portfolioViewSettings';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';
import { formatDecimalString } from '@/helpers/numbers';
import { formatNetworkSyncFreshness } from '@/portfolio/syncFreshness';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{
  section: PortfolioNetworkSection;
  manage?: boolean;
  /** Keeps a collapsed network open while a search shows its matching rows. */
  forceExpanded?: boolean;
}>();

const router = useRouter();
const { t, tc } = useI18n();
const accountsStore = useAccountsStore();
const showDetected = ref(false);

// Collapse is remembered per wallet, so it survives reopening the popup.
const collapsed = computed(() => accountsStore.portfolioView.collapsedSections.includes(props.section.key));
const expanded = computed(() => props.forceExpanded || !collapsed.value);

function toggleExpanded(): void {
  accountsStore.updatePortfolioView({
    collapsedSections: toggleListEntry(accountsStore.portfolioView.collapsedSections, props.section.key, expanded.value),
  });
}

const formattedSubtotal = computed(() => {
  if (!props.section.hasPricedAssets) return '';
  return `${accountsStore.fiatSymbol}${formatDecimalString(props.section.subtotal, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
});

const syncLabel = computed(() =>
  formatNetworkSyncFreshness(
    {
      coverage: props.section.coverage,
      lastSuccess: props.section.latestTimestamp,
      stale: props.section.stale,
      error: props.section.error,
    },
    { translate: (key, values) => t(key, values) }
  )
);

function formatAmount(value: string): string {
  return formatDecimalString(value, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
    preserveSmallValue: true,
  });
}

function formatFiat(value: string | null): string {
  return value === null
    ? t('portfolioPage.priceUnavailable')
    : `${accountsStore.fiatSymbol}${formatDecimalString(value, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

/** Rows show the total balance; the transferable part is a secondary line when staking or locks hold some of it. */
function showsTransferable(asset: PortfolioAsset): boolean {
  return asset.hasBalance && formatAmount(asset.transferableText) !== formatAmount(asset.balanceText);
}

function sourceLabel(source: PortfolioAsset['source']): string {
  return t(`portfolioPage.source.${source}`);
}

function setPreference(asset: PortfolioAsset, preference: AssetPreference): void {
  accountsStore.setAssetPreference({ key: asset.key, preference });
}

function openAsset(asset: PortfolioAsset): void {
  if (props.manage) return;
  router.push({
    name: Components.AssetHistory,
    params: { assetId: asset.assetId, selectedNetwork: asset.networkName },
  });
}
</script>

<style lang="scss" scoped>
.network-section {
  margin-right: 16px;
  border-bottom: $default-border;
}

.network-header,
.asset-row,
.detected-header {
  width: 100%;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.network-header {
  min-height: 68px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  text-align: left;
}

.network-identity,
.asset-identity,
.network-value,
.asset-balance {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.network-title,
.asset-symbol {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.asset-name,
.asset-fiat {
  margin-top: 4px;
  color: $gray-color;
  font-size: 0.7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-state {
  margin-top: 4px;
  color: $gray-color;
  font-size: 0.75rem;
  overflow-wrap: anywhere;
}

.canonical-id {
  max-width: 150px;
  font-family: monospace;
}

.network-value,
.asset-balance {
  align-items: flex-end;
  text-align: right;
  overflow-wrap: anywhere;
}

.network-assets {
  padding-left: 10px;
}

.asset-row {
  min-height: 64px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto 24px;
  align-items: center;
  gap: 10px;
  padding: 10px 0 10px 8px;
  border-top: $default-border;
  text-align: left;
}

.asset-icon,
.network-icon {
  border-radius: 50%;
}

// Hidden rows are listed in Manage so they can be shown again; dimmed, with the badges at full contrast.
.asset-row--hidden {
  .asset-icon,
  .asset-symbol,
  .asset-name,
  .asset-balance {
    opacity: 0.5;
  }
}

.asset-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
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
  text-transform: uppercase;

  &.legacy {
    color: $pink-lavender-color;
    text-transform: none;
  }
}

.network-title .row-badge {
  margin-left: 6px;
  vertical-align: middle;
}

.asset-transferable {
  margin-top: 2px;
  color: $gray-color;
  font-size: 0.66rem;
}

.trust-badge {
  margin-left: 5px;
  color: $gray-color;
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
}

.detected-assets {
  border-top: $default-border;
}

.detected-header {
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: $pink-lavender-color;
  text-align: left;
}

.detected-list {
  padding-bottom: 8px;
}

.detected-row {
  min-height: 56px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 8px;
  padding: 7px 0 7px 8px;
}

.detected-balance {
  color: $grayish-white;
  font-variant-numeric: tabular-nums;
}

.review-action {
  border: 0;
  border-radius: 14px;
  padding: 6px 9px;
  background: $pink-lavender-color;
  color: #111;
  cursor: pointer;
  font: inherit;
  font-size: 0.68rem;
  font-weight: 700;

  &.secondary {
    background: $default-background-color;
    color: $grayish-white;
  }
}

.chevron,
.asset-chevron {
  color: $gray-color;
}

@media (max-width: 600px) {
  .network-header,
  .asset-row {
    grid-template-columns: 32px minmax(0, 1fr) 20px;
    gap: 6px 10px;
  }
  .network-value,
  .asset-balance {
    grid-column: 2;
    grid-row: 2;
    align-items: flex-start;
    text-align: left;
  }
  .chevron,
  .asset-chevron { grid-column: 3; grid-row: 1 / 3; width: 20px; }
  .network-icon,
  .asset-icon { grid-row: 1 / 3; }
  .asset-name,
  .asset-fiat,
  .asset-transferable {
    font-size: 0.75rem;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .network-assets { padding-left: 0; }
  .asset-row { padding-left: 0; }
}
</style>
