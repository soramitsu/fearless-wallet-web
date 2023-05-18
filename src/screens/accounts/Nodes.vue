<template>
  <div class="network">
    <div class="network-description">
      <div class="description">
        <div class="img-container">
          <ExternalLogo class="img" :name="selectedNetwork" />
        </div>

        <div>
          <div class="network-name">{{ selectedNetworkUpper }}</div>
          <div class="address-wrapper" @click="copyAddress">
            <div class="address">{{ address }}</div>

            <Icon icon="copy" className="copy" />
          </div>
        </div>
      </div>

      <div class="switch-nodes">
        <div class="auto-select-nodes">{{ $t('accounts.autoNodes') }}</div>

        <Switcher v-model="autoSelectNode" />
      </div>
    </div>

    <div class="row label">{{ $t('accounts.defaultNodes') }}</div>

    <div class="row">
      <NodeItem
        v-for="({ url, name }, index) in defaultNodes"
        :key="name + index"
        :name="name"
        :url="url"
        :isActive="getActiveStatus(name, url)"
        :isRemoveBorderBottom="getRemoveBorderBottomValue(index)"
        @changeNode="changeNode(name, url)"
      />
    </div>
    <div class="custom-nodes">
      <div class="label">{{ $t('accounts.customNodes') }}</div>

      <div class="add-node" @click="$emit('openEditNodeForm', selectedNetwork)">
        <Icon icon="plus" className="plus" />

        <div>{{ $t('accounts.addNode') }}</div>
      </div>
    </div>

    <NodeItem
      v-for="({ url, name }, index) in customNodes"
      :key="name + index"
      :name="name"
      :url="url"
      :isCustomNode="true"
      :isActive="getActiveStatus(name, url)"
      :isRemoveBorderBottom="getRemoveBorderBottomValue(index, true)"
      @changeNode="changeNode(name, url, true)"
      @openNodeSettingsPopup="openNodeSettingsPopup(name, url, ...arguments)"
    />
  </div>
</template>

<script lang="ts">
import { Vue, Component, Watch } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import NodeItem from './NodeItem.vue';
import type {
  SelectedWallet,
  SetAutoSelectNode,
  GetAutoSelectNodesValueByNetwork,
  GetActiveNodesByNetwork,
} from '@/store';
import type { Node, TMutation } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { NetworkJsonOld } from '@/extension/background/extension-base/src/types';
import { upsertNetworkMap } from '@/extension/messaging';

