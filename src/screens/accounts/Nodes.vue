<template>
  <div class="network">
    <div class="network-description">
      <div class="description">
        <div class="img-container">
          <NetworkLogo :name="selectedNetwork" />
        </div>

        <div>
          <div class="network-name">{{ selectedNetworkUpper }}</div>
          <div class="address-wrapper" @click="copyAddress">
            <div class="address">{{ address }}</div>

            <img src="@/assets/copy.svg" class="copy" />
          </div>
        </div>
      </div>

      <div class="switch-nodes">
        <div class="auto-select-nodes">Auto select nodes</div>

        <Switcher v-model="autoSelectNodes" />
      </div>
    </div>

    <div class="row label">Default nodes</div>

    <div class="row">
      <NodeItem
        v-for="({ url, name }, index) in defaultNodes"
        :key="name"
        :name="name"
        :url="url"
        :isActive="getActiveStatus(name, url)"
        :isRemoveBorderBottom="getRemoveBorderBottomValue(index)"
        @changeNode="changeNode(name, url)"
      />
    </div>
    <div class="custom-nodes">
      <div class="label">Custom nodes</div>

      <div class="add-node" @click="$emit('openEditNodeForm', selectedNetwork)">
        <img src="@/assets/plus.svg" class="plus" />

        <div>Add node</div>
      </div>
    </div>

    <NodeItem
      v-for="({ url, name }, index) in customNodes"
      :key="name"
      :name="name"
      :url="url"
      :isCustomNode="true"
      :isActive="getActiveStatus(name, url)"
      :isRemoveBorderBottom="getRemoveBorderBottomValue(index, true)"
      @changeNode="changeNode(name, url)"
      @openNodeSettingsPopup="openNodeSettingsPopup(name, url, ...arguments)"
    />
  </div>
</template>

<script lang="ts">
import { Vue, Component, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import NodeItem from './NodeItem.vue';
import type { SelectedWallet } from '@/store/accounts/types';
import type { Node, ActiveNodes } from '@/interfaces/nodes';
import type { Networks } from '@/interfaces/networks';
import NetworksController from '@/controllers/networksController';
import BaseApi from '@/util/BaseApi';
import Switcher from '@/components/Switcher.vue';
import { accountController } from '@/controllers/accountController';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import NetworkLogo from '@/components/NetworkLogo.vue';

@Component({
  components: {
    Switcher,
    NodeItem,
    NetworkLogo,
  },
})
export default class Nodes extends Vue {
  autoSelectNodes = true;
  customNodes: Node[] = [];

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;
  @Getter(NetworksGettersTypes.getActiveNodes) activeNodes!: ActiveNodes;

  get activeNode() {
    return this.activeNodes[this.selectedNetwork] ?? { url: '', name: '' };
  }

  get address() {
    if (this.selectedWallet.address === '') return '';

    return BaseApi.getDisplayAddressByNetwork(this.selectedWallet, this.selectedNetwork);
  }

  get defaultNodes() {
    return this.networks.find(({ name }) => name === this.selectedNetwork)?.nodes ?? [];
  }

  get route() {
    return this.$route.name;
  }

  get selectedNetwork() {
    return this.$route.params.network;
  }

  get selectedNetworkUpper() {
    return this.$route.params.network.toUpperCase();
  }

  mounted() {
    this.autoSelectNodes = accountController.getAutoSelectNodesValueByNetwork(this.selectedNetwork);

    this.updatedCustomNodes();
  }

  @Watch('autoSelectNodes')
  toggleAutoSelectNodesValue(value: boolean) {
    accountController.setAutoSelectNodes(value, this.selectedNetwork);

    if (value) this.changeNode();
    else if (this.activeNode.name === '') {
      const defaultNodes = this.defaultNodes?.[0];

      if (defaultNodes !== undefined) {
        const { name, url } = defaultNodes;

        this.changeNode(name, url);
      }
    }
  }

  openNodeSettingsPopup(name: string, url: string, buttonTop: number, isActive: boolean) {
    this.$emit('openNodeSettingsPopup', this.selectedNetwork, name, url, buttonTop, isActive);
  }

  updatedCustomNodes() {
    this.customNodes = accountController.getCustomNodesByNetwork(this.selectedNetwork);
  }

  changeNode(name = '', url = '') {
    const { url: oldUrl } = this.activeNode;

    NetworksController.toggleActiveNode(this.selectedNetwork, name, url, oldUrl);

    if (name !== '' && url !== '') this.autoSelectNodes = false;
  }

  copyAddress() {
    navigator.clipboard.writeText(this.address);
  }

  getActiveStatus(nodeName: string, url: string) {
    return nodeName === this.activeNode.name && this.activeNode.url === url && !this.autoSelectNodes;
  }

  getRemoveBorderBottomValue(index: number, isCustomNode = false) {
    const nodes = isCustomNode ? this.customNodes : this.defaultNodes;
    const { name: activeNodeName, url: activeNodeUrl } = this.activeNode;

    if (this.autoSelectNodes) return;

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
    color: rgba(255, 255, 255, 0.75);
    text-align: left;
    font-weight: 600;
    margin-left: 9px;
  }

  .custom-nodes {
    display: flex;
    justify-content: space-between;
    margin-right: 9px;
    padding-bottom: $default-padding;

    .plus {
      filter: invert(0.5);
      margin-right: 14px;
    }

    .add-node {
      display: flex;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.75);

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
        color: #ffffff;
        font-weight: 500;
        margin-right: 7px;
        font-size: 14px;
      }
    }

    .img-container {
      width: 50px;
      margin: auto 0;
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
        color: rgba(255, 255, 255, 0.5);

        .address {
          font-size: 13px;
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-right: 5px;
        }

        .copy {
          filter: invert(0.5);
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
