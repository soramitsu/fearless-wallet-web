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
import type { AsyncFn, FilterHistory, GetHistory, HistoryElement } from '@/interfaces';
import type { FetchHistory, GetNetwork, SelectedWallet } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import BaseApi from '@/util/BaseApi';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import { getUtilityAsset } from '@/helpers/currencies';
import { isSora } from '@/helpers';

@Component({ components: { HistoryItem } })
export default class History extends Vue {
  readonly historyDropdownOption = [
    { label: 'assets.all', value: 'all' },
    { label: 'assets.transfer', value: 'transfer' },
    { label: 'assets.reward', value: 'reward' },
    { label: 'assets.extrinsic', value: 'extrinsic' },
  ];

  filterHistoryValue: FilterHistory = 'all';
  showLoader = false;

  @Prop(Object) currency!: TokenBalance;
  @Getter(NetworksGettersTypes.getHistory) getHistory!: GetHistory;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Action(NetworksActionTypes.FETCH_HISTORY) fetchHistory!: AsyncFn<FetchHistory>;

  get selectedNetwork() {
    return this.$route.params.selectedNetwork;
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

  get history() {
    if (!this.selectedNetwork) return [];

    return this.getHistory(this.assetId, this.selectedNetwork.toLowerCase())?.nodes ?? [];
  }

  get filteredHistory() {
    if (this.filterHistoryValue === 'all') return this.history;

    const field = this.filterHistoryValue as 'transfer' | 'reward' | 'extrinsic';
    const filteredHistory = this.history.filter((historyItem) => historyItem[field]);

    return filteredHistory;
  }

  get isMainNetwork() {
    if (this.balances.length === 0) return false;

    const { assetId } = getUtilityAsset(this.balances, this.selectedNetwork);

    return this.assetId === assetId;
  }

  get isEthereumNativeNetwork() {
    return BaseApi.isEthereumNativeNetwork(this.selectedNetwork);
  }

  @Watch('selectedNetwork')
  @Watch('selectedWallet')
  async watchSelectedNetwork() {
    this.loadHistory();
  }

  @Watch('isMainNetwork')
  watchNetwork() {
    this.loadHistory();
  }

  mounted() {
    setTimeout(() => this.loadHistory(), 300); // TODO setTimeout, когда будет история для всех сетей токена, также удалить isMainNetwork
  }

  async loadHistory() {
    if (this.history.length !== 0) return;

    if (!isSora(this.selectedNetwork) && !this.isEthereumNativeNetwork && !this.isMainNetwork) return;

    this.showLoader = true;

    await this.fetchHistory({
      networkName: this.selectedNetwork,
      assetId: this.assetId,
    });

    this.showLoader = false;
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
