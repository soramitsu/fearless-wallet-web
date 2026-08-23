<template>
  <section class="network-section" :data-network="section.name">
    <button class="network-header" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <ExternalLogo :name="section.icon" :width="34" class="network-icon" />

      <span class="network-identity">
        <span class="network-title">{{ section.name }}</span>
        <span class="network-meta">{{ ecosystemLabel }} · {{ shortAddress }}</span>
      </span>

      <span class="network-value">
        <span>{{ formattedSubtotal }}</span>
        <span class="sync-state">{{ syncLabel }}</span>
      </span>

      <Icon :icon="expanded ? 'down' : 'chevron-right'" className="chevron" :hover="false" />
    </button>

    <div v-if="expanded" class="network-assets">
      <button
        v-for="asset in visibleAssets"
        :key="asset.key"
        class="asset-row"
        type="button"
        @click="openAsset(asset)"
      >
        <ExternalLogo :name="asset.icon" :width="38" class="asset-icon" />

        <span class="asset-identity">
          <span class="asset-symbol">
            {{ asset.symbol }}
            <span v-if="asset.trust !== 'verified'" class="trust-badge">Unverified</span>
          </span>
          <span class="asset-name">{{ asset.name }}</span>
        </span>

        <span class="asset-balance">
          <span>{{ formatAmount(asset.balanceText) }} {{ asset.symbol }}</span>
          <span class="asset-fiat">{{ formatFiat(asset.fiatValue) }}</span>
        </span>

        <Switcher
          v-if="manage"
          :value="asset.preference !== 'hidden'"
          @click.stop
          @change="setPreference(asset, $event ? 'shown' : 'hidden')"
        />
        <Icon v-else icon="chevron-right" className="asset-chevron" :hover="false" />
      </button>

      <div v-if="section.detectedAssets.length && !manage" class="detected-assets">
        <button class="detected-header" type="button" @click="showDetected = !showDetected">
          <span>Detected assets ({{ section.detectedAssets.length }})</span>
          <Icon :icon="showDetected ? 'down' : 'chevron-right'" :hover="false" />
        </button>

        <div v-if="showDetected" class="detected-list">
          <div v-for="asset in section.detectedAssets" :key="asset.key" class="detected-row">
            <span class="asset-identity">
              <span class="asset-symbol">{{ asset.symbol || 'Unknown asset' }}</span>
              <span class="asset-name">Unverified {{ asset.source }} metadata</span>
              <span class="asset-name canonical-id">{{ asset.assetId }}</span>
            </span>
            <span class="detected-balance">{{ formatAmount(asset.balanceText) }}</span>
            <button type="button" class="review-action" @click="setPreference(asset, 'shown')">Show</button>
            <button type="button" class="review-action secondary" @click="setPreference(asset, 'hidden')">Hide</button>
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
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';
import { formatDecimalString } from '@/helpers/numbers';
import { formatNetworkSyncFreshness } from '@/portfolio/syncFreshness';

const props = defineProps<{
  section: PortfolioNetworkSection;
  manage?: boolean;
  search?: string;
}>();

const router = useRouter();
const accountsStore = useAccountsStore();
const expanded = ref(true);
const showDetected = ref(false);

const ecosystemLabel = computed(() => {
  const value = props.section.ecosystem;
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'Unknown network';
});

const shortAddress = computed(() => {
  const value = props.section.address;
  if (!value) return 'No account';
  if (value.length < 15) return value;
  return `${value.slice(0, 6)}…${value.slice(-5)}`;
});

const formattedSubtotal = computed(() => {
  if (!props.section.hasPricedAssets) return 'Price unavailable';
  return `${accountsStore.fiatSymbol}${formatDecimalString(props.section.subtotal, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
});

const syncLabel = computed(() =>
  formatNetworkSyncFreshness({
    coverage: props.section.coverage,
    lastSuccess: props.section.latestTimestamp,
    stale: props.section.stale,
    error: props.section.error,
  })
);

const visibleAssets = computed(() => {
  const search = props.search?.trim().toLowerCase() ?? '';
  const assets = props.manage
    ? [...props.section.assets, ...props.section.detectedAssets]
    : props.section.assets;
  if (!search) return assets;
  return assets.filter((asset) => `${asset.symbol} ${asset.name}`.toLowerCase().includes(search));
});

function formatAmount(value: string): string {
  return formatDecimalString(value, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
    preserveSmallValue: true,
  });
}

function formatFiat(value: string | null): string {
  return value === null
    ? 'Price unavailable'
    : `${accountsStore.fiatSymbol}${formatDecimalString(value, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
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
}

.network-meta,
.sync-state,
.asset-name,
.asset-fiat {
  margin-top: 4px;
  color: $gray-color;
  font-size: 0.7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canonical-id {
  max-width: 150px;
  font-family: monospace;
}

.network-value,
.asset-balance {
  align-items: flex-end;
  text-align: right;
  white-space: nowrap;
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
</style>
