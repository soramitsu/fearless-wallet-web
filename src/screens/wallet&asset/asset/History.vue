<template>
  <ContentForm :height="contentFormHeight">
    <div class="history">
      <div class="history-settings">
        <div class="history-label">{{ $t('assets.history') }}:</div>

        <Dropdown
          v-if="!isTonWallet"
          :value="filterHistoryValue"
          :options="historyDropdownOption"
          data-testid="historyFilter"
          @handler="filterHistoryValueUpdate"
        />
      </div>

      <Scroll>
        <div :class="historyContainerClasses">
          <Loader v-if="showLoader" />

          <div v-else-if="isEmptyHistory" data-testid="noHistory">{{ $t('assets.noHistory') }}</div>

          <template v-else>
            <HistoryItem
              v-for="(historyElement, index) in filteredHistory"
              :key="index"
              :historyElement="historyElement"
              :token="currency"
              :network="selectedNetwork"
              :address="accountsStore.selectedWallet.address"
              data-testid="historyItem"
              @click="openHistoryDetails(historyElement)"
            />
          </template>
        </div>
      </Scroll>
    </div>
  </ContentForm>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import HistoryItem from './HistoryItem.vue';
import type { FilterHistory, HistoryElement, SoraHistoryElement } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { getUtilityAsset } from '@/helpers/currencies';
import { isSora } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { MENU_HEIGHT } from '@/screens/main/Menu.vue';

export default defineComponent({ name: 'History', components: { HistoryItem } ,
  props: {
    currency: Object,
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      filterHistoryValue: 'all',
      showLoader: false,
      refreshTimeout: 30000,
    };
  },
  computed: {
    historyDropdownOption() {
      const options = [
            { label: 'assets.all', value: 'all' },
            { label: 'assets.transfer', value: 'transfer' },
            { label: 'assets.reward', value: 'reward' },
          ];

          if (!this.isSora) options.push({ label: 'assets.extrinsic', value: 'extrinsic' });

          return options;
    },
    contentFormHeight() {
      return this.isTonWallet ? 209 + MENU_HEIGHT : 209;
    },
    selectedNetwork() {
      return this.$route.params.selectedNetwork ?? '';
    },
    assetId() {
      return this.$route.params.assetId;
    },
    isEmptyHistory() {
      return this.filteredHistory?.length === 0;
    },
    historyContainerClasses() {
      return [
            'history-content',
            {
              'empty-history': this.isEmptyHistory,
            },
          ];
    },
    address() {
      if (BaseApi.isEthereumNetwork(this.selectedNetwork)) return this.accountsStore.selectedWallet.ethereumAddress;

          const network = this.networksStore.getNetwork(this.selectedNetwork);

          return BaseApi.encodeAddress(this.accountsStore.selectedWallet.address, network.addressPrefix);
    },
    historyTimestamp() {
      if (!this.history) return Number.MIN_VALUE;

          return this.history.timestamp;
    },
    history() {
      if (!this.selectedNetwork)
            return { nodes: [], pageInfo: { endCursor: '0', startCursor: '0' }, timestamp: Number.MIN_VALUE };

          return this.networksStore.getHistory(this.assetId, this.selectedNetwork.toLowerCase());
    },
    historyItems() {
      if (!this.history) return [];

          return this.history.nodes;
    },
    isSora() {
      return isSora(this.selectedNetwork);
    },
    isTonWallet() {
      return this.accountsStore.selectedWallet.isTon;
    },
    filteredHistory() {
      if (this.filterHistoryValue === 'all') return this.historyItems;

          const field = this.filterHistoryValue as 'transfer' | 'reward';

          if (this.isSora) {
            const value = field === 'reward' ? 'rewarded' : field;

            const filteredHistory = (this.historyItems as unknown as SoraHistoryElement[]).filter((historyItem) => {
              return historyItem.method === value;
            });

            return filteredHistory;
          }

          return this.historyItems.filter((historyItem) => historyItem[field]);
    },
    isMainNetwork() {
      if (this.selectedNetwork === '' || this.accountsStore.balances.length === 0) return false;

          const { groupId } = getUtilityAsset(this.accountsStore.balances, this.selectedNetwork);

          return this.assetId === groupId;
    },
    isEthereumNativeNetwork() {
      return BaseApi.isEthereumNativeNetwork(this.selectedNetwork);
    },
  },
  watch: {
    "selectedNetwork": 'watchSelectedNetwork',
    "selectedWallet": 'watchSelectedNetwork',
    "isMainNetwork": 'watchSelectedNetwork',
  },
  mounted() {
    setTimeout(() => this.loadHistory(), 300); // TODO setTimeout, когда будет история для всех сетей токена, также удалить isMainNetwork
  },
  methods: {
    async watchSelectedNetwork() {
      this.loadHistory();
    },
    async loadHistory() {
      if (this.historyTimestamp + this.refreshTimeout > Date.now()) return false;

          if (!this.isSora && !this.isTonWallet && !this.isEthereumNativeNetwork && !this.isMainNetwork) return;

          if (this.historyItems.length === 0) this.showLoader = true;

          const options = { networkName: this.selectedNetwork, assetId: this.assetId };

          this.networksStore.fetchHistory(options).finally(() => {
            this.showLoader = false;
          });
    },
    filterHistoryValueUpdate(name: FilterHistory) {
      this.filterHistoryValue = name;
    },
    openHistoryDetails(history: HistoryElement) {
      this.$emit('openHistoryDetailsForm', history);
    },
  },
});
</script>

<style lang="scss" scoped>
.history {
  height: 100%;
  display: flex;
  flex-direction: column;

  .history-settings {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 11px $default-padding 5px 18px;

    .history-label {
      font-weight: 600;
    }
  }

  .history-content {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .empty-history {
    align-items: center;
    justify-content: center;
    margin-top: -26px;
  }
}
</style>
