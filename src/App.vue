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
import { ALL_NETWORKS } from './consts/networks';
import { Components } from './router/routes';
import type { AccountJson, BalanceJson, PriceJson } from '@extension-base/background/types/types';
import type { SetAccountsProps, SetNetworksStatusProps, SetAssetsPriceProps } from '@/store';
import type { AsyncFn, Fn } from '@/interfaces';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import { MutationTypes as ExtensionMutationTypes } from '@/store/extension/mutations';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import {
  isOnboardingRequired,
  pingServiceWorker,
  subscribeAccounts,
  subscribeAddresses,
  subscribeBalance,
  subscribeNetworkMap,
  subscribePrice,
} from '@/extension/messaging';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import { IS_EXTENSION } from '@/consts/global';
import { ActionTypes as SoraCardActionTypes } from '@/store/soraCard/actions';

@Component
export default class App extends Vue {
  @Getter(AccountsGettersTypes.showPolkaswapAlert) showPolkaswapAlert!: boolean;
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];
  @Getter(AccountsGettersTypes.isOnline) isOnline!: boolean;
  @Getter(NetworksGettersTypes.getAssetsPriceInterval) assetsPriceInterval!: NodeJS.Timer | null;
  @Mutation(NetworksMutationTypes.SET_NETWORKS) setNetworks!: Fn<SetNetworksStatusProps>;
  @Mutation(NetworksMutationTypes.SET_ASSETS_PRICE) setPrices!: Fn<SetAssetsPriceProps>;
  @Mutation(AccountsMutationTypes.SET_ACCOUNTS) setAccounts!: Fn<SetAccountsProps>;
  @Mutation(AccountsMutationTypes.SET_SELECTED_FIAT) setSelectedFiat!: Fn<string>;
  @Mutation(AccountsMutationTypes.SET_SELECTED_NETWORK) setSelectedNetwork!: (network: string) => void;
  @Action(NetworksActionTypes.FETCH_FIATS) fetchFiats!: AsyncFn;
  @Action(SoraCardActionTypes.GET_USER_STATUS) getUserStatus!: AsyncFn;
  @Action(AccountsActionTypes.ONLINE_STATUS_UPDATE) updateOnlineStatus!: AsyncFn;
  @Action(AccountsActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: AsyncFn<AccountJson>;
  @Action(AccountsActionTypes.SET_BALANCE) setBalance!: AsyncFn<BalanceJson>;
  @Action(ExtensionActionTypes.SUBSCRIBE_EXTENSION_REQUESTS) extensionSubscribe!: AsyncFn;
  @Action(ExtensionActionTypes.FETCH_FEATURES) fetchFeatures!: AsyncFn;
  @Mutation(ExtensionMutationTypes.SET_ONBOARDING) setOnboarding!: (payload: boolean) => void;

  get includeKeepAlive() {
    const components = ['Main'];

    if (this.showPolkaswapAlert) components.push('SwapForm');

    return components;
  }

  async created() {
    this.setupOnboarding();
    this.onUpdateOnlineStatus();
    if (IS_EXTENSION) this.extensionSubscribe();

    this.setupWallet();
    this.setupNetworks();
    this.setupBalance();
    this.fetchFiats();
    this.fetchFeatures();
    this.setupPrice();
    this.setupSWPing();
    this.getUserStatus(); // SORA Card
  }

  async setupOnboarding() {
    const isRequired = await isOnboardingRequired();

    if (isRequired) {
      this.$router.push({ name: Components.Onboarding });
    }
  }

  onUpdateOnlineStatus() {
    this.updateOnlineStatus();
  }

  setupSWPing() {
    setInterval(() => {
      try {
        pingServiceWorker();
      } catch (error) {
        window.close();
      }
    }, 20000);
  }

  async setupBalance() {
    const balance = await subscribeBalance((balanceUpdates) => {
      this.setBalance(balanceUpdates);
    });

    this.setBalance(balance);
  }

  async setupNetworks() {
    const nets = await subscribeNetworkMap((networksUpdates) => {
      this.setNetworks({ networks: Object.values(networksUpdates) });
    });

    this.setNetworks({ networks: Object.values(nets) });
  }

  async setupPrice() {
    const prices = await subscribePrice((priceUpdates) => {
      this.updatePrice(priceUpdates);
    });

    this.updatePrice(prices);
  }

  updatePrice({ currency, tokenPriceMap, tokenPriceChange }: PriceJson) {
    this.setSelectedFiat(currency);
    this.setPrices({ tokenPriceMap, tokenPriceChange });
  }

  onAccountUpdate(accounts: AccountJson[], isMobileUpdate = false) {
    const selectedAccount = accounts.find((account) => account.active);
    this.setAccounts({ accounts, isMobileUpdate });

    if (selectedAccount || !this.wallets.length) {
      this.setSelectedWallet(selectedAccount);
      this.setSelectedNetwork(selectedAccount && selectedAccount.network ? selectedAccount.network : ALL_NETWORKS);
    }
  }

  async setupWallet() {
    const accounts = await subscribeAddresses((accounts) => {
      this.onAccountUpdate(accounts, true);
    });

    const addresses = await subscribeAccounts((accounts) => {
      this.onAccountUpdate(accounts);
    });

    this.onAccountUpdate([...accounts, ...addresses]);
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
  background-image: url('@/assets/background.png');
  background-position: center;
  background-size: cover;
}
</style>
