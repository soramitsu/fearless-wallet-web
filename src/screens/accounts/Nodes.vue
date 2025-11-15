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
      @click="emit('openEditNodeForm', selectedNetwork)"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { isNativeEVMNetwork } from '@extension-base/background/handlers/utils';
import NodeItem from './NodeItem.vue';
import type { NetworkJson } from '@extension-base/types';
import BaseApi from '@/util/BaseApi';

import { upsertNetworkMap } from '@/extension/messaging';
import { cut, setClipboard } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

defineOptions({
  name: 'Nodes',
});

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const route = useRoute();

const selectedNetwork = computed(() => route.params.network as string);
const selectedNetworkUpper = computed(() => selectedNetwork.value.toUpperCase());

const networkJson = computed(() => networksStore.getNetwork(selectedNetwork.value));

const autoSelectNode = computed({
  get: () => accountsStore.getAutoSelectNodesValueByNetwork(selectedNetwork.value),
  set: (value: boolean) => accountsStore.setAutoSelectNode({ value, network: selectedNetwork.value }),
});

const defaultNodes = computed(() => {
  if (!networkJson.value) return [];

  if (isNativeEVMNetwork(networkJson.value.name)) {
    return networkJson.value.nodes.filter((node) => !node.url.startsWith('wss'));
  }

  return networkJson.value.nodes ?? [];
});

const customNodes = computed(() => networkJson.value?.customNodes ?? []);

const showCustomNodesForm = computed(() => customNodes.value.length !== 0);

const activeNode = computed(() => {
  const currentProvider = networkJson.value?.currentProvider;

  const fromDefaults = networkJson.value?.nodes.find(({ url }) => url === currentProvider);
  if (fromDefaults) return fromDefaults;

  const fromCustom = networkJson.value?.customNodes.find(({ url }) => url === currentProvider);
  if (fromCustom) return fromCustom;

  return networkJson.value?.nodes[0];
});

const formattedAddress = computed(() => BaseApi.formatAddress(accountsStore.selectedWallet, selectedNetwork.value));

const address = computed(() => {
  if (accountsStore.selectedWallet.address === '') return '';

  return cut(formattedAddress.value, 5);
});

const emit = defineEmits<{
  openNodeSettingsPopup: [network: string, name: string, url: string, buttonTop: number, isActive: boolean];
  openEditNodeForm: [network: string];
}>();

watch(
  autoSelectNode,
  (value) => {
    if (!value) return;

    const firstNode = defaultNodes.value[0];

    if (firstNode) changeNode(firstNode.url);
  },
  { immediate: false }
);

const toggleAutoSelectNode = (value: boolean) => {
  autoSelectNode.value = value;
};

const openNodeSettingsPopup = (name: string, url: string, buttonTop: number, isActive: boolean) => {
  emit('openNodeSettingsPopup', selectedNetwork.value, name, url, buttonTop, isActive);
};

const changeNode = (url: string) => {
  if (autoSelectNode.value || !networkJson.value) return;

  const prepData: Partial<NetworkJson> = {
    currentProvider: url,
  };

  upsertNetworkMap({
    ...networkJson.value,
    ...prepData,
    isManual: !autoSelectNode.value,
  });
};

const copyAddress = () => {
  setClipboard(formattedAddress.value);
};

const getActiveStatus = (nodeName: string, url: string) => {
  if (autoSelectNode.value || !activeNode.value) return false;

  return nodeName === activeNode.value.name && activeNode.value.url === url;
};

const getRemoveBorderBottomValue = (index: number, isCustomNode = false) => {
  const nodes = isCustomNode ? customNodes.value : defaultNodes.value;
  const currentActive = activeNode.value;

  if (autoSelectNode.value || !currentActive) return undefined;

  const activeNodeIndex = nodes.findIndex(({ name, url }) => name === currentActive.name && currentActive.url === url);

  if (activeNodeIndex !== -1) {
    return activeNodeIndex === index || index + 1 === activeNodeIndex;
  }

  return undefined;
};
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
