<template>
  <div class="history-book">
    <div class="label">
      {{ $t('assets.recent') }}
    </div>

    <div v-for="address in historyAddresses" :key="address" class="transaction" @click="$emit('setRecipient', address)">
      <Identicon class="identicon" :size="24" theme="polkadot" :value="address" />

      <div class="address">{{ cut(address) }}</div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { Identicon } from '@polkadot/vue-identicon';
import type { GetHistory } from '@/interfaces';
import type { SelectedWallet } from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { cut } from '@/helpers/common';
import { NetworksController } from '@/controllers';
import { getType } from '@/helpers/history';
import { TransactionType } from '@/interfaces/history';

@Component({
  components: { Identicon },
})
export default class HistoryBook extends Vue {
  @Prop(String) network!: string;
  @Prop(String) assetId!: string;
  @Getter(NetworksGettersTypes.getHistory) getHistory!: GetHistory;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  @Watch('assetId')
  @Watch('selectedNetwork')
  async networkWatcher() {
    this.fetchHistory();
  }

  async mounted() {
    this.fetchHistory();
  }

  async fetchHistory() {
    if (this.historyAddresses.length !== 0) return;

    await NetworksController.fetchHistory(this.network, this.selectedWallet, this.assetId);
  }

  get historyAddresses() {
    if (!this.network) return [];

    const addresses =
      this.getHistory(this.assetId, this.selectedWallet.address, this.network.toLowerCase())
        ?.nodes.filter((item) => getType(item) === TransactionType.transfer)
        .map(({ transfer }) => transfer?.to) ?? [];

    return Array.from(new Set(addresses)).slice(0, 11);
  }

  cut(value: string) {
    return cut(value);
  }
}
</script>

<style lang="scss" scoped>
.history-book {
  padding: 10px 16px;

  .label {
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    color: $default-white;
    text-align: left;
  }

  .transaction {
    display: flex;
    align-items: center;
    height: 65px;
    border-bottom: 1px solid $default-background-color;
    cursor: pointer;

    &:hover {
      .address {
        color: $default-white;
      }
    }

    .address {
      margin-left: 25px;
      color: rgba(255, 255, 255, 0.64);
      font-size: 14px;
    }
  }
}
</style>
