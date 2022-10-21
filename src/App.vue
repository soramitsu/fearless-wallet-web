<template>
  <div id="app">
    <div class="drag"></div>

    <router-view />
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
import { isExtension } from '@/helpers/common';
import BaseApi from '@/util/BaseApi';
import { ActionTypes as AuthActionTypes } from '@/store/auth/actions';
import { ActionTypes as MetaActionTypes } from '@/store/metadata/actions';
import { ActionTypes as SignActionTypes } from '@/store/sign/actions';
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
  @Action(AuthActionTypes.SUBSCRIBE_AUTH_REQUESTS) authSubscribe!: TAction<unknown>;
  @Action(SignActionTypes.SUBSCRIBE_SIGN_REQUESTS) signSubscribe!: TAction<unknown>;
  @Action(MetaActionTypes.SUBSCRIBE_METADATA_REQUESTS) metaSubscribe!: TAction<unknown>;

  async created() {
    this.addEventOnline();
    this.connectToNodes();
  }

  async mounted() {
    this.subscribeToBalancesOfNetworks();
  }

  @Watch('isOnline')
  async connectToNodes(value = this.isOnline) {
    if (!value) return;

    const { loadJsons, connectToNodes } = NetworksController;

    await loadJsons();
    await connectToNodes();
  }

  @Watch('isOnline')
  async subscribeToBalancesOfNetworks(value = this.isOnline) {
    if (!value) return;

    const { subscribeToBalancesOfNetworks } = NetworksController;

    if (isExtension()) await Promise.all([this.authSubscribe(), this.metaSubscribe(), this.signSubscribe()]);

    this.subscribeAccounts = BaseApi.getAccountsSubject();
    this.subscribeAddresses = BaseApi.getAddressesSubject();
    this.subscribeAccounts.subscribe(async (accounts) => {
      const newAccounts = this.getNewAccounts(accounts, 'accounts');

      console.info('accounts', newAccounts);

      this.setAccounts({ accounts });

      // subscribe only if the number of new accounts is not equal to the total number of accounts
      if (Object.keys(accounts).length !== Object.keys(newAccounts).length)
        await subscribeToBalancesOfNetworks(newAccounts);
    });

    this.subscribeAddresses.subscribe(async (addresses) => {
      const newAddresses = this.getNewAccounts(addresses, 'addresses');

      console.info('addresses', newAddresses);

      this.setAddresses({ addresses });
      // subscribe only if the number of new addresses is not equal to the total number of accounts
      if (Object.keys(addresses).length !== Object.keys(newAddresses).length)
        await subscribeToBalancesOfNetworks(newAddresses);
    });

    this.setWallet();
  }

  addEventOnline() {
    const updateOnlineStatus = () => this.setOnlineStatus({ isOnline: navigator.onLine });

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
  }

  getNewAccounts(accounts: SubjectInfo, type: 'accounts' | 'addresses') {
    const result = {} as SubjectInfo;

    for (const address in accounts) {
      if (this[type][address] === undefined) result[address] = accounts[address];
    }

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
  font-family: 'Sora';
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
  background-image: url(./assets/background.png);
  background-position: center;
  background-size: cover;

  .drag {
    height: 16px;
    -webkit-app-region: drag;
  }
}
</style>
