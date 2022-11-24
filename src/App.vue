<template>
  <div id="app">
    <div class="drag"></div>

    <keep-alive include="Main">
      <router-view />
    </keep-alive>
  </div>
</template>

<script lang="ts">
import { Watch, Component, Vue } from 'vue-property-decorator';
import { Mutation, Getter, Action } from 'vuex-class';
import type {
  SetSelectedWalletProps,
  setAccountsProps,
  Accounts,
  setAddressesProps,
  setOnlineStatus,
} from '@/store/accounts/types';
import type { TAction, TMutation } from '@/interfaces';
import type { BehaviorSubject } from 'rxjs';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import BaseApi from '@/util/BaseApi';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import NetworksController from '@/controllers/networksController';
import { accountController } from '@/controllers/accountController';

@Component
export default class App extends Vue {
  subscribeAccounts!: BehaviorSubject<SubjectInfo>;
  subscribeAddresses!: BehaviorSubject<SubjectInfo>;

  @Getter(AccountsGettersTypes.getAccounts) accounts!: Accounts;
  @Getter(AccountsGettersTypes.getAddresses) addresses!: Accounts;
  @Getter(AccountsGettersTypes.getWallets) wallets!: Record<string, Accounts>;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<SetSelectedWalletProps>;
  @Mutation(AccountsMutationTypes.SET_ACCOUNTS) setAccounts!: TMutation<setAccountsProps>;
  @Mutation(AccountsMutationTypes.SET_ADDRESSES) setAddresses!: TMutation<setAddressesProps>;
  @Mutation(AccountsMutationTypes.SET_ONLINE_STATUS) setOnlineStatus!: TMutation<setOnlineStatus>;
  @Action(ExtensionActionTypes.SUBSCRIBE_EXTENSION_REQUESTS) extensionSubscribe!: TAction<unknown>;

  created() {
    if (BaseApi.isExtension()) this.extensionSubscribe();

    this.setWallet();
    this.addEventOnline();
    this.connectToNodes();
    this.subscribeToBalancesOfNetworks();
  }

  @Watch('isOnline')
  connect() {
    this.connectToNodes();
    this.subscribeToBalancesOfNetworks();
  }

  async connectToNodes() {
    if (!this.isOnline) return;

    const { loadJsons, connectToNodes } = NetworksController;

    await loadJsons();
    await connectToNodes();
  }

  subscribeToBalancesOfNetworks() {
    if (!this.isOnline) return;

    const { subscribeToBalancesOfNetworks } = NetworksController;

    this.subscribeAccounts = BaseApi.getAccountsSubject();
    this.subscribeAddresses = BaseApi.getAddressesSubject();
    this.subscribeAccounts.subscribe(async (accounts) => {
      const newAccounts = this.getNewAccounts(accounts, 'accounts');
      const accountsCount = Object.keys(accounts).length;
      const newAccountsCount = Object.keys(newAccounts).length;

      this.setAccounts({ accounts });

      if (newAccountsCount === 0) return;

      if (accountsCount === 1 || accountsCount !== newAccountsCount) subscribeToBalancesOfNetworks(newAccounts);
    });

    this.subscribeAddresses.subscribe(async (addresses) => {
      const newAddresses = this.getNewAccounts(addresses, 'addresses');
      const addressesCount = Object.keys(addresses).length;
      const newAddressesCount = Object.keys(newAddresses).length;

      this.setAddresses({ addresses });

      if (newAddressesCount === 0) return;

      if (addressesCount === 1 || addressesCount !== newAddressesCount) subscribeToBalancesOfNetworks(newAddresses);
    });
  }

  addEventOnline() {
    const updateOnlineStatus = () => this.setOnlineStatus({ isOnline: navigator.onLine });

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
  }

  getNewAccounts(accounts: SubjectInfo, type: 'accounts' | 'addresses') {
    const result: SubjectInfo = {};

    for (const address in accounts) {
      if (this[type][address] === undefined) result[address] = accounts[address];
    }

    console.info(type, result);

    return result;
  }

  setWallet() {
    const LSSelectedWalletAddress = accountController.getSelectedWalletAddress();
    const selectedWalletAddress = LSSelectedWalletAddress || BaseApi.getFirstSubstrateWalletAddress();

    if (selectedWalletAddress) {
      const selectedSubstrateAddress = BaseApi.encodeAddress(selectedWalletAddress);

      this.setSelectedWallet({ selectedWalletAddress: selectedSubstrateAddress });
    }
  }

  beforeUnmount() {
    this.subscribeAccounts.unsubscribe();
    this.subscribeAddresses.unsubscribe();
  }
}
</script>

<style lang="scss">
body {
  background-color: rgb(54, 49, 52);
  height: 100vh;
  width: 100%;
}
</style>

<style lang="scss" scoped>
#app {
  font-family: 'Sora', sans-serif;
  font-style: normal;
  font-feature-settings: 'tnum' on, 'lnum' on;
  min-height: $extension-height;
  min-width: $extension-width;
  height: 100%;
  width: $extension-width;
  color: white;
  text-align: center;
  margin: 0 auto;
  padding: 0 $default-padding $default-padding $default-padding;
  background-image: url('./assets/background.png');
  background-position: center;
  background-size: cover;

  .drag {
    height: 16px;
    -webkit-app-region: drag;
  }
}
</style>
