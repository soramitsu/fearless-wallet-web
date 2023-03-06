<template>
  <ContentForm :height="306">
    <div class="history">
      <div class="history-settings">
        <div class="history-label">{{ $t('assets.history.text') }}</div>

        <Dropdown :value="filterHistoryValue" :options="historyDropdownOption" :handler="filterHistoryValueUpdate" />
      </div>

      <Scroll>
        <div :class="classes">
          <Loader v-if="isFetchingHistory" />

          <template v-else-if="!isEmptyHistory">
            <HistoryItem
              v-for="(historyNode, index) in filteredHistory"
              :key="index"
              :historyNode="historyNode"
              :assetId="currency.assetId"
              @click.native="$emit('openHistoryDetailsForm', historyNode)"
            />
          </template>

          <div v-else>{{ $t('assets.history.noHistory') }}</div>
        </div>
      </Scroll>
    </div>
  </ContentForm>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import HistoryItem from './HistoryItem.vue';
import type { FilterHistory, GetHistory } from '@/interfaces';
import type { SelectedWallet } from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Currency } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import networksController from '@/controllers/networksController';

@Component({
  components: { HistoryItem },
})
export default class History extends Vue {
  readonly historyDropdownOption = [
    { label: 'assets.history.all', value: 'all' },
    { label: 'assets.history.transfer', value: 'transfer' },
    { label: 'assets.history.reward', value: 'reward' },
    { label: 'assets.history.extrinsic', value: 'extrinsic' },
  ];
  filterHistoryValue: FilterHistory = 'all';
  isFetchingHistory = false;
  @Prop(Object) currency!: Currency;
  @Getter(NetworksGettersTypes.getHistory) getHistory!: GetHistory;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

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
    const historyForWalletAddress = this.historyForNetwork?.nodes ?? [];

    return historyForWalletAddress;
  }

  get filteredHistory() {
    if (this.filterHistoryValue === 'all') return this.history;

    const field = this.filterHistoryValue as 'transfer' | 'reward' | 'extrinsic';
    const filteredHistory = this.history.filter((historyItem) => historyItem[field] !== null);

    return filteredHistory;
  }

  get historyForNetwork() {
    const addressByNetwork = BaseApi.getDefaultAddressByNetworkIncludingReplacedAccount(
      this.selectedWallet,
      this.selectedNetwork
    );

    return this.getHistory(this.currency?.assetId, addressByNetwork, this.selectedNetwork);
  }

  @Watch('currency')
  async watchCurrency() {
    if (this.currency?.assetId) this.fetchHistory();
  }

  mounted() {
    if (this.currency?.assetId) this.fetchHistory();
  }

  async fetchHistory() {
    this.isFetchingHistory = true;
    const delay = this.historyForNetwork ? 45 : 0;

    await networksController.loadHistory(
      this.selectedNetwork,
      this.selectedWallet.address,
      this.currency.assetId,
      delay
    );

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
