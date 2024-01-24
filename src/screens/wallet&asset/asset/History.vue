<template>
  <ContentForm :height="214">
    <div class="history">
      <div class="history-settings">
        <div class="history-label">{{ $t('assets.history') }}:</div>

        <Dropdown :value="filterHistoryValue" :options="historyDropdownOption" @handler="filterHistoryValueUpdate" />
      </div>

      <Scroll>
        <div :class="historyContainerClasses">
          <Loader v-if="showLoader" />

          <template v-else-if="!isEmptyHistory">
            <HistoryItem
              v-for="(historyElement, index) in filteredHistory"
              :key="index"
              :historyElement="historyElement"
              :token="currency"
              :network="selectedNetwork"
              :address="selectedWallet.address"
              @click.native="openHistoryDetails(historyElement)"
            />
          </template>

          <div v-else>{{ $t('assets.noHistory') }}</div>
        </div>
      </Scroll>
    </div>
  </ContentForm>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import HistoryItem from './HistoryItem.vue';
import type {
  AsyncFn,
  FilterHistory,
  GetHistory,
  HistoryElement,
  SoraHistoryElement,
  SubqueryHistory,
} from '@/interfaces';
import type { FetchHistory, GetNetwork, SelectedWallet } from '@/store';
import type { TokenGroup } from '@extension-base/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import BaseApi from '@/util/BaseApi';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import { getUtilityAsset } from '@/helpers/currencies';
import { isSora } from '@/helpers';

@Component({ components: { HistoryItem } })
export default class History extends Vue {
  filterHistoryValue: FilterHistory = 'all';
  showLoader = false;
  refreshTimeout = 30000;
  @Prop(Object) currency!: TokenGroup;
  @Getter(NetworksGettersTypes.getHistory) getHistory!: GetHistory;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];
  @Action(NetworksActionTypes.FETCH_HISTORY) fetchHistory!: AsyncFn<FetchHistory>;

  get historyDropdownOption() {
    const options = [
      { label: 'assets.all', value: 'all' },
      { label: 'assets.transfer', value: 'transfer' },
      { label: 'assets.reward', value: 'reward' },
    ];

    if (!this.isSora) options.push({ label: 'assets.extrinsic', value: 'extrinsic' });

    return options;
  }

  get selectedNetwork() {
    return this.$route.params.selectedNetwork ?? '';
  }

  get assetId() {
    return this.$route.params.assetId;
  }

  get isEmptyHistory() {
    return this.filteredHistory?.length === 0;
  }

  get historyContainerClasses() {
    return [
      'history-content',
      {
        'empty-history': this.isEmptyHistory,
      },
    ];
  }

  get address() {
    if (BaseApi.isEthereumNetwork(this.selectedNetwork)) return this.selectedWallet.ethereumAddress;

    const network = this.getNetwork(this.selectedNetwork);

    return BaseApi.encodeAddress(this.selectedWallet.address, network.addressPrefix);
  }

  get historyTimestamp() {
    if (!this.history) return Number.MIN_VALUE;

    return this.history.timestamp;
  }

  get history(): SubqueryHistory | undefined {
    if (!this.selectedNetwork)
      return { nodes: [], pageInfo: { endCursor: '0', startCursor: '0' }, timestamp: Number.MIN_VALUE };

    return this.getHistory(this.assetId, this.selectedNetwork.toLowerCase());
  }

  get historyItems(): HistoryElement[] {
    if (!this.history) return [];

    return this.history.nodes;
  }

  get isSora() {
    return isSora(this.selectedNetwork);
  }

  get filteredHistory() {
    if (this.filterHistoryValue === 'all') return this.historyItems;

    const field = this.filterHistoryValue as 'transfer' | 'reward' | 'extrinsic';

    if (this.isSora) {
      const value = field === 'reward' ? 'rewarded' : field;

      const filteredHistory = (this.historyItems as SoraHistoryElement[]).filter((historyItem) => {
        return historyItem.method === value;
      });

      return filteredHistory;
    }

    return this.historyItems.filter((historyItem) => historyItem[field]);
  }

  get isMainNetwork() {
    if (this.selectedNetwork === '' || this.balances.length === 0) return false;

    const { assetId } = getUtilityAsset(this.balances, this.selectedNetwork);

    return this.assetId === assetId;
  }

  get isEthereumNativeNetwork() {
    return BaseApi.isEthereumNativeNetwork(this.selectedNetwork);
  }

  @Watch('selectedNetwork')
  @Watch('selectedWallet')
  @Watch('isMainNetwork')
  async watchSelectedNetwork() {
    this.loadHistory();
  }

  mounted() {
    setTimeout(() => this.loadHistory(), 300); // TODO setTimeout, когда будет история для всех сетей токена, также удалить isMainNetwork
  }

  async loadHistory() {
    if (this.historyTimestamp + this.refreshTimeout > Date.now()) return false;

    if (!this.isSora && !this.isEthereumNativeNetwork && !this.isMainNetwork) return;

    if (this.historyItems.length === 0) this.showLoader = true;

    const options = { networkName: this.selectedNetwork, assetId: this.assetId };

    this.fetchHistory(options).finally(() => {
      this.showLoader = false;
    });
  }

  filterHistoryValueUpdate(name: FilterHistory) {
    this.filterHistoryValue = name;
  }

  openHistoryDetails(history: HistoryElement) {
    this.$emit('openHistoryDetailsForm', history);
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
