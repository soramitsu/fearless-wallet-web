<template>
  <div id="app">
    <keep-alive :include="includeKeepAlive">
      <router-view />
    </keep-alive>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Mutation, Getter, Action } from 'vuex-class';
import { AccountJson, BalanceJson, PriceJson } from './extension/background/extension-base/src/background/types/types';
import { Components } from './router/routes';
import type { Accounts, SetAccountsProps, SetNetworksStatusProps, SetAssetsPriceProps } from '@/store';
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
  triggerAccountsSubscription,
} from '@/extension/messaging';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';

@Component
export default class App extends Vue {
  @Getter(AccountsGettersTypes.showPolkaswapAlert) showPolkaswapAlert!: boolean;
  @Getter(AccountsGettersTypes.getWallets) wallets!: Record<string, Accounts>;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Getter(NetworksGettersTypes.getAssetsPriceInterval) assetsPriceInterval!: NodeJS.Timer | null;
  @Action(AccountsActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<AccountJson>;
  @Mutation(NetworksMutationTypes.SET_NETWORKS) setNetworks!: TMutation<SetNetworksStatusProps>;
  @Mutation(AccountsMutationTypes.SET_ACCOUNTS) setAccounts!: TMutation<SetAccountsProps>;
  @Mutation(NetworksMutationTypes.SET_ASSETS_PRICE) setPrices!: TMutation<SetAssetsPriceProps>;
  @Mutation(AccountsMutationTypes.SET_ONLINE_STATUS) setOnlineStatus!: TMutation<boolean>;
  @Mutation(AccountsMutationTypes.SET_SELECTED_FIAT) setSelectedFiat!: TMutation<string>;
  @Mutation(AccountsMutationTypes.SET_BALANCE) setBalance!: TMutation<BalanceJson>;
  @Action(ExtensionActionTypes.SUBSCRIBE_EXTENSION_REQUESTS) extensionSubscribe!: TAction<unknown>;
  @Action(NetworksActionTypes.FETCH_FIATS) fetchFiats!: TAction<void>;

  get includeKeepAlive() {
    const components = ['Main'];

    if (this.showPolkaswapAlert) components.push('SwapForm');

    return components;
  }

  async created() {
    if (BaseApi.isExtension()) this.extensionSubscribe();

    this.setupSWPing();
    this.fetchFiats();
    this.setupPrice();
    this.setupWallet();
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
    const updateOnlineStatus = () => this.setOnlineStatus(navigator.onLine);

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
  }

  async setupBalance() {
    const balance = await getBalance();

    this.setBalance(balance);

    subscribeBalance((balances) => {
      this.setBalance(balances);
    }).catch(console.error);
  }

  async setupNetworks() {
    const nets = await getNetworkMap();

    this.setNetworks({ networks: Object.values(nets) });

    subscribeNetworkMap((networks) => {
      this.setNetworks({ networks: Object.values(networks) });
    });
  }

  async setupPrice() {
    const priceJson = await getPrice();
    this.updatePrice(priceJson);

    subscribePrice((priceUpdates) => {
      this.updatePrice(priceUpdates);
    }).catch(console.error);
  }

  updatePrice({ currency, tokenPriceMap, tokenPriceChange }: PriceJson) {
    this.setSelectedFiat(currency);
    this.setPrices({ tokenPriceMap, tokenPriceChange });
  }

  setupWallet() {
    subscribeAccounts((accounts) => {
      console.info('accounts', accounts);

      const isAccountsNotExists = accounts.length === 0;
      const selectedAccount = isAccountsNotExists ? undefined : accounts.find((el) => el.active);

      this.setSelectedWallet(selectedAccount);
      this.setAccounts({ accounts });

      if (isAccountsNotExists) this.$router.push(Components.Welcome);
    }).then(() => {
      triggerAccountsSubscription();
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
