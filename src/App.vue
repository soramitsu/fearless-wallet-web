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
import { AccountJson, BalanceJson } from './extension/background/extension-base/src/background/types';
import { Components } from './router/routes';
import type {
  Accounts,
  SetOnlineStatus,
  SetAccountsProps,
  SetSelectedFiat,
  SetNetworksStatusProps,
  SetAssetsPriceProps,
} from '@/store';
import type { TAction, TMutation } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import {
  getBalance,
  getNetworkMap,
  getPrice,
  pingServiceWorker,
  subscribeAccounts,
  subscribeBalance,
  subscribeNetworkMap,
  subscribePrice,
} from '@/extension/messaging';
import store from '@/store';

@Component
export default class App extends Vue {
  @Getter(AccountsGettersTypes.getWallets) wallets!: Record<string, Accounts>;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Getter(NetworksGettersTypes.getAssetsPriceInterval) assetsPriceInterval!: NodeJS.Timer | null;
  @Action(AccountsActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<AccountJson>;
  @Mutation(NetworksMutationTypes.SET_NETWORKS) setNetworks!: TMutation<SetNetworksStatusProps>;
  @Mutation(AccountsMutationTypes.SET_ACCOUNTS) setAccounts!: TMutation<SetAccountsProps>;
  @Mutation(NetworksMutationTypes.SET_ASSETS_PRICE) setPrices!: TMutation<SetAssetsPriceProps>;
  @Mutation(AccountsMutationTypes.SET_ONLINE_STATUS) setOnlineStatus!: TMutation<SetOnlineStatus>;
  @Action(ExtensionActionTypes.SUBSCRIBE_EXTENSION_REQUESTS) extensionSubscribe!: TAction<unknown>;
  @Action(AccountsActionTypes.SET_SELECTED_FIAT) setSelectedFiat!: TAction<SetSelectedFiat>;

  async created() {
    if (BaseApi.isExtension()) {
      this.extensionSubscribe();
    }

    this.setupSWPing();
    this.setupWallet();
    this.setupPrice();
    this.setupNetworks();
    this.setupBalance();
  }

  setupSWPing() {
    setInterval(() => {
      try {
        pingServiceWorker();
      } catch (error) {
        window.close();
      }
    }, 24000);
  }

  addEventOnline() {
    const updateOnlineStatus = () => this.setOnlineStatus({ isOnline: navigator.onLine });

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
  }

  async setupBalance() {
    const balance = await getBalance();
    this.updateBalance(balance);
    subscribeBalance((data) => {
      this.updateBalance(data);
    }).catch(console.error);
  }

  updateBalance(balanceData: BalanceJson): void {
    store.dispatch('SET_BALANCE', balanceData);
  }

  async setupNetworks() {
    const nets = await getNetworkMap();
    this.setNetworks({ networks: Object.values(nets) });

    subscribeNetworkMap((networks) => {
      this.setNetworks({ networks: Object.values(networks) });
    });
  }

  async setupPrice() {
    const { currency, tokenPriceMap: priceMap, tokenPriceChange: priceChange } = await getPrice();
    this.setSelectedFiat({ fiatName: currency });
    this.setPrices({ tokenPriceMap: priceMap, tokenPriceChange: priceChange });

    subscribePrice((info) => {
      const { currency, tokenPriceMap, tokenPriceChange } = info;
      this.setSelectedFiat({ fiatName: currency });
      this.setPrices({ tokenPriceMap, tokenPriceChange });
    });
  }

  setupWallet() {
    subscribeAccounts((accounts) => {
      this.setAccounts({ accounts });

      const selectedAccount = accounts.length === 0 ? undefined : accounts.find((el) => el.active);
      this.setSelectedWallet(selectedAccount);

      if (accounts.length === 0 && this.$route.name !== Components.Welcome) {
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
