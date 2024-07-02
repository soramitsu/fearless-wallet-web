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
          <router-view
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
      :acceptButtonText="acceptButtonText"
      :showAcceptButton="true"
      :showRejectButton="true"
      :showWarningIcon="showWarningIcon"
      :headers="headers"
      @handlerClose="closeNotificationPopup"
      @handlerAccept="handlerAccept"
    />

    <AddEthereumAccountPopup v-if="showAddEthereumAccountPopup" @handlerClose="closeAddEthereumAccountPopup" />

    <ExportForm v-if="showExportForm" :password="password" @closeHandler="setPassword" />
  </div>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import ExportForm from './ExportForm.vue';
import EditNodeForm from './EditNodeForm.vue';
import NodeSettingsPopup from './NodeSettingsPopup.vue';
import AddEthereumAccountPopup from './AddEthereumAccountPopup.vue';
import AccountSettingsPopup from './AccountSettingsPopup.vue';
import type Nodes from './Nodes.vue';
import type { NetworkJson } from '@extension-base/types';
import type { GetNetwork, SelectedWallet } from '@/store';
import { Components } from '@/router/routes';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { upsertNetworkMap } from '@/extension/messaging';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

type NotificationType = 'delete' | 'export' | '';

@Component({
  components: {
    ExportForm,
    EditNodeForm,
    NodeSettingsPopup,
    AccountSettingsPopup,
    AddEthereumAccountPopup,
  },
})
export default class AccountsLayout extends Vue {
  readonly routerViewRef = 'routerView';
  password = '';
  selectedNetwork = '';
  selectedNodeName = '';
  selectedNodeUrl = '';
  selectedNodeIsActive = false;
  buttonTopClick = 0;
  showAddEthereumAccountPopup = false;
  showAccountSettingsPopup = false;
  showEditNodeForm = false;
  showNodeSettingsPopup = false;
  notificationType: NotificationType = '';

  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.allNetworks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get headers() {
    return this.notificationType === 'delete'
      ? { text: 'accounts.deleteCustomNode', subtext: this.selectedNodeName }
      : this.notificationType === 'export'
      ? {
          text: 'accounts.careful',
          subtext: 'accounts.exportWarning',
        }
      : '';
  }

  get header() {
    if (this.isAccountsRoute) return 'accounts.chainAccounts';

    if (this.isExportRoute) return 'accounts.export';

    return 'addWallet.accounts';
  }

  get showBackIcon() {
    if (this.isAccountSetting) return false;

    return true;
  }

  get showExportForm() {
    return this.password !== '';
  }

  get showWarningIcon() {
    return this.notificationType === 'delete';
  }

  get acceptButtonText() {
    return this.notificationType === 'delete'
      ? 'common.delete'
      : this.notificationType === 'export'
      ? 'accounts.exportJson'
      : '';
  }

  get network() {
    return this.$route.params.network;
  }

  get isAccountSetting() {
    return this.routeName === Components.AccountSetting;
  }

  get isAccountsRoute() {
    return this.routeName === Components.ChainAccounts;
  }

  get isNodesRoute() {
    return this.routeName === Components.Nodes;
  }

  get isExportRoute() {
    return this.routeName === Components.Export;
  }

  get showExport() {
    return !this.isExportRoute && !this.selectedWallet.isMobile;
  }

  get routeName() {
    return this.$route.name;
  }

  get showNotificationPopup() {
    return this.notificationType !== '';
  }

  setPassword(password: string) {
    this.password = password;
  }

  handlerAccept() {
    if (this.notificationType === 'delete') this.deleteNode();
    else if (this.notificationType === 'export') this.openExportAccountScreen();
  }

  openExportAccountScreen() {
    this.$router.push({
      name: Components.Export,
      params: {
        network: this.network ?? this.selectedNetwork,
      },
    });

    this.closeNotificationPopup();
  }

  openAccountSettingsPopup(network = '', buttonTop = 0) {
    this.showAccountSettingsPopup = true;
    this.selectedNetwork = network;
    this.buttonTopClick = buttonTop;
  }

  closeAccountSettings(isReset = true) {
    this.showAccountSettingsPopup = false;

    if (isReset) {
      this.selectedNetwork = '';
    }
  }

  openNodeSettingsPopup(network = '', nodeName = '', nodeUrl = '', buttonTop: number, isActive: boolean) {
    this.showNodeSettingsPopup = true;
    this.selectedNetwork = network;
    this.selectedNodeName = nodeName;
    this.selectedNodeUrl = nodeUrl;
    this.selectedNodeIsActive = isActive;
    this.buttonTopClick = buttonTop;
  }

  openEditNodeForm(network: string, name: string, url: string) {
    this.selectedNetwork = network || this.selectedNetwork;
    this.selectedNodeName = name;
    this.selectedNodeUrl = url;
    this.showEditNodeForm = true;

    this.closeNodeSettings();
  }

  closeEditNodeForm(nodesUpdated = false) {
    this.showEditNodeForm = false;
    this.selectedNodeName = '';
    this.selectedNodeUrl = '';

    if (nodesUpdated) this.childUpdatedNode();
  }

  deleteNode() {
    const network = this.getNetwork(this.selectedNetwork);
    const customNodes = network.customNodes.filter(
      (node) => node.name !== this.selectedNodeName && node.url !== this.selectedNodeUrl
    );

    upsertNetworkMap({
      ...network,
      customNodes,
    });

    this.childUpdatedNode(true);
    this.closeNotificationPopup();
  }

  childUpdatedNode(setAuto = false) {
    const nodesComponent = this.$refs[this.routerViewRef] as Nodes;

    if (setAuto && this.selectedNodeIsActive) nodesComponent.toggleAutoSelectNode(true);
  }

  openNotificationPopup(type: NotificationType) {
    this.notificationType = type;

    this.closeNodeSettings();
    this.closeAccountSettings(false);
  }

  openAddEthereumAccountPopup() {
    this.showAddEthereumAccountPopup = true;
  }

  closeNotificationPopup() {
    this.notificationType = '';
    this.selectedNodeName = '';
    this.selectedNodeUrl = '';
  }

  closeNodeSettings() {
    this.showNodeSettingsPopup = false;
  }

  closeAddEthereumAccountPopup() {
    this.showAddEthereumAccountPopup = false;
  }

  handlerBack() {
    this.$router.back();
  }

  close() {
    this.$router.push({ name: Components.Wallet });
  }
}
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
