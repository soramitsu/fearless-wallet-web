<template>
  <div class="history-item">
    <NetworkLogo :name="asset" :relayChain="relayChain" />

    <div class="column">
      <div class="first-row">
        <div>{{ hash }}</div>
        <div>{{ value }} {{ assetToUpperCase }}</div>
      </div>
      <div class="second-row">
        <div>{{ typeFormatted }}</div>
        <div>{{ date }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetName } from '@/store/networks/types';
import type { HistoryNode, Networks, RelayChainName } from '@/interfaces';
import NetworkLogo from '@/components/NetworkLogo.vue';
import { getType, getTypeFormatted, getFormattedDate, getHistoryValue, cut } from '@/helpers/history';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { TransactionType } from '@/interfaces/history';

@Component({
  components: { NetworkLogo },
})
export default class HistoryItem extends Vue {
  @Prop(Object) historyNode!: HistoryNode;
  @Prop(String) assetId!: string;
  @Prop(String) relayChain!: RelayChainName;
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;
  @Getter(NetworksGettersTypes.getAssetName) getAssetName!: GetAssetName;

  get asset() {
    return this.getAssetName(this.assetId);
  }

  get date() {
    return getFormattedDate(this.historyNode);
  }

  get assetToUpperCase() {
    return this.asset.toUpperCase();
  }

  get type() {
    return getType(this.historyNode);
  }

  get value() {
    return getHistoryValue(this.historyNode, this.assetId);
  }

  get hash() {
    const { transfer, reward, extrinsic } = this.historyNode;

    if (this.type === TransactionType.transfer) {
      return cut(transfer.to);
    }

    if (this.type === TransactionType.reward) {
      return reward.validator;
    }

    // extrinsic
    return cut(extrinsic.hash);
  }

  get typeFormatted() {
    return getTypeFormatted(this.historyNode);
  }
}
</script>

<style lang="scss" scoped>
.history-item {
  display: flex;
  margin: 0 16px;
  padding: $default-padding 0;
  border-bottom: 1px solid $default-background-color;

  &:hover {
    cursor: pointer;
  }

  &:last-child {
    border: none;
  }

  .column {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 100%;
    margin-left: 13px;

    .first-row {
      display: flex;
      justify-content: space-between;
      font-weight: 600;
    }

    .second-row {
      display: flex;
      justify-content: space-between;
      color: rgba(255, 255, 255, 0.64);
      font-size: 14px;
      margin-top: 2px;
    }
  }
}
</style>
