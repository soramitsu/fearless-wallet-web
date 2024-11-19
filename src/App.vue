<template>
  <div id="app">
    <keep-alive :include="includeKeepAlive">
      <router-view />
    </keep-alive>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { ALL_NETWORKS } from './consts/networks';
import { setTitle } from './helpers/common';
import { useExtensionStore } from './stores/extension';
import { useNetworksStore } from './stores/networks';
import { useAccountsStore } from './stores/accounts';
import { useSoraCardStore } from './stores/soraCard';
import type { AccountJson, PriceJson } from '@extension-base/background/types/types';
import {
  soraFeesSubscribe,
  pingServiceWorker,
  subscribeAccounts,
  subscribeAddresses,
  subscribeBalance,
  subscribeNetworkMap,
  subscribePrice,
  lockExtension,
  subscribeSelectedNetworks,
} from '@/extension/messaging';
import { IS_EXTENSION } from '@/consts/global';
import { getNftSubscribe } from '@/extension/messaging/nfts';

@Component({})
export default class App extends Vue {
  extensionStore = useExtensionStore();
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();
  soraCardStore = useSoraCardStore();

  pingInterval: NodeJS.Timer | undefined = undefined;

  get includeKeepAlive() {
    const components = ['Main'];

    // It was necessary to prevent the SwapForm state from being reset when navigating to the Disclaimer page
    if (this.accountsStore.showPolkaswapAlert) components.push('SwapForm');

    return components;
  }

  async created() {
    if (IS_EXTENSION) this.extensionStore.subscribeExtensionRequests();

    lockExtension();

    setTitle();

    this.setupWallet();
    this.setupNetworks();
    this.setupBalance();
    this.setupNfts();
    this.networksStore.fetchFiats();
    this.setupPrice();
    this.setupSWPing();

    await this.extensionStore.fetchFeatures();

    this.soraCardStore.getUserStatus(); // SORA Card
  }

  setupSWPing() {
    this.pingInterval = setInterval(() => {
      try {
        pingServiceWorker();
      } catch (error) {
        window.close();
      }
    }, 20000);
  }

  destroyed() {
    clearInterval(this.pingInterval);
  }

  async setupBalance() {
    const balance = await subscribeBalance((balanceUpdates) => this.accountsStore.setBalance(balanceUpdates));

    this.accountsStore.setBalance(balance);
  }

  async setupNfts() {
    const ownedNfts = await getNftSubscribe((nftUpdates) => this.accountsStore.setNfts(nftUpdates));

    this.accountsStore.setNfts(ownedNfts);
  }

  async setupNetworks() {
    const nets = await subscribeNetworkMap((networksUpdates) =>
      this.networksStore.setNetworks({ networks: Object.values(networksUpdates) })
    );

    this.networksStore.setNetworks({ networks: Object.values(nets) });

    await subscribeSelectedNetworks((network) => this.accountsStore.setSelectedNetwork(network));
  }

  async setupPrice() {
    const prices = await subscribePrice((priceUpdates) => {
      this.updatePrice(priceUpdates);
    });

    this.updatePrice(prices);
  }

  updatePrice({ currency, tokenPriceMap, tokenPriceChange }: PriceJson) {
    this.accountsStore.setSelectedFiat(currency);
    this.networksStore.setPrices({ tokenPriceMap, tokenPriceChange });
  }

  onAccountUpdate(accounts: AccountJson[], isMobileUpdate = false) {
    const selectedAccount = accounts.find((account) => account.active);

    this.accountsStore.setAccounts({ accounts, isMobileUpdate });

    if (selectedAccount || !this.accountsStore.accounts.length) {
      this.accountsStore.setSelectedWallet(selectedAccount);
      this.accountsStore.setSelectedNetwork(
        selectedAccount && selectedAccount.network ? selectedAccount.network : ALL_NETWORKS
      );
    }
  }

  async setupWallet() {
    const accounts = await subscribeAccounts((accounts) => this.onAccountUpdate(accounts));

    this.onAccountUpdate(accounts);

    subscribeAddresses((accounts) => this.onAccountUpdate(accounts, true));
    soraFeesSubscribe((fees) => this.networksStore.setSoraFees({ fees }));
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
