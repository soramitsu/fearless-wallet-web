<template>
  <div class="asset">
    <AssetInfo :currency="currentCurrency" :price="assetPrice" />

    <div v-if="legacyCrowdloanEvidence.hasEvidence" class="legacy-crowdloan" data-testid="legacyCrowdloan">
      <div>
        <div class="legacy-crowdloan__title">{{ $t('assets.legacyCrowdloan') }}</div>
        <div class="legacy-crowdloan__detail">{{ legacyCrowdloanDetail }}</div>
      </div>

      <div class="legacy-crowdloan__network">{{ selectedNetworkAsset.name }}</div>
    </div>

    <router-view
      :currency="currentCurrency"
      @openHistoryDetailsForm="openHistoryDetailsForm"
      @toggleVisible="toggleVisible"
    >
    </router-view>

    <HistoryDetailsForm
      v-if="showHistoryDetailsForm"
      :historyElement="historyElement"
      :assetId="selectedAssetId"
      :selectedNetwork="selectedLocalNetwork"
      @handlerClose="closeHistoryDetailsForm"
    />

    <BuyPopup
      v-if="showBuyPopup"
      :asset="selectedAssetUpper"
      :address="displayAddressByNetwork"
      :providers="providers"
      @closePopup="toggleVisible(false)"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import type { HistoryElement } from '@/interfaces/history';
import HistoryDetailsForm from '@/screens/wallet&asset/asset/HistoryDetailsForm.vue';
import NetworkManagementButton from '@/screens/main/NetworkManagementButton.vue';
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
import AssetInfo from '@/screens/wallet&asset/asset/AssetInfo.vue';
import NetworkManagement from '@/screens/wallet&asset/NetworkManagement.vue';
import BuyPopup from '@/screens/wallet&asset/BuyPopup.vue';
import BaseApi from '@/util/BaseApi';
import { NETWORKS_GROUPS } from '@/consts/networks';
import { isNetworkGroup } from '@/helpers/common/index';
import { IS_POPUP } from '@/consts/globalClient';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import {
  getLegacyCrowdloanEvidence,
  isLegacyCrowdloanAssetContext,
  type LegacyCrowdloanAssetContext,
} from '@/portfolio/legacyCrowdloan';
import { getCanonicalAssetId } from '@/portfolio/assetIdentity';

