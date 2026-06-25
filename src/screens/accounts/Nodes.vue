<template>
  <div class="nodes-page">
    <div>
      <ContentForm :isStaticHeight="true" :bottomRightCorner="true">
        <div class="network-description">
          <div class="description">
            <div class="img-container">
              <ExternalLogo class="img" :name="selectedNetwork" />
            </div>

            <div>
              <div class="network-name" data-testid="networkName">{{ selectedNetworkUpper }}</div>
              <div class="address-wrapper" @click="copyAddress">
                <div class="address">{{ address }}</div>

                <Icon icon="copy" className="copy" />
              </div>
              <Tooltip text="common.copied" target=".address-wrapper" placement="top-end" trigger="click" />
            </div>
          </div>

          <div class="switch-nodes">
            <div class="auto-select-nodes">{{ $t('accounts.autoNodes') }}</div>

            <Switcher :value="autoSelectNode" @change="toggleAutoSelectNode" />
          </div>
        </div>
      </ContentForm>

      <ContentForm :isStaticHeight="true" :bottomRightCorner="true" class="nodes-form">
        <div class="container-nodes">
          <div class="row label" data-testid="defaultNodes">{{ $t('accounts.defaultNodes') }}</div>

          <div class="row">
            <NodeItem
              v-for="({ url, name }, index) in defaultNodes"
              :key="name + index"
              :name="name"
              :url="url"
              :isActive="getActiveStatus(name, url)"
              :isRemoveBorderBottom="getRemoveBorderBottomValue(index)"
              @changeNode="changeNode(url)"
            />
          </div>
        </div>
      </ContentForm>

      <ContentForm v-if="showCustomNodesForm" :isStaticHeight="true" :bottomRightCorner="true">
        <div class="container-nodes">
          <div class="label" data-testid="customNodes">{{ $t('accounts.customNodes') }}</div>

          <div class="row">
            <NodeItem
              v-for="({ url, name }, index) in customNodes"
              :key="name + index"
              :name="name"
              :url="url"
              :isCustomNode="true"
              :isActive="getActiveStatus(name, url)"
              :isRemoveBorderBottom="getRemoveBorderBottomValue(index, true)"
              @changeNode="changeNode(url)"
              @openNodeSettingsPopup="openNodeSettingsPopup(name, url, ...arguments)"
            />
          </div>
        </div>
      </ContentForm>
    </div>

    <FButton
      class="row"
      size="big"
      text="accounts.addCustomNode"
      data-testid="openEditNodeFormBtn"
      @click="$emit('openEditNodeForm', selectedNetwork)"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { isNativeEVMNetwork } from '@extension-base/background/handlers/utils';
import NodeItem from './NodeItem.vue';
import type { NetworkJson } from '@extension-base/types';
import BaseApi from '@/util/BaseApi';

import { upsertNetworkMap } from '@/extension/messaging';
import { cut, setClipboard } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'Nodes',
  components: { NodeItem },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    heightDefaultNodesForm() {
      const countNodes = this.defaultNodes.length;

          return countNodes * 60 + 80;
    },
    heightCustomNodesForm() {
      const countNodes = this.customNodes.length;

          return countNodes * 60 + 80;
    },
    showCustomNodesForm() {
      return this.customNodes.length !== 0;
    },
    autoSelectNode: {
      get() {
        return this.accountsStore.getAutoSelectNodesValueByNetwork(this.selectedNetwork);
      },
      set(value: boolean) {
        this.accountsStore.setAutoSelectNode({ value, network: this.selectedNetwork });
      },
    },
    activeNode() {
      const { currentProvider } = this.networkJson;
          const activeNode =
            this.networkJson.nodes.find(({ url }) => url === currentProvider) ??
            this.networkJson.customNodes.find(({ url }) => url === currentProvider);

          return activeNode ?? this.networkJson.nodes[0];
    },
    formattedAddress() {
      return BaseApi.formatAddress(this.accountsStore.selectedWallet, this.selectedNetwork);
    },
    address() {
      if (this.accountsStore.selectedWallet.address === '') return '';

          return cut(this.formattedAddress, 5);
    },
    defaultNodes() {
      if (!this.networkJson) return [];

          if (isNativeEVMNetwork(this.networkJson.name))
            return this.networkJson.nodes.filter((el) => !el.url.startsWith('wss'));

          return this.networkJson.nodes ?? [];
    },
    customNodes() {
      if (!this.networkJson) return [];

          return this.networkJson.customNodes ?? [];
    },
    route() {
      return this.$route.name;
    },
    selectedNetwork() {
      return this.$route.params.network;
    },
    networkJson() {
      return this.networksStore.getNetwork(this.selectedNetwork);
    },
    selectedNetworkUpper() {
      return this.$route.params.network.toUpperCase();
    },
  },
  watch: {
    "autoSelectNode": 'toggleAutoSelectNodesValue',
  },
  methods: {
    toggleAutoSelectNodesValue() {
      const [{ url }] = this.defaultNodes;

          this.changeNode(url);
    },
    toggleAutoSelectNode(value: boolean) {
      this.autoSelectNode = value;
    },
    openNodeSettingsPopup(name: string, url: string, buttonTop: number, isActive: boolean) {
      this.$emit('openNodeSettingsPopup', this.selectedNetwork, name, url, buttonTop, isActive);
    },
    changeNode(url: string) {
      if (this.autoSelectNode) return;

          const prepData: Partial<NetworkJson> = {};

          prepData.currentProvider = url;

          upsertNetworkMap({
            ...this.networkJson,
            ...prepData,
            isManual: !this.autoSelectNode,
          });
    },
    copyAddress() {
      setClipboard(this.formattedAddress);
    },
    getActiveStatus(nodeName: string, url: string) {
      if (this.autoSelectNode) return false;

          return nodeName === this.activeNode.name && this.activeNode.url === url;
    },
    getRemoveBorderBottomValue(index: number, isCustomNode = false) {
      const nodes = isCustomNode ? this.customNodes : this.defaultNodes;
          const { name: activeNodeName, url: activeNodeUrl } = this.activeNode;

          if (this.autoSelectNode) return;

          const activeNodeIndex = nodes.findIndex(({ name, url }) => name === activeNodeName && activeNodeUrl === url);

          if (activeNodeIndex !== -1) {
            // remove the border if it is the active node or the previous node
            return activeNodeIndex === index || index + 1 === activeNodeIndex;
          }
    },
  },
});
</script>

<style lang="scss" scoped>
.nodes-page {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .container-nodes {
    display: flex;
    justify-content: space-between;
    flex-direction: column;
    padding: $default-padding;
  }

  .nodes-form {
    margin: 16px 0;
  }

  .row {
    margin-top: 16px;
  }

  .label {
    color: $default-white;
    text-align: left;
    font-weight: 600;
    margin-left: 9px;
  }

  .network-description {
    display: flex;
    justify-content: space-between;
    padding: $default-padding;

    .switch-nodes {
      display: flex;
      align-items: center;

      .auto-select-nodes {
        color: $plain-white;
        font-weight: 500;
        margin-right: 7px;
        font-size: 0.875em;
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
        font-size: 1.375em;
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
          font-size: 0.8125em;
          width: 100%;
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
