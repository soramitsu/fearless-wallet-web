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

            <Switcher :disabled="saving" :ariaLabel="$t('accounts.autoNodes')" :value="autoSelectNode" @change="toggleAutoSelectNode" />
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
              @openNodeSettingsPopup="(buttonTop, isActive) => openNodeSettingsPopup(name, url, buttonTop, isActive)"
            />
          </div>
        </div>
      </ContentForm>
    </div>

    <p v-if="saveError" role="alert">{{ $t('addWallet.google.somethingWrong') }}</p>
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
import BaseApi from '@/util/BaseApi';

import { upsertNetworkMap } from '@/extension/messaging';
import { cut, setClipboard } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'Nodes',
  components: { NodeItem },
  data() {
    return {
      saving: false,
      saveError: false,
      viewActive: true,
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
    autoSelectNode() {
      return !this.networkJson?.isManual;
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
  beforeUnmount() { this.viewActive = false; },
  methods: {
    async toggleAutoSelectNode(value: boolean) {
      const provider = value ? this.defaultNodes[0]?.url : this.networkJson.currentProvider;
      if (provider) await this.saveSelection(!value, provider);
    },
    async saveSelection(isManual: boolean, currentProvider: string) {
      if (this.saving || !this.viewActive) return;
      const name = this.selectedNetwork;
      this.saving = true;
      this.saveError = false;
      try {
        await upsertNetworkMap({ ...this.networkJson, isManual, currentProvider }, this.networkJson);
      } catch {
        if (this.viewActive && this.selectedNetwork === name) this.saveError = true;
      } finally {
        if (this.viewActive) this.saving = false;
      }
    },
    openNodeSettingsPopup(name: string, url: string, buttonTop: number, isActive: boolean) {
      this.$emit('openNodeSettingsPopup', this.selectedNetwork, name, url, buttonTop, isActive);
    },
    async changeNode(url: string) {
      if (!this.autoSelectNode) await this.saveSelection(true, url);
    },
    copyAddress() {
      setClipboard(this.formattedAddress);
    },
    getActiveStatus(nodeName: string, url: string) {
      if (this.autoSelectNode || !this.activeNode) return false;

          return nodeName === this.activeNode.name && this.activeNode.url === url;
    },
    getRemoveBorderBottomValue(index: number, isCustomNode = false) {
      if (!this.activeNode) return;
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
    overflow-wrap: anywhere;
  }

  .network-description {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: $default-padding;

    .switch-nodes {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;

      .auto-select-nodes {
        color: $plain-white;
        font-weight: 500;
        font-size: 0.875em;
        text-align: left;
        overflow-wrap: anywhere;
      }
    }

    .img-container {
      width: 40px;
      flex-shrink: 0;
      margin: auto 0;

      .img {
        width: 32px;
      }
    }

    .description {
      display: flex;
      min-width: 0;

      > div:last-child { min-width: 0; }

      .network-name {
        font-size: 1.375em;
        font-weight: 800;
        color: rgba(255, 255, 255, 1);
        margin-bottom: 5px;
        text-align: left;
        overflow-wrap: anywhere;
      }

      .address-wrapper {
        display: flex;
        align-items: center;
        width: 100%;
        min-width: 0;
        color: $gray-color;

        .address {
          font-size: 0.8125em;
          width: 100%;
          min-width: 0;
          margin-right: 5px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .copy {
          filter: invert(0.5);
          width: 20px;
          height: 20px;
          flex-shrink: 0;
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
