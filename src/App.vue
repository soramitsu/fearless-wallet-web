<template>
  <div id="app">
    <keep-alive include="Main">
      <router-view />
    </keep-alive>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Mutation, Getter, Action } from 'vuex-class';
import { Components } from './router/routes';
import { AccountJson, BalanceJson } from './extension/background/extension-base/src/background/types';
import NetworksController from './controllers/networksController';
import { NetworkJson } from './extension/background/extension-base/src/api/evm/types/ether';
import type { setAccountsProps, Accounts, setOnlineStatus } from '@/store';
import type { TAction, TMutation } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { subscribeAccounts, subscribeBalance, subscribeNetworkMap } from '@/extension/messaging';
import store from '@/store';

@Component
export default class App extends Vue {
  @Getter(AccountsGettersTypes.getWallets) wallets!: Record<string, Accounts>;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Getter(NetworksGettersTypes.getAssetsPriceInterval) assetsPriceInterval!: NodeJS.Timer | null;
  @Action(AccountsActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<AccountJson>;
  @Mutation(NetworksMutationTypes.SET_NETWORKS) setNetworks!: TMutation<NetworkJson[]>;

  @Mutation(AccountsMutationTypes.SET_ACCOUNTS) setAccounts!: TMutation<setAccountsProps>;
  @Mutation(AccountsMutationTypes.SET_ONLINE_STATUS) setOnlineStatus!: TMutation<setOnlineStatus>;
  @Action(ExtensionActionTypes.SUBSCRIBE_EXTENSION_REQUESTS) extensionSubscribe!: TAction<unknown>;

  async created() {
    NetworksController.loadJsons();

    subscribeNetworkMap((networks) => {
      this.setNetworks(Object.values(networks));
    });

    if (BaseApi.isExtension()) this.extensionSubscribe();

    this.setWallet();
    this.useSetupBalance();
  }

  updateBalance(balanceData: BalanceJson): void {
    store.dispatch('SET_BALANCE', balanceData);
  }

  addEventOnline() {
    const updateOnlineStatus = () => this.setOnlineStatus({ isOnline: navigator.onLine });

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
  }
  useSetupBalance(): void {
    subscribeBalance(null, this.updateBalance).then(this.updateBalance).catch(console.error);
  }

  setWallet() {
    subscribeAccounts((accounts) => {
      this.setAccounts({ accounts });

      const selectedAccount = accounts.find((el) => el.isDefaultAuthSelected);

      this.setSelectedWallet(selectedAccount);

      if (accounts.length === 0) {
        this.$router.push(Components.Welcome);
      }
    });
  }

  unsubscribe() {
    clearInterval(this.assetsPriceInterval!);
  }

  beforeUnmount() {
    this.unsubscribe();
  }
}
</script>

<style lang="scss">
body {
  background-color: rgb(54, 49, 52);
  min-height: 100%;
}
</style>

<style lang="scss" scoped>
#app {
  font-family: 'Sora', sans-serif;
  font-style: normal;
  font-feature-settings: 'tnum' on, 'lnum' on;
  min-height: $extension-height;
  min-width: $extension-width;
  height: 100vh;
  width: $extension-width;
  color: white;
  text-align: center;
  margin: 0 auto;
  padding: $default-padding;
  background-image: url('./assets/background.png');
  background-position: center;
  background-size: cover;
}
</style>
