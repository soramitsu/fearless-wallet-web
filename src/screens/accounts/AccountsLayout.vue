<template>
  <div class="layout">
    <AboveForm
      :fullScreen="true"
      :header="header"
      :showBackIcon="showBackIcon"
      @handlerBack="handlerBack"
      @closeHandler="close"
    >
      <div class="accounts-layout">
        <Scroll>
          <ExportForm
            v-if="showExportForm"
            :exportType="exportType"
            :password="password"
            @closeHandler="setExportType"
          />

          <ExportTypeForm v-else-if="showExportType" @setExportType="setExportType" @closeHandler="setPassword" />

          <router-view
            v-else
            ref="routerViewRef"
            :password="password"
            @setPassword="setPassword"
            @openEditNodeForm="openEditNodeForm"
            @openAccountSettingsPopup="openAccountSettingsPopup"
            @openNodeSettingsPopup="openNodeSettingsPopup"
            @openAddEthereumAccountPopup="openAddEthereumAccountPopup"
            @closeNodeSettings="closeNodeSettings"
          />
        </Scroll>
      </div>
    </AboveForm>

    <AccountSettingsPopup
      v-if="showAccountSettingsPopup"
      :selectedNetwork="selectedNetwork"
      :showNodeSwitch="!isNodesRoute"
      :showCopyAddress="!isNodesRoute"
      :showExport="showExport"
      :buttonTopClick="buttonTopClick"
      @handlerClose="closeAccountSettings"
      @openNotificationPopup="openNotificationPopup"
      @openExportAccountPage="openExportAccountPage"
    />

    <EditNodeForm
      v-if="showEditNodeForm"
      :nodeName="selectedNodeName"
      :nodeUrl="selectedNodeUrl"
      :network="selectedNetwork"
      :isActive="selectedNodeIsActive"
      @closeForm="closeEditNodeForm"
    />

    <NodeSettingsPopup
      v-if="showNodeSettingsPopup"
      :buttonTopClick="buttonTopClick"
      :name="selectedNodeName"
      :url="selectedNodeUrl"
      @handlerClose="closeNodeSettings"
      @openEditNodeForm="openEditNodeForm"
      @openNotificationPopup="openNotificationPopup"
    />

    <NotificationPopup
      v-if="showNotificationPopup"
      sizeWidth="big"
      rejectButtonText="Cancel"
      acceptButtonText="common.delete"
      :showAcceptButton="true"
      :showRejectButton="true"
      :showWarningIcon="true"
      :headers="headers"
      @handlerClose="closeNotificationPopup"
      @handlerAccept="handlerAccept"
    />

    <AddEthereumAccountPopup v-if="showAddEthereumAccountPopup" @handlerClose="closeAddEthereumAccountPopup" />
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import ExportForm from './ExportForm.vue';
import ExportTypeForm from './ExportTypeForm.vue';
import EditNodeForm from './EditNodeForm.vue';
import NodeSettingsPopup from './NodeSettingsPopup.vue';
import AddEthereumAccountPopup from './AddEthereumAccountPopup.vue';
import AccountSettingsPopup from './AccountSettingsPopup.vue';
import type Nodes from './Nodes.vue';
import type { ExportType } from '@/interfaces';
import NotificationPopup from '@/components/NotificationPopup.vue';
import { Components } from '@/router/routes';
import { upsertNetworkMap } from '@/extension/messaging';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const router = useRouter();
const route = useRoute();
const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();

const routerViewRef = ref<InstanceType<typeof Nodes> | null>(null);
const password = ref('');
const selectedNetwork = ref('');
const selectedNodeName = ref('');
const selectedNodeUrl = ref('');
const exportType = ref<Nullable<ExportType>>(null);
const selectedNodeIsActive = ref(false);
const buttonTopClick = ref(0);
const showAddEthereumAccountPopup = ref(false);
const showAccountSettingsPopup = ref(false);
const showEditNodeForm = ref(false);
const showNodeSettingsPopup = ref(false);
const showNotificationPopup = ref(false);

const routeName = computed(() => route.name as string | undefined);
const networkParam = computed(() => route.params.network as string | undefined);

