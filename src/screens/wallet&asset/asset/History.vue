<template>
  <ContentForm :height="284">
    <div class="history">
      <div class="history-settings">
        <div class="history-label">{{ $t('assets.history') }}:</div>

        <Dropdown :value="filterHistoryValue" :options="historyDropdownOption" @handler="filterHistoryValueUpdate" />
      </div>

      <Scroll>
        <div :class="historyContainerClasses">
          <Loader v-if="isLoadingHistory" />

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
import { Getter } from 'vuex-class';
import HistoryItem from './HistoryItem.vue';
import type { FilterHistory, GetHistory, HistoryElement } from '@/interfaces';
import type { GetNetwork, SelectedWallet } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { NetworksController } from '@/controllers';
import BaseApi from '@/util/BaseApi';

@Component({ components: { HistoryItem } })
export default class History extends Vue {
  readonly historyDropdownOption = [
    { label: 'assets.all', value: 'all' },
    { label: 'assets.transfer', value: 'transfer' },
    { label: 'assets.reward', value: 'reward' },
    { label: 'assets.extrinsic', value: 'extrinsic' },
  ];

  filterHistoryValue: FilterHistory = 'all';
  isLoadingHistory = false;

  @Prop(Object) currency!: TokenBalance;
  @Getter(NetworksGettersTypes.getHistory) getHistory!: GetHistory;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

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

    return this.getHistory(this.assetId, this.selectedWallet.address, this.selectedNetwork.toLowerCase())?.nodes ?? [];
  }

  get filteredHistory() {
    if (this.filterHistoryValue === 'all') return this.history;

    const field = this.filterHistoryValue as 'transfer' | 'reward' | 'extrinsic';
    const filteredHistory = this.history.filter((historyItem) => historyItem[field]);

    return filteredHistory;
  }

  @Watch('selectedNetwork')
  @Watch('selectedWallet')
  async watchSelectedNetwork() {
    this.fetchHistory();
  }

  get isMainNetwork() {
    return this.currency.balances?.some(
      ({ name, isUtility, isNative }) =>
        name.toLowerCase() === this.selectedNetwork?.toLowerCase() && (isUtility || isNative)
    );
  }

  @Watch('isMainNetwork')
  watchNetwork() {
    this.fetchHistory();
  }

  mounted() {
    this.fetchHistory();
  }

  get isSubstrateEthereumNetwork() {
    return BaseApi.isSubstrateEthereumNetwork(this.selectedNetwork);
  }

  async fetchHistory() {
    if (this.isLoadingHistory) return;

    if (this.history.length !== 0) return;

    if (!this.isMainNetwork && this.isSubstrateEthereumNetwork) return;

    this.isLoadingHistory = true;

    await NetworksController.fetchHistory(this.selectedNetwork, this.selectedWallet, this.assetId, false, 0.3); // TODO setTimeout, когда будет история для всех сетей токена, также удалить isMainNetwork

    this.isLoadingHistory = false;
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