export default defineComponent({
  name: 'Asset',
  components: {
    AssetInfo,
    SendForm,
    BuyPopup,
    ReceiveForm,
    HistoryDetailsForm,
    NetworkManagementButton,
    NetworkManagement,
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      historyElement: null,
      showBuyPopup: false,
      showTipPopup: false,
      filterValue: '',
    };
  },
  computed: {
    showHistoryDetailsForm() {
      return this.historyElement !== null;
    },
    isGroupIcon() {
      return isNetworkGroup(this.accountsStore.selectedNetwork);
    },
    selectedNetworkIcon() {
      if (this.isGroupIcon) return 'all-networks';

      return this.networksStore.getNetwork(this.accountsStore.selectedNetwork).icon;
    },
    selectedLocalNetwork() {
      return this.$route.params.selectedNetwork ?? '';
    },
    isHistoryPage() {
      if (!NETWORKS_GROUPS.includes(this.accountsStore.selectedNetwork)) return false;

      return this.selectedLocalNetwork === '';
    },
    providers() {
      return this.currentCurrency.providers ?? [];
    },
    mainNetwork() {
      const currency = this.currentCurrency.balances?.find((network) => network.isUtility || network.isNative);

      return currency ? currency.name : '';
    },
    currentCurrency() {
      return (
        this.accountsStore.balances.find(({ balances, groupId }) =>
          balances.some(
            (balance) =>
              (groupId === this.selectedAssetId ||
                balance.id === this.selectedAssetId ||
                getCanonicalAssetId(balance) === this.selectedAssetId) &&
              (!this.selectedLocalNetwork ||
                balance.name.toLowerCase() === String(this.selectedLocalNetwork).toLowerCase())
          )
        )! ?? {}
      );
    },
    selectedNetworkAsset() {
      return (
        this.currentCurrency.balances?.find(
          (balance) =>
            (this.currentCurrency.groupId === this.selectedAssetId ||
              balance.id === this.selectedAssetId ||
              getCanonicalAssetId(balance) === this.selectedAssetId) &&
            balance.name.toLowerCase() === String(this.selectedLocalNetwork).toLowerCase()
        ) ?? {}
      );
    },
    legacyCrowdloanContext(): LegacyCrowdloanAssetContext {
      const networkAsset = this.selectedNetworkAsset;
      const utilityAsset = this.accountsStore.balances
        .flatMap(({ balances }) => balances)
        .find(
          ({ name, isNative, isUtility }) =>
            (isUtility || isNative) && name.toLowerCase() === String(this.selectedLocalNetwork).toLowerCase()
        );

      return {
        networkName: networkAsset.name ?? String(this.selectedLocalNetwork),
        assetId: networkAsset.id ? getCanonicalAssetId(networkAsset) : '',
        utilityAssetId: utilityAsset ? getCanonicalAssetId(utilityAsset) : '',
        isNative: networkAsset.isNative === true,
        isUtility: networkAsset.isUtility === true,
        walletAddress: this.accountsStore.selectedWallet.address ?? '',
      };
    },
    legacyCrowdloanContextKey() {
      if (!isLegacyCrowdloanAssetContext(this.legacyCrowdloanContext)) return '';

      const context = this.legacyCrowdloanContext;

      return `${context.networkName.toLowerCase()}:${context.assetId}:${context.walletAddress}`;
    },
    legacyCrowdloanHistory() {
      if (!this.legacyCrowdloanContextKey) return [];

      return (
        this.networksStore.getHistory(
          this.legacyCrowdloanContext.assetId,
          this.legacyCrowdloanContext.networkName.toLowerCase()
        )?.nodes ?? []
      );
    },
    legacyCrowdloanEvidence() {
      return getLegacyCrowdloanEvidence(this.legacyCrowdloanContext, this.legacyCrowdloanHistory);
    },
    legacyCrowdloanDetail() {
      const { contributionCount, recoveryCount } = this.legacyCrowdloanEvidence;

      if (contributionCount > 0 && recoveryCount > 0) {
        return this.$t('assets.legacyCrowdloanContributionAndRecovery', { contributionCount, recoveryCount });
      }
      if (contributionCount > 0) {
        return this.$t('assets.legacyCrowdloanContribution', { count: contributionCount });
      }

      return this.$t('assets.legacyCrowdloanRecovery', { count: recoveryCount });
    },
    displayAddressByNetwork() {
      if (this.isHistoryPage) return BaseApi.formatAddress(this.accountsStore.selectedWallet, this.mainNetwork);

      return BaseApi.formatAddress(this.accountsStore.selectedWallet, this.selectedLocalNetwork);
    },
    selectedAssetId() {
      return this.$route.params.assetId ?? '';
    },
    selectedAsset() {
      return this.currentCurrency.symbol?.toLowerCase() ?? '';
    },
    iconPosition() {
      return `top: 24px; right:${IS_POPUP ? '67px' : '131px'};`;
    },
    selectedAssetUpper() {
      return this.selectedAsset.toUpperCase();
    },
    assetPrice() {
      return this.networksStore.getAssetPrice(this.currentCurrency.priceId ?? '');
    },
  },
  watch: {
    legacyCrowdloanContextKey: {
      handler: 'loadLegacyCrowdloanEvidence',
      immediate: true,
    },
  },
  methods: {
    loadLegacyCrowdloanEvidence() {
      if (!this.legacyCrowdloanContextKey) return;

      void this.networksStore
        .fetchHistory({
          networkName: this.legacyCrowdloanContext.networkName,
          assetId: this.legacyCrowdloanContext.assetId,
        })
        .catch(() => undefined);
    },
    toggleVisible(value = true) {
      this.showBuyPopup = value;
    },
    handlerFilter(value: string) {
      this.filterValue = value;
    },
    openHistoryDetailsForm(historyElement: HistoryElement) {
      this.historyElement = historyElement;
    },
    closeHistoryDetailsForm() {
      this.historyElement = null;
    },
  },
});
</script>

<style lang="scss" scoped>
.asset {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  height: 450px;

  .legacy-crowdloan {
    min-height: 48px;
    padding: 8px 14px;
    border: 1px solid rgba($gray-color, 0.28);
    border-radius: 12px;
    background: $secondary-background-color;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    &__title {
      color: $default-white;
      font-size: 0.875rem;
      font-weight: 600;
    }

    &__detail,
    &__network {
      color: $gray-color;
      font-size: 0.6875rem;
    }

    &__network {
      flex-shrink: 0;
    }
  }

  .popup-tip {
    position: absolute;
    display: flex;
    flex-flow: column;
    align-items: flex-end;
    height: 100px;
    width: 100%;
    gap: 10px;

    .controls {
      display: flex;
      flex-flow: row nowrap;
      align-items: center;
      gap: 15px;
    }

    .background-ellipse {
      display: flex;
      align-items: center;
      height: 32px;
      padding: 12px;
      font-size: 0.75rem;
      line-height: 18px;
      border-radius: 20px;
      background-color: $default-background-color;
      user-select: none;
    }

    .popup-tip__message {
      width: 260px;
    }

    .popup__button-width {
      width: 42px;
    }

    .icon-arrow-tip {
      display: flex;
      flex-flow: column;
      width: 100%;
      align-items: flex-end;
      padding-right: 60px;
      gap: 20px;
    }

    .icon__close {
      height: 18px;
      width: 18px;
    }
  }
}
</style>
