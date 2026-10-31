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

          <ExportTypeForm v-else-if="showExportType" :password="password" @setExportType="setExportType" @closeHandler="setPassword" />

          <router-view
            v-else
            :ref="routerViewRef"
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
      rejectButtonText="common.cancel"
      acceptButtonText="common.delete"
      :showAcceptButton="true"
      :acceptDisabled="nodeSaving"
      :showRejectButton="true"
      :showWarningIcon="true"
      :headers="headers"
      @handlerClose="closeNotificationPopup"
      @handlerAccept="handlerAccept"
    />

    <AddEthereumAccountPopup v-if="showAddEthereumAccountPopup" @handlerClose="closeAddEthereumAccountPopup" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import ExportForm from './ExportForm.vue';
import ExportTypeForm from './ExportTypeForm.vue';
import EditNodeForm from './EditNodeForm.vue';
import NodeSettingsPopup from './NodeSettingsPopup.vue';
import AddEthereumAccountPopup from './AddEthereumAccountPopup.vue';
import AccountSettingsPopup from './AccountSettingsPopup.vue';
import type Nodes from './Nodes.vue';
import type { ExportType } from '@/interfaces';
import { Components } from '@/router/routes';
import { upsertNetworkMap } from '@/extension/messaging';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'AccountsLayout',
  components: {
    ExportForm,
    EditNodeForm,
    ExportTypeForm,
    NodeSettingsPopup,
    AccountSettingsPopup,
    AddEthereumAccountPopup,
  },
  data() {
    return {
      routerViewRef: 'routerView',
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      password: '',
      selectedNetwork: '',
      selectedNodeName: '',
      selectedNodeUrl: '',
      exportType: null,
      selectedNodeIsActive: false,
      buttonTopClick: 0,
      showAddEthereumAccountPopup: false,
      showAccountSettingsPopup: false,
      showEditNodeForm: false,
      showNodeSettingsPopup: false,
      showNotificationPopup: false,
      nodeSaving: false,
      nodeSaveError: false,
      nodeRequest: 0,
      viewActive: true,
    };
  },
  computed: {
    headers() {
      return { text: this.nodeSaveError ? 'addWallet.google.somethingWrong' : 'accounts.deleteCustomNode', subtext: this.selectedNodeName };
    },
    header() {
      if (this.isAccountsRoute) return 'accounts.chainAccounts';

          if (this.isExportRoute) return 'accounts.backupKeyPair';

          return 'addWallet.accounts';
    },
    showBackIcon() {
      if (this.accountsStore.selectedWallet.isTon) return false;

          return !this.isAccountSetting;
    },
    showExportType() {
      return this.password !== '';
    },
    showExportForm() {
      return this.exportType !== null;
    },
    acceptButtonText() {
      return 'common.delete';
    },
    network() {
      return this.$route.params.network;
    },
    isAccountSetting() {
      return this.routeName === Components.AccountSetting;
    },
    isAccountsRoute() {
      return this.routeName === Components.ChainAccounts;
    },
    isNodesRoute() {
      return this.routeName === Components.Nodes;
    },
    isExportRoute() {
      return this.routeName === Components.Export;
    },
    showExport() {
      return !this.isExportRoute && !this.accountsStore.selectedWallet.isMobile;
    },
    routeName() {
      return this.$route.name;
    },
  },
  beforeUnmount() { this.viewActive = false; this.nodeRequest += 1; },
  methods: {
    setExportType(type: Nullable<ExportType> = null) {
      this.exportType = type;
    },
    setPassword(password: string = '') {
      this.password = password;

          if (this.accountsStore.selectedWallet.isTon) this.setExportType('mnemonic');
    },
    handlerAccept() {
      void this.deleteNode();
    },
    openExportAccountPage() {
      this.$router.push({
            name: Components.Export,
            params: {
              network: this.network ?? this.selectedNetwork,
            },
          });

          this.closeAccountSettings();
    },
    openAccountSettingsPopup(network = '', buttonTop = 0) {
      this.showAccountSettingsPopup = true;
          this.selectedNetwork = network;
          this.buttonTopClick = buttonTop;
    },
    closeAccountSettings(isReset = true) {
      this.showAccountSettingsPopup = false;

          if (isReset) this.selectedNetwork = '';
    },
    openNodeSettingsPopup(network = '', nodeName = '', nodeUrl = '', buttonTop: number, isActive: boolean) {
      this.showNodeSettingsPopup = true;
          this.selectedNetwork = network;
          this.selectedNodeName = nodeName;
          this.selectedNodeUrl = nodeUrl;
          this.selectedNodeIsActive = isActive;
          this.buttonTopClick = buttonTop;
    },
    openEditNodeForm(network: string, name: string, url: string) {
      this.selectedNetwork = network || this.selectedNetwork;
          this.selectedNodeName = name;
          this.selectedNodeUrl = url;
          this.showEditNodeForm = true;

          this.closeNodeSettings();
    },
    closeEditNodeForm(nodesUpdated = false) {
      this.showEditNodeForm = false;
          this.selectedNodeName = '';
          this.selectedNodeUrl = '';

          if (nodesUpdated) this.childUpdatedNode();
    },
    async deleteNode() {
      if (this.nodeSaving || !this.viewActive) return;
      const request = ++this.nodeRequest;
      const network = this.networksStore.getNetwork(this.selectedNetwork);
      const url = this.selectedNodeUrl;
      const customNodes = network.customNodes.filter((node) => node.url !== url);
      const removesActive = network.currentProvider === url;
      this.nodeSaving = true;
      this.nodeSaveError = false;
      try {
        await upsertNetworkMap({ ...network, customNodes,
          currentProvider: removesActive ? network.nodes[0]?.url ?? '' : network.currentProvider,
          isManual: removesActive ? false : network.isManual,
        }, network);
        if (this.viewActive && request === this.nodeRequest) this.closeNotificationPopup();
      } catch {
        if (this.viewActive && request === this.nodeRequest) this.nodeSaveError = true;
      } finally {
        if (this.viewActive && request === this.nodeRequest) this.nodeSaving = false;
      }
    },
    childUpdatedNode(setAuto = false) {
      const nodesComponent = this.$refs[this.routerViewRef] as InstanceType<typeof Nodes>;

          if (setAuto && this.selectedNodeIsActive) nodesComponent.toggleAutoSelectNode(true);
    },
    openNotificationPopup() {
      this.nodeRequest += 1;
      this.nodeSaving = false;
      this.nodeSaveError = false;
      this.showNotificationPopup = true;

          this.closeNodeSettings();
          this.closeAccountSettings(false);
    },
    openAddEthereumAccountPopup() {
      this.showAddEthereumAccountPopup = true;
    },
    closeNotificationPopup() {
      this.nodeRequest += 1;
      this.nodeSaving = false;
      this.selectedNodeName = '';
          this.selectedNodeUrl = '';

          this.showNotificationPopup = false;
    },
    closeNodeSettings() {
      this.showNodeSettingsPopup = false;
    },
    closeAddEthereumAccountPopup() {
      this.showAddEthereumAccountPopup = false;
    },
    handlerBack() {
      if (this.showExportForm) this.setExportType();
          else if (this.showExportType) this.setPassword();
          else this.$router.back();
    },
    close() {
      this.$router.push({ name: Components.Settings });
    },
  },
});
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
