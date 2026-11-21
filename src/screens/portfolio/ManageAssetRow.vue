<template>
  <!-- One asset on one network: its switch is the row's only control, and says whether the wallet's list shows it. -->
  <div
    class="manage-row"
    :class="{ 'manage-row--off': !entry.listed }"
    data-testid="manageAssetRow"
    :data-asset-key="asset.key"
    :data-symbol="asset.symbol"
    :data-network="asset.networkName"
    :data-section="section"
  >
    <span class="row-icon" aria-hidden="true">
      <ExternalLogo :name="asset.icon" :width="36" class="row-logo" />
      <ExternalLogo :name="asset.networkIcon" :width="16" class="row-network" />
    </span>

    <span class="row-identity">
      <span class="row-title">
        <span class="row-symbol">{{ asset.symbol || t('portfolioPage.unknownAsset') }}</span>
        <span v-if="asset.trust !== 'verified'" class="row-badge" data-testid="unverifiedBadge">{{ t('portfolioPage.unverified') }}</span>
        <span v-if="asset.isTestnet" class="row-badge" data-testid="testnetBadge">{{ t('portfolioPage.testnetBadge') }}</span>
        <span
          v-if="asset.hidden && asset.preferenceSource === 'legacy305'"
          class="row-badge row-badge--legacy"
          data-testid="hiddenPreviousVersion"
        >
          {{ t('portfolioPage.hiddenPreviousVersion') }}
        </span>
      </span>
      <span class="row-subtitle">
        <span class="row-where" data-testid="manageAssetNetwork">{{ asset.networkName }}</span>
        <span v-if="note" class="row-note" data-testid="manageAssetNote">{{ note }}</span>
      </span>
    </span>

    <!-- What it holds, for an asset that holds something; a balance nobody could load is unknown, never "0". -->
    <span v-if="asset.balanceUnavailable" class="row-balance" data-testid="manageAssetBalance">
      <span class="row-failed">{{ t('portfolioPage.balanceStatus.failed') }}</span>
    </span>
    <span v-else-if="asset.hasBalance" class="row-balance" data-testid="manageAssetBalance">
      <span class="row-amount">{{ formatAmount(asset.balanceText) }} {{ asset.symbol }}</span>
      <span class="row-fiat">{{ formatFiat(asset.fiatValue) }}</span>
    </span>

    <Switcher
      class="row-switch"
      data-testid="manageAssetSwitch"
      :value="entry.listed"
      :ariaLabel="t('walletHome.manage.switchLabel', { symbol: asset.symbol, network: asset.networkName })"
      @change="emit('toggle', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ManageAssetEntry, ManageSection } from '@/portfolio/manageAssets';
import { usePortfolioFormatting } from '@/portfolio/usePortfolioFormatting';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{ entry: ManageAssetEntry; section: ManageSection }>();

const emit = defineEmits<{ (event: 'toggle', listed: boolean): void }>();

const { t } = useI18n();
const { formatAmount, formatFiat } = usePortfolioFormatting();

const asset = computed(() => props.entry.asset);

// Why a row with nothing to show for itself is where it is.
const note = computed(() => {
  if (props.entry.added) return t('walletHome.manage.added');
  if (props.section === 'hidden' && !asset.value.hasBalance && !asset.value.balanceUnavailable) {
    return t('walletHome.manage.noBalance');
  }
  return '';
});
</script>

<style lang="scss" scoped>
.manage-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 4px 0;
  border-top: 1px solid var(--fw-divider);

  &:first-of-type {
    border-top: 0;
  }
}

.row-icon {
  position: relative;
  width: 36px;
  height: 36px;
}

.row-logo {
  border-radius: 50%;
}

.row-network {
  position: absolute;
  right: -3px;
  bottom: -3px;
  border: 2px solid var(--fw-bg-base);
  border-radius: 50%;
  background: var(--fw-bg-base);
}

.row-identity,
.row-balance {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.row-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  min-width: 0;
}

.row-symbol {
  color: var(--fw-text-1);
  font-size: 0.9rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.row-subtitle {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  color: var(--fw-text-2);
  font-size: 0.72rem;
}

.row-where {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-note {
  flex: none;
  color: var(--fw-link);
  font-weight: 600;
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
}

.row-badge--legacy {
  color: $pink-lavender-color;
  text-transform: none;
}

.row-balance {
  align-items: flex-end;
  text-align: right;
  overflow-wrap: anywhere;
}

.row-amount {
  color: var(--fw-text-1);
  font-size: 0.78rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.row-fiat {
  color: var(--fw-text-2);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}

.row-failed {
  color: $simple-orange-color;
  font-size: 0.72rem;
}

// Not in the list: the token reads quieter, the switch keeps full contrast.
.manage-row--off {
  .row-icon,
  .row-identity,
  .row-balance {
    opacity: 0.62;
  }
}

.row-switch {
  flex: none;
}

// The side panel's column: the amount moves under the name, so the name keeps its room.
@media (max-width: 380px) {
  .manage-row {
    grid-template-columns: 32px minmax(0, 1fr) auto;
    gap: 8px;
  }

  .row-icon {
    grid-row: 1 / span 2;
    width: 32px;
    height: 32px;
  }

  .row-balance {
    grid-column: 2;
    grid-row: 2;
    align-items: flex-start;
    text-align: left;
    flex-direction: row;
    gap: 6px;
  }

  .row-switch {
    grid-column: 3;
    grid-row: 1 / span 2;
  }
}
</style>
