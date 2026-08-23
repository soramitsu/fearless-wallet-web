<template>
  <Scroll class="portfolio-scroll">
    <div class="portfolio-actions">
      <span v-if="refreshError" class="refresh-error" role="status">{{ refreshError }}</span>
      <button
        class="portfolio-refresh"
        data-testid="portfolioRefresh"
        type="button"
        :disabled="refreshing"
        :aria-busy="refreshing"
        @click="refreshPortfolio"
      >
        {{ refreshing ? 'Syncing' : 'Refresh' }}
      </button>
    </div>

    <Loader v-if="showLoader" class="asset-loader" />

    <div v-else-if="showEmptyState" class="portfolio-empty" data-testid="infoText">
      <Icon icon="wallet" className="empty-icon" :hover="false" />
      <strong>{{ emptyTitle }}</strong>
      <span>{{ emptyDescription }}</span>
    </div>

    <div v-else class="network-list" data-testid="portfolioNetworkList">
      <PortfolioNetworkSection
        v-for="section in filteredSections"
        :key="section.key"
        :section="section"
        :manage="showAssetsManagementForm"
        :search="filterValue"
      />
    </div>
  </Scroll>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import PortfolioNetworkSection from './PortfolioNetworkSection.vue';
import type { NetworkJson } from '@extension-base/types';
import {
  buildAssetPreferenceSnapshot,
  buildPortfolioSections,
  type PortfolioNetworkSection as PortfolioSection,
} from '@/portfolio/assetIdentity';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { isSameString } from '@/helpers';
import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { useExtensionStore } from '@/stores/extension';
import { forceAssetDiscoverySweep } from '@/extension/messaging/asset-discovery';
import { fetchNfts } from '@/extension/messaging/nfts';

export default defineComponent({
  name: 'Currencies',
  components: { PortfolioNetworkSection },
  props: {
    balances: Array,
    filterValue: String,
    showAssetsManagementForm: Boolean,
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      extensionStore: useExtensionStore(),
      refreshing: false,
      refreshError: '',
    };
  },
  computed: {
    showLoader() {
      return this.accountsStore.isBalanceLoading;
    },
    portfolioSections(): PortfolioSection[] {
      return buildPortfolioSections({
        groups: this.accountsStore.balances,
        networks: this.networksStore.allNetworks,
        prices: this.networksStore.assetsPrice.tokenPriceMap,
        preferences: this.accountsStore.assetPreferences,
        scanStates: this.accountsStore.networkScanStates,
        surfaceDiscoveredAssets:
          (this.extensionStore.features?.assetDiscoveryMode ??
            this.extensionStore.features?.portfolio?.assetDiscoveryMode ??
            'shadow') === 'visible',
        addressForNetwork: this.addressForNetwork,
      });
    },
    filteredSections(): PortfolioSection[] {
      const selected = this.accountsStore.selectedNetwork;
      const search = this.filterValue?.trim().toLowerCase() ?? '';
      let sections = this.portfolioSections;

      if (selected === POPULAR_NETWORKS) {
        sections = sections.filter((section) => this.networksStore.getNetwork(section.chainId)?.rank !== undefined);
      } else if (selected === FAVORITE_NETWORKS) {
        sections = sections.filter((section) =>
          this.networksStore.getNetwork(section.chainId)?.favorite.includes(this.accountsStore.selectedWallet.address)
        );
      } else if (!isSameString(selected, ALL_NETWORKS)) {
        sections = sections.filter((section) => isSameString(section.name, selected));
      }

      if (!search) return sections;
      return sections.filter(
        (section) =>
          section.name.toLowerCase().includes(search) ||
          [...section.assets, ...section.detectedAssets].some((asset) =>
            `${asset.symbol} ${asset.name}`.toLowerCase().includes(search)
          )
      );
    },
    showEmptyState() {
      return !this.showLoader && this.filteredSections.length === 0;
    },
    emptyTitle() {
      if (!navigator.onLine) return 'Portfolio is offline';
      if (this.filterValue?.trim()) return 'No matching assets';
      return 'No assets detected yet';
    },
    emptyDescription() {
      if (!navigator.onLine) return 'Last known balances will return when this device reconnects.';
      if (this.filterValue?.trim()) return 'Try another asset or network name.';
      return 'Fearless scans supported networks independently from this display filter.';
    },
    preferenceMigrationAssets() {
      return buildAssetPreferenceSnapshot(this.accountsStore.balances, this.networksStore.allNetworks).map(
        ({ key, groupId }) => ({ key, groupId })
      );
    },
    preferenceMigrationReady() {
      return (
        !this.accountsStore.isBalanceLoading &&
        this.networksStore.allNetworks.length > 0 &&
        this.accountsStore.balances.length > 0
      );
    },
  },
  watch: {
    preferenceMigrationReady: {
      handler(ready) {
        if (ready) {
          this.accountsStore.migrateLegacyAssetPreferences({
            assets: this.preferenceMigrationAssets,
            complete: true,
          });
        }
      },
      immediate: true,
    },
  },
  methods: {
    async refreshPortfolio() {
      if (this.refreshing) return;

      this.refreshing = true;
      this.refreshError = '';

      try {
        const refreshes: Promise<unknown>[] = [forceAssetDiscoverySweep()];
        const ethereumAddress = this.accountsStore.selectedWallet.ethereumAddress;

        if (ethereumAddress) refreshes.push(fetchNfts(ethereumAddress));

        await Promise.all(refreshes);
      } catch {
        this.refreshError = 'Sync could not complete. Last known balances are still shown.';
      } finally {
        this.refreshing = false;
      }
    },
    addressForNetwork(network: NetworkJson): string {
      try {
        return BaseApi.formatAddress(this.accountsStore.selectedWallet, network.name);
      } catch {
        return this.accountsStore.selectedWallet.address;
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.portfolio-scroll {
  margin-right: -16px;
}

.network-list {
  min-height: 100%;
}

.portfolio-actions {
  min-height: 28px;
  padding: 0 16px 4px 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.portfolio-refresh {
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: $pink-color;
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;

  &:disabled {
    cursor: default;
    opacity: 0.55;
  }
}

.refresh-error {
  color: $gray-color;
  font-size: 0.68rem;
  line-height: 1.2;
  text-align: right;
}

.portfolio-empty,
.asset-loader {
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.portfolio-empty {
  flex-direction: column;
  gap: 10px;
  padding-right: 16px;
  color: $gray-color;
  text-align: center;

  strong {
    color: $plain-white;
  }

  span {
    max-width: 290px;
    font-size: 0.78rem;
    line-height: 1.35;
  }
}

.empty-icon {
  width: 34px;
  height: 34px;
  color: $gray-color;
}
</style>
