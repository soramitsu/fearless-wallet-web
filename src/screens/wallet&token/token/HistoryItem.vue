<template>
  <div class="history-item">
    <NetworkLogo :name="token" :relayChain="parentNetwork" />

    <div class="column">
      <div class="first-row">
        <div>{{ hash }}</div>
        <div>{{ value }} {{ tokenToUpperCase }}</div>
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
import type { HistoryNode } from '@/interfaces/history';
import type { GetTokenName } from '@/store/networks/types';
import type { Networks } from '@/interfaces/networks';
import type { RelayChainName } from '@/consts/teleport';
import NetworkLogo from '@/components/NetworkLogo.vue';
import { getType, getTypeFormatted, getFormattedDate, getHistoryValue, cut } from '@/helpers/history';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component({
  components: { NetworkLogo },
})
export default class HistoryItem extends Vue {
  @Prop(Object) historyNode!: HistoryNode;
  @Prop(String) tokenId!: string;
  @Prop(String) parentNetwork!: RelayChainName;
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;
  @Getter(NetworksGettersTypes.getTokenName) getTokenName!: GetTokenName;

  get token() {
    return this.getTokenName(this.tokenId);
  }

  get date() {
    return getFormattedDate(this.historyNode);
  }

  get tokenToUpperCase() {
    return this.token.toUpperCase();
  }

  get type() {
    return getType(this.historyNode);
  }

  get value() {
    return getHistoryValue(this.historyNode, this.tokenId);
  }

  get hash() {
    if (this.type === 'transfer') {
      return cut(this.historyNode.transfer.to);
    }

    if (this.type === 'reward') {
      return this.historyNode.reward.validator;
    }

    // extrinsic
    return cut(this.historyNode.extrinsic.hash);
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

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
