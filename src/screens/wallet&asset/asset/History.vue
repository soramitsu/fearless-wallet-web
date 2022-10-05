<template>
  <ContentForm :height="306">
    <div class="history">
      <div class="history-settings">
        <div class="history-label">History</div>

        <Dropdown :value="filterHistoryValue" :options="historyDropdownOption" :handler="filterHistoryValueUpdate" />
      </div>

      <Scroll>
        <div :class="classes">
          <template>
            <HistoryItem
              v-for="historyNode in filteredHistory"
              :key="historyNode.id"
              :historyNode="historyNode"
              :assetId="currency.assetId"
              :relayChain="currency.relayChain"
              @click.native="$emit('openHistoryDetailsPopup', historyNode)"
            />
          </template>

          <div v-if="isEmptyHistory">Will appear here history</div>
        </div>
      </Scroll>
    </div>
  </ContentForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import HistoryItem from './HistoryItem.vue';
import type { FilterHistory } from '@/interfaces/common';
import type { GetHistory } from '@/interfaces/history';
import Scroll from '@/components/Scroll.vue';
import Dropdown from '@/components/Dropdown.vue';
import ContentForm from '@/components/ContentForm.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Currency } from '@/interfaces/currencies';
import BaseApi from '@/util/BaseApi';

@Component({
  components: {
    Scroll,
    Dropdown,
    HistoryItem,
    ContentForm,
  },
})
export default class History extends Vue {
  readonly historyDropdownOption = [
    { label: 'All', value: 'all' },
    { label: 'Transfer', value: 'transfer' },
    { label: 'Reward', value: 'reward' },
    { label: 'Extrinsic', value: 'extrinsic' },
  ];
  filterHistoryValue: FilterHistory = 'all';

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