@Component({
  components: { NodeItem },
})
export default class Nodes extends Vue {
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getAutoSelectNodesValueByNetwork)
  getAutoSelectNodesValueByNetwork!: GetAutoSelectNodesValueByNetwork;
  @Getter(NetworksGettersTypes.getAllNetworks) networks!: NetworkJsonOld[];
  @Getter(NetworksGettersTypes.getActiveNodesByNetwork) getActiveNodesByNetwork!: GetActiveNodesByNetwork;
  @Mutation(AccountsMutationTypes.SET_AUTO_SELECT_NODE) setAutoSelectNode!: TMutation<SetAutoSelectNode>;

  get autoSelectNode() {
    return this.getAutoSelectNodesValueByNetwork(this.selectedNetwork);
  }

  set autoSelectNode(value: boolean) {
    this.setAutoSelectNode({ value, network: this.selectedNetwork });
  }

  get activeNode() {
    const { currentProvider } = this.networkJson;
    const activeNode =
      this.networkJson.nodes.find((el) => el.name === currentProvider) ??
      this.networkJson.customNodes.find((el) => el.name === currentProvider);

    return activeNode ?? this.networkJson.nodes[0];
  }

  get address() {
    if (this.selectedWallet.address === '') return '';

    return BaseApi.formatAddress(this.selectedWallet, this.selectedNetwork);
  }

  get defaultNodes() {
    return this.networkJson.nodes ?? [];
  }

  get customNodes() {
    return this.networkJson.customNodes ?? [];
  }

  get route() {
    return this.$route.name;
  }

  get selectedNetwork() {
    return this.$route.params.network;
  }

  get networkJson() {
    return this.networks.find(({ name }) => name.toLowerCase() === this.selectedNetwork.toLowerCase())!;
  }

  get selectedNetworkUpper() {
    return this.$route.params.network.toUpperCase();
  }

  @Watch('autoSelectNode')
  toggleAutoSelectNodesValue() {
    const [{ name, url }] = this.defaultNodes;
    this.changeNode(name, url);
  }

  openNodeSettingsPopup(name: string, url: string, buttonTop: number, isActive: boolean) {
    this.$emit('openNodeSettingsPopup', this.selectedNetwork, name, url, buttonTop, isActive);
  }

  changeNode(url: string, name: string, isCustomNode = false) {
    const prepData: Partial<NetworkJsonOld> = {};

    if (isCustomNode) {
      if (!prepData.customNodes) prepData.customNodes = [];

      prepData.customNodes.push({ name, url });
    }

    prepData.currentProvider = url;

    upsertNetworkMap({
      ...this.networkJson,
      ...prepData,
      isManual: this.autoSelectNode,
    });
  }

  copyAddress() {
    navigator.clipboard.writeText(this.address);
  }

  getActiveStatus(nodeName: string, url: string) {
    if (this.autoSelectNode) return false;

    return nodeName === this.activeNode.name && this.activeNode.url === url;
  }

  getRemoveBorderBottomValue(index: number, isCustomNode = false) {
    const nodes = isCustomNode ? this.customNodes : this.defaultNodes;
    const { name: activeNodeName, url: activeNodeUrl } = this.activeNode;

    if (this.autoSelectNode) return;

    const activeNodeIndex = nodes.findIndex(({ name, url }) => name === activeNodeName && activeNodeUrl === url);

    if (activeNodeIndex !== -1) {
      // remove the border if it is the active node or the previous node
      return activeNodeIndex === index || index + 1 === activeNodeIndex;
    }
  }
}
</script>

<style lang="scss" scoped>
.network {
  display: flex;
  flex-direction: column;
  margin-right: 16px;

  .row {
    margin-top: 16px;
  }

  .label {
    color: $default-white;
    text-align: left;
    font-weight: 600;
    margin-left: 9px;
  }

  .custom-nodes {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-right: 9px;
    padding-bottom: $default-padding;

    .plus {
      filter: invert(0.5);
      margin-right: 14px;
      width: 20px;
      height: 20px;
    }

    .add-node {
      display: flex;
      font-weight: 600;
      color: $default-white;

      &:hover {
        cursor: pointer;

        color: rgba(255, 255, 255, 0.9);

        .plus {
          filter: invert(0.3);
        }
      }
    }
  }

  .network-description {
    display: flex;
    justify-content: space-between;

    .switch-nodes {
      display: flex;
      align-items: center;

      .auto-select-nodes {
        color: $plain-white;
        font-weight: 500;
        margin-right: 7px;
        font-size: 14px;
        width: 130px;
      }
    }

    .img-container {
      width: 50px;
      margin: auto 0;

      .img {
        width: 32px;
      }
    }

    .description {
      display: flex;

      .network-name {
        font-size: 22px;
        font-weight: 800;
        color: rgba(255, 255, 255, 1);
        margin-bottom: 5px;
        text-align: left;
      }

      .address-wrapper {
        display: flex;
        align-items: center;
        width: 135px;
        color: $gray-color;

        .address {
          font-size: 13px;
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-right: 5px;
        }

        .copy {
          filter: invert(0.5);
          width: 20px;
          height: 20px;
        }

        &:hover {
          cursor: pointer;
          color: rgba(255, 255, 255, 0.8);

          .copy {
            filter: invert(0.2);
          }
        }
      }
    }
  }
}
</style>
