<template>
  <div>
    <ContentForm :height="480">
      <Scroll>
        <div class="accounts-layout">
          <div class="navigation">
            <img src="@/assets/arrow-left-circle.svg" class="chevron" @click="back" />
            <div>{{ path }}</div>
          </div>

          <router-view
            ref="content"
            @openEditNodeForm="openEditNodeForm"
            @openNodeSettings="openNodeSettings"
            @toggleAccountSettingsVisible="toggleAccountSettingsVisible"
          />
        </div>
      </Scroll>
    </ContentForm>

    <AccountSettingsPopup
      v-if="showAccountSettings"
      :selectedNetwork="selectedNetwork"
      :selectedAddress="selectedAddress"
      :handlerClose="toggleAccountSettingsVisible"
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
      buttonText="Delete"
      :showButton="true"
      :headers="{ text: 'Delete custom node?', subtext: selectedNodeName }"
      :handlerClose="closeNotificationPopup"
      :handlerButton="deleteNode"
    />
  </div>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { Components } from '@/router/routes';
import ContentForm from '@/components/ContentForm.vue';
import Input from '@/components/Input.vue';
import CircleButton from '@/components/CircleButton.vue';
import Scroll from '@/components/Scroll.vue';
import EditNodeForm from './EditNodeForm.vue';
import NodeSettingsPopup from './NodeSettingsPopup.vue';
import NotificationPopup from '@/components/NotificationPopup.vue';
import AccountSettingsPopup from './AccountSettingsPopup.vue';
import AccountController from '@/controllers/accountController';
import Network from './Network.vue';

@Component({
  components: {
    ContentForm,
    Input,
    CircleButton,
    Scroll,
    EditNodeForm,
    NodeSettingsPopup,
    NotificationPopup,
    AccountSettingsPopup,
  },
})
export default class AccountsLayout extends Vue {
  readonly accountController = new AccountController();

  selectedNetwork = '';
  selectedAddress = '';
  selectedNodeName = '';
  selectedNodeUrl = '';
  showAccountSettings = false;
  showEditNodeForm = false;
  showNodeSettings = false;
  showNotificationPopup = false;

  get path() {
    const path = 'Accounts';

    return this.isAccountsRoute
      ? path
      : this.isNetworkRoute
      ? `${path} / ${this.$route.params.network.toUpperCase()}`
      : '';
  }

  get isAccountsRoute() {
    return this.routeName === Components.Accounts;
  }

  get isNetworkRoute() {
    return this.routeName === Components.Network;
  }

  get routeName() {
    return this.$route.name;
  }

  toggleAccountSettingsVisible(network = '', walletAddress = '') {
    this.showAccountSettings = !this.showAccountSettings;
    this.selectedNetwork = network;
    this.selectedAddress = walletAddress;
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
    this.accountController.deleteNode({ name: this.selectedNodeName, url: this.selectedNodeUrl }, this.selectedNetwork);

    this.childUpdatedNode();

    this.closeNotificationPopup();
  }

  childUpdatedNode() {
    (this.$refs.content as Network).updatedCustomNodes();
  }

  openNotificationPopup() {
    this.showNotificationPopup = true;

    this.closeNodeSettings();
  }

  closeNotificationPopup() {
    this.showNotificationPopup = false;
    this.selectedNodeName = '';
    this.selectedNodeUrl = '';
  }

  closeNodeSettings() {
    this.showNodeSettings = false;
  }

  back() {
    if (this.isAccountsRoute) this.$router.push({ name: Components.Wallet });
    else if (this.isNetworkRoute) this.$router.push({ name: Components.Accounts });
  }
}
</script>

<style lang="scss" scoped>
.accounts-layout {
  padding: 16px;
  display: flex;
  flex-direction: column;
  height: 100%;

  .navigation {
    display: flex;
    color: rgba(255, 255, 255, 0.75);
    font-weight: 700;
    margin-left: 10px;

    .chevron {
      margin-right: 15px;
      filter: invert(0.35);

      &:hover {
        cursor: pointer;
        filter: invert(0);
      }
    }
  }
}
</style>
