<template>
  <div class="11">
    <ContentForm :height="450">
      <div class="accounts-layout">
        <div class="navigation">
          <div class="left-part">
            <img src="@/assets/arrow-left-circle.svg" class="chevron" @click="back" />
            <div>{{ path }}</div>
          </div>

          <CircleButton
            v-if="showHeaderMenu"
            iconName="dots-vertical"
            backgroundColor="none"
            backgroundColorHover="light-black"
            @click="openAccountSettings(network)"
          />
        </div>
        <Scroll>
          <router-view
            ref="content"
            :password="password"
            @setPassword="setPassword"
            @openEditNodeForm="openEditNodeForm"
            @openNodeSettings="openNodeSettings"
            @openAccountSettings="openAccountSettings"
          />
        </Scroll>
      </div>
    </ContentForm>

    <AccountSettingsPopup
      v-if="showAccountSettings"
      :selectedNetwork="selectedNetwork"
      :handlerClose="closeAccountSettings"
      :showSwitchNode="isAccountsRoute"
      :showReplaceAccount="showReplaceAccount"
      :buttonTopClick="buttonTopClick"
      @openReplacePopup="openReplacePopup"
      @openNotificationPopup="openNotificationPopup"
    />

    <EditNodeForm
      v-if="showEditNodeForm"
      :_name="selectedNodeName"
      :_url="selectedNodeUrl"
      :network="selectedNetwork"
      :closeForm="closeEditNodeForm"
    />

    <NodeSettingsPopup
      v-if="showNodeSettings"
      :handlerClose="closeNodeSettings"
      @openEditNodeForm="openEditNodeForm"
      @openNotificationPopup="openNotificationPopup"
    />

    <NotificationPopup
      v-if="showNotificationPopup"
      sizeWidth="big"
      :buttonText="buttonText"
      :showButton="true"
      :showWarningIcon="showWarningIcon"
      :headers="headers"
      :handlerClose="closeNotificationPopup"
      :handlerButton="handlerButton"
    />

    <ReplacePopup v-if="showReplacePopup" :selectedNetwork="selectedNetwork" :handlerClose="closeReplacePopup" />

    <ExportForm v-if="showExportForm" :password="password" :closeForm="setPassword" />
  </div>
</template>

<script lang="ts">
import ContentForm from '@/components/ContentForm.vue';
import Input from '@/components/Input.vue';
import ExportForm from './ExportForm.vue';
import CircleButton from '@/components/CircleButton.vue';
import Scroll from '@/components/Scroll.vue';
import EditNodeForm from './EditNodeForm.vue';
import NodeSettingsPopup from './NodeSettingsPopup.vue';
import NotificationPopup from '@/components/NotificationPopup.vue';
import ReplacePopup from './ReplacePopup.vue';
import AccountSettingsPopup from './AccountSettingsPopup.vue';
import Network from './Network.vue';
import { accountController } from '@/controllers/accountController';
import { Vue, Component } from 'vue-property-decorator';
import { Components } from '@/router/routes';

type NotificationType = 'delete' | 'export' | '';

@Component({
  components: {
    Input,
    Scroll,
    ExportForm,
    ContentForm,
    ReplacePopup,
    EditNodeForm,
    CircleButton,
    NodeSettingsPopup,
    NotificationPopup,
    AccountSettingsPopup,
  },
})
export default class AccountsLayout extends Vue {
  password = '';
  selectedNetwork = '';
  selectedNodeName = '';
  selectedNodeUrl = '';
  notificationType: NotificationType = '';
  buttonTopClick = 0;
  showReplaceAccount = true;
  showReplacePopup = false;
  showAccountSettings = false;
  showEditNodeForm = false;
  showNodeSettings = false;

  get headers() {
    return this.notificationType === 'delete'
      ? { text: 'Delete custom node?', subtext: this.selectedNodeName }
      : this.notificationType === 'export'
      ? {
          text: 'Be careful',
          subtext:
            'Sharing or copying your secret is a high risk operation, don’t send it to anyone. Would you like to proceed with sharing/copying process?',
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

  get buttonText() {
    return this.notificationType === 'delete' ? 'Delete' : this.notificationType === 'export' ? 'Export JSON ' : '';
  }

  get path() {
    const path = 'Accounts';
    const networkPath = `${path} / ${this.network?.toUpperCase()}`;
    const exportPath = `${networkPath} / Export account`;

    return this.isAccountsRoute ? path : this.isNetworkRoute ? networkPath : this.isExportRoute ? exportPath : '';
  }

  get network() {
    return this.$route.params.network;
  }

  get isAccountsRoute() {
    return this.routeName === Components.Accounts;
  }

  get isNetworkRoute() {
    return this.routeName === Components.Network;
  }

  get isExportRoute() {
    return this.routeName === Components.Export;
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

  handlerButton() {
    if (this.notificationType === 'delete') this.deleteNode();
    else if (this.notificationType === 'export') this.openExportAccount();
  }

  openExportAccount() {
    this.$router.push({
      name: Components.Export,
      params: {
        network: this.network ?? this.selectedNetwork,
      },
    });

    this.closeNotificationPopup();
  }

  openAccountSettings(network = '', buttonTop: number, isReplaceAccount: boolean) {
    this.showAccountSettings = true;
    this.selectedNetwork = network;
    this.buttonTopClick = buttonTop;
    this.showReplaceAccount = !isReplaceAccount;
  }

  closeAccountSettings(isReset = true) {
    this.showAccountSettings = false;

    if (isReset) {
      this.selectedNetwork = '';
    }
  }

  openNodeSettings(network = '', nodeName = '', nodeUrl = '') {
    this.showNodeSettings = true;
    this.selectedNetwork = network;
    this.selectedNodeName = nodeName;
    this.selectedNodeUrl = nodeUrl;
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
    accountController.deleteNode({ name: this.selectedNodeName, url: this.selectedNodeUrl }, this.selectedNetwork);

    this.childUpdatedNode();

    this.closeNotificationPopup();
  }

  childUpdatedNode() {
    (this.$refs.content as Network).updatedCustomNodes();
  }

  openNotificationPopup(type: NotificationType) {
    this.notificationType = type;

    this.closeNodeSettings();
    this.closeAccountSettings(false);
  }

  openReplacePopup() {
    this.showReplacePopup = true;

    this.closeAccountSettings(false);
  }

  closeNotificationPopup() {
    this.notificationType = '';
    this.selectedNodeName = '';
    this.selectedNodeUrl = '';
  }

  closeNodeSettings() {
    this.showNodeSettings = false;
  }

  closeReplacePopup() {
    this.showReplacePopup = false;
  }

  back() {
    if (this.isAccountsRoute) this.$router.push({ name: Components.Wallet });
    else if (this.isNetworkRoute) this.$router.push({ name: Components.Accounts });
    else if (this.isExportRoute) this.$router.go(-1);
  }
}
</script>

<style lang="scss" scoped>
.accounts-layout {
  padding: 10px 0 0 16px;
  display: flex;
  flex-direction: column;
  height: 100%;

  .navigation {
    display: flex;
    justify-content: space-between;
    color: rgba(255, 255, 255, 0.75);
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
</style>
