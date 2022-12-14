<template>
  <ContentForm :height="306">
    <div class="history">
      <div class="history-settings">
        <div class="history-label">{{ $t('asset.history.text') }}</div>

        <Dropdown :value="filterHistoryValue" :options="historyDropdownOption" :handler="filterHistoryValueUpdate" />
      </div>

      <Scroll>
        <div :class="classes">
          <div v-if="isFetchingHistory">
            <Loader />
          </div>

          <template v-else-if="!isEmptyHistory">
            <HistoryItem
              v-for="historyNode in filteredHistory"
              :key="historyNode.id"
              :historyNode="historyNode"
              :assetId="currency.assetId"
              :relayChain="currency.relayChain"
              @click.native="$emit('openHistoryDetailsForm', historyNode)"
            />
          </template>

          <div v-else>{{ $t('asset.history.noHistory') }}</div>
        </div>
      </Scroll>
    </div>
  </ContentForm>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Action, Getter } from 'vuex-class';
import HistoryItem from './HistoryItem.vue';
import type { FilterHistory, GetHistory, TAction } from '@/interfaces';
import type { LoadHistory, SelectedWallet } from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ActionTypes as NetworksActionsTypes } from '@/store/networks/actions';

import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Currency } from '@/interfaces';
import BaseApi from '@/util/BaseApi';

@Component({
  components: {
    HistoryItem,
  },
})
export default class History extends Vue {
  readonly historyDropdownOption = [
    { label: 'asset.history.all', value: 'all' },
    { label: 'asset.history.transfer', value: 'transfer' },
    { label: 'asset.history.reward', value: 'reward' },
    { label: 'asset.history.extrinsic', value: 'extrinsic' },
  ];
  filterHistoryValue: FilterHistory = 'all';
  isFetchingHistory = false;
  @Prop(Object) currency!: Currency;
  @Getter(NetworksGettersTypes.getHistory) getHistory!: GetHistory;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Action(NetworksActionsTypes.LOAD_HISTORY) loadHistory!: TAction<LoadHistory>;

  get selectedNetwork() {
    return this.$route.params.network;
  }

  get isEmptyHistory() {
    return this.filteredHistory?.length === 0;
  }

  get classes() {
    return [
      'history-content',
      {
        'empty-history': this.isEmptyHistory,
      },
    ];
  }

  get history() {
    const addressByNetwork = BaseApi.getDefaultAddressByNetworkIncludingReplacedAccount(
      this.selectedWallet,
      this.selectedNetwork
    );
    const historyForNetwork = this.getHistory(this.currency?.assetId, addressByNetwork, this.selectedNetwork);
    const historyForWalletAddress = historyForNetwork?.nodes ?? [];

    return historyForWalletAddress;
  }

  get filteredHistory() {
    if (this.filterHistoryValue === 'all') return this.history;

    const field = this.filterHistoryValue as 'transfer' | 'reward' | 'extrinsic';
    const filteredHistory = this.history.filter((historyItem) => historyItem[field] !== null);

    return filteredHistory;
  }

  @Watch('currency')
  async watchCurrency() {
    this.fetchHistory();
  }

  mounted() {
    this.fetchHistory();
  }

  async fetchHistory() {
    this.isFetchingHistory = true;

    await this.loadHistory({
      networkName: this.selectedNetwork,
      walletAddress: this.selectedWallet.address,
      assetId: this.currency.assetId,
      pageSize: 45,
    });

    this.isFetchingHistory = false;
  }

  filterHistoryValueUpdate(name: FilterHistory) {
    this.filterHistoryValue = name;
  }
}
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