const isAccountSetting = computed(() => routeName.value === Components.AccountSetting);
const isAccountsRoute = computed(() => routeName.value === Components.ChainAccounts);
const isNodesRoute = computed(() => routeName.value === Components.Nodes);
const isExportRoute = computed(() => routeName.value === Components.Export);

const header = computed(() => {
  if (isAccountsRoute.value) return 'accounts.chainAccounts';
  if (isExportRoute.value) return 'accounts.backupKeyPair';

  return 'addWallet.accounts';
});

const showBackIcon = computed(() => {
  if (accountsStore.selectedWallet.isTon) return false;

  return !isAccountSetting.value;
});

const showExportType = computed(() => password.value !== '');
const showExportForm = computed(() => exportType.value !== null);
const showExport = computed(() => !isExportRoute.value && !accountsStore.selectedWallet.isMobile);
const headers = computed(() => ({ text: 'accounts.deleteCustomNode', subtext: selectedNodeName.value }));

const setExportType = (type: Nullable<ExportType> = null) => {
  exportType.value = type;
};

const setPassword = (value = '') => {
  password.value = value;

  if (accountsStore.selectedWallet.isTon) setExportType('mnemonic');
};

const closeNodeSettings = () => {
  showNodeSettingsPopup.value = false;
};

const closeNotificationPopup = () => {
  selectedNodeName.value = '';
  selectedNodeUrl.value = '';

  showNotificationPopup.value = false;
};

const childUpdatedNode = (setAuto = false) => {
  const nodesComponent = routerViewRef.value;

  if (!nodesComponent) return;

  if (setAuto && selectedNodeIsActive.value) nodesComponent.toggleAutoSelectNode(true);
};

const deleteNode = () => {
  const network = networksStore.getNetwork(selectedNetwork.value);

  if (!network) return;

  const customNodes = network.customNodes.filter((node) => node.url !== selectedNodeUrl.value);

  upsertNetworkMap({
    ...network,
    customNodes,
  });

  childUpdatedNode(true);
  closeNotificationPopup();
};

const handlerAccept = () => {
  deleteNode();
};

const openExportAccountPage = () => {
  router.push({
    name: Components.Export,
    params: {
      network: networkParam.value ?? selectedNetwork.value,
    },
  });

  closeAccountSettings();
};

const openAccountSettingsPopup = (network = '', buttonTop = 0) => {
  showAccountSettingsPopup.value = true;
  selectedNetwork.value = network;
  buttonTopClick.value = buttonTop;
};

const closeAccountSettings = (isReset = true) => {
  showAccountSettingsPopup.value = false;

  if (isReset) selectedNetwork.value = '';
};

const openNodeSettingsPopup = (network = '', nodeName = '', nodeUrl = '', buttonTop: number, isActive: boolean) => {
  showNodeSettingsPopup.value = true;
  selectedNetwork.value = network;
  selectedNodeName.value = nodeName;
  selectedNodeUrl.value = nodeUrl;
  selectedNodeIsActive.value = isActive;
  buttonTopClick.value = buttonTop;
};

const openEditNodeForm = (network: string, name: string, url: string) => {
  selectedNetwork.value = network || selectedNetwork.value;
  selectedNodeName.value = name;
  selectedNodeUrl.value = url;
  showEditNodeForm.value = true;

  closeNodeSettings();
};

const closeEditNodeForm = (nodesUpdated = false) => {
  showEditNodeForm.value = false;
  selectedNodeName.value = '';
  selectedNodeUrl.value = '';

  if (nodesUpdated) childUpdatedNode();
};

const openNotificationPopup = () => {
  showNotificationPopup.value = true;

  closeNodeSettings();
  closeAccountSettings(false);
};

const openAddEthereumAccountPopup = () => {
  showAddEthereumAccountPopup.value = true;
};

const closeAddEthereumAccountPopup = () => {
  showAddEthereumAccountPopup.value = false;
};

const handlerBack = () => {
  if (showExportForm.value) setExportType();
  else if (showExportType.value) setPassword();
  else router.back();
};

const close = () => {
  router.push({ name: Components.Wallet });
};
</script>

<style lang="scss" scoped>
.layout {
  height: 100%;

  .accounts-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
}
</style>
