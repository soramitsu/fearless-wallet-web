<template>
  <ContentForm :height="306">
    <div class="history">
      <div class="history-settings">
        <div class="history-label">{{ $t('assets.history.text') }}</div>

        <Dropdown :value="filterHistoryValue" :options="historyDropdownOption" :handler="filterHistoryValueUpdate" />
      </div>

      <Scroll>
        <div :class="historyContainerClasses">
          <Loader v-if="showLoader" />

          <template v-else-if="!isEmptyHistory">
            <HistoryItem
              v-for="(historyElement, index) in filteredHistory"
              :key="index"
              :historyElement="historyElement"
              :assetId="currency.assetId"
              @click.native="$emit('openHistoryDetailsForm', historyElement)"
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
import NetworksController from '@/controllers/networksController';

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
  showLoader = false;

  @Prop(Object) currency!: Currency;
  @Getter(NetworksGettersTypes.getHistory) getHistory!: GetHistory;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get selectedNetwork() {
    return this.$route.params.network;
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

  get walletIncludingReplacedAccount() {
    return BaseApi.getWalletIncludingReplacedAccount(this.selectedWallet, this.selectedNetwork);
  }

  get history() {
    const { address } = this.walletIncludingReplacedAccount;

    return this.getHistory(this.currency?.assetId, address, this.selectedNetwork)?.nodes ?? [];
  }

  get filteredHistory() {
    if (this.filterHistoryValue === 'all') return this.history;

    const field = this.filterHistoryValue as 'transfer' | 'reward' | 'extrinsic';
    const filteredHistory = this.history.filter((historyItem) => historyItem[field] !== null);

    return filteredHistory;
  }

  @Watch('selectedNetwork')
  @Watch('selectedWallet')
  @Watch('currency')
  async watchSelectedNetwork() {
    this.fetchHistory();
  }

  mounted() {
    this.fetchHistory();
  }

  async fetchHistory() {
    if (!this.currency?.assetId || this.history.length !== 0 || !this.currency.isUtility(this.selectedNetwork)) return;

    this.showLoader = true;

    await NetworksController.fetchHistory(
      this.selectedNetwork,
      this.walletIncludingReplacedAccount,
      this.currency.assetId
    );

    this.showLoader = false;
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
