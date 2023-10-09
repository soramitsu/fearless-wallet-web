<template>
  <div class="layout">
    <ContentForm :height="440">
      <div class="accounts-layout">
        <div class="navigation">
          <div class="left-part">
            <Icon icon="arrow-left-circle" className="chevron" @click="back" />

            <div>{{ path }}</div>
          </div>

          <CircleButton
            v-if="showHeaderMenu"
            :ref="dotsVerticalRef"
            iconName="dots-vertical"
            backgroundColor="none"
            backgroundColorHover="light-black"
            @click="openAccountSettingsPopup(network)"
          />
        </div>

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
    </ContentForm>

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
      :_name="selectedNodeName"
      :_url="selectedNodeUrl"
      :network="selectedNetwork"
      :isActive="selectedNodeIsActive"
      @closeForm="closeEditNodeForm"
    />

    <NodeSettingsPopup
      v-if="showNodeSettingsPopup"
      :buttonTopClick="buttonTopClick"
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
import { Vue, Component, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import ExportForm from './ExportForm.vue';
import EditNodeForm from './EditNodeForm.vue';
import NodeSettingsPopup from './NodeSettingsPopup.vue';
import AddEthereumAccountPopup from './AddEthereumAccountPopup.vue';
import AccountSettingsPopup from './AccountSettingsPopup.vue';
import Nodes from './Nodes.vue';
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
  readonly dotsVerticalRef = 'dotsVertical';
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

  get showExportForm() {
    return this.password !== '';
  }

  get showHeaderMenu() {
    return !this.isAccountsRoute;
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

  get path() {
    const path = 'Accounts';
    const networkPath = `${path} / ${this.network?.toUpperCase()}`;
    const exportPath = `${networkPath} / Export account`;

    return this.isAccountsRoute ? path : this.isNodesRoute ? networkPath : this.isExportRoute ? exportPath : '';
  }

  get network() {
    return this.$route.params.network;
  }

  get isAccountsRoute() {
    return this.routeName === Components.Accounts;
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

  @Watch('showAccountSettingsPopup')
  updateZIndexDotsVertical(value: boolean) {
    const targetElement = (this.$refs[this.dotsVerticalRef] as Vue)?.$el as HTMLElement;

    if (targetElement) targetElement.style.zIndex = value ? '200' : '0';
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

  openEditNodeForm(network: string) {
    this.showEditNodeForm = true;
    this.selectedNetwork = network || this.selectedNetwork;

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

    if (setAuto && this.selectedNodeIsActive) nodesComponent.autoSelectNode = true;
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

    if (this.showEditNodeForm) {
      this.selectedNodeName = '';
      this.selectedNodeUrl = '';
    }
  }

  closeAddEthereumAccountPopup() {
    this.showAddEthereumAccountPopup = false;
  }

  back() {
    if (this.isAccountsRoute) this.$router.push({ name: Components.Wallet });
    else this.$router.back();
  }
}
</script>

<style lang="scss" scoped>
.layout {
  height: 100%;

  .accounts-layout {
    padding: 10px 0 0 $default-padding;
    display: flex;
    flex-direction: column;
    height: 100%;

    .navigation {
      display: flex;
      justify-content: space-between;
      color: $default-white;
      font-weight: 700;
      margin: 0 10px 16px 10px;
      min-height: 32px;

      .left-part {
        display: flex;
        align-items: center;
      }

      .chevron {
        margin-right: 15px;
        filter: invert(0.35);
        width: 20px;
        height: 20px;

        &:hover {
          cursor: pointer;
          filter: invert(0);
        }
      }
    }
  }
}
</style>
