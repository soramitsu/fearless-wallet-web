<template>
  <div id="app" :class="appMainClass">
    <keep-alive :include="includeKeepAlive">
      <router-view />
    </keep-alive>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { initStorage } from '@extension-base/stores/Storage';
import { ALL_NETWORKS } from './consts/networks';
import { useExtensionStore } from './stores/extension';
import { useNetworksStore } from './stores/networks';
import { useAccountsStore } from './stores/accounts';
import { Components } from './router/routes';
import { IS_POPUP } from './consts/globalClient';
import type { AccountJson, PriceJson } from '@extension-base/background/types/types';
import { setTitle } from '@/helpers/only-web';
import {
  soraFeesSubscribe,
  pingServiceWorker,
  subscribeAccounts,
  subscribeBalance,
  subscribeNetworkMap,
  subscribePrice,
  lockExtension,
  subscribeSelectedNetworks,
  updateCurrentNetwork,
} from '@/extension/messaging';
import { IS_EXTENSION } from '@/consts/global';
import { getNftSubscribe } from '@/extension/messaging/nfts';

@Component({})
export default class App extends Vue {
  extensionStore = useExtensionStore();
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();

  pingInterval: NodeJS.Timer | undefined = undefined;

  get includeKeepAlive() {
    const components = ['Main'];

    // It was necessary to prevent the SwapForm state from being reset when navigating to the Disclaimer page
    if (this.accountsStore.showPolkaswapAlert) components.push('SwapForm');

    return components;
  }

  get appMainClass() {
    return IS_EXTENSION ? 'fw-extension' : 'fw-web';
  }

  async created() {
    lockExtension();

    if (IS_EXTENSION) {
      const hasRequests = await this.extensionStore.subscribeExtensionRequests();

      if (IS_POPUP && hasRequests) return;
    }

    if (!IS_EXTENSION) await this.setupWeb();

    setTitle();

    this.setupWallet();
    this.setupNetworks();
    this.networksStore.getFiats();

    await this.setupBalance();

    this.setupNfts();
    this.setupPrice();
    this.setupSWPing();

    this.extensionStore.fetchFeatures();
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
    const balance = await subscribeBalance((balanceUpdates) => {
      this.accountsStore.setIsBalanceLoading(false);
      this.accountsStore.setBalance(balanceUpdates);
    });

    this.accountsStore.setBalance(balance);
  }

  async setupWeb() {
    await cryptoWaitReady()
      .then(() => {
        // TODO send message to SW, dont use import state, MigrationService

        // state.keyringService.loadAll();
        // state.eventService.emit('crypto.ready', true);

        keyring.restoreKeyringPassword();

        // MigrationService.start();
      })
      .catch((error) => console.error('initialization failed', error));

    await initStorage();
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

  updatePrice({ fiat, tokenPriceMap, tokenPriceChange }: PriceJson) {
    this.accountsStore.setSelectedFiat(fiat);
    this.networksStore.setPrices({ tokenPriceMap, tokenPriceChange });
  }

  onAccountUpdate(accounts: AccountJson[]) {
    const selectedAccount = accounts.find((account) => account.active);

    this.accountsStore.setAccounts({ accounts });

    if (!selectedAccount) return;

    this.accountsStore.setSelectedWallet(selectedAccount);

    if (this.networksStore.networks.length === 1) {
      updateCurrentNetwork(this.networksStore.networks[0].name);

      this.accountsStore.setSelectedNetwork(this.networksStore.networks[0].name);
    } else this.accountsStore.setSelectedNetwork(selectedAccount?.network ?? ALL_NETWORKS);

    if (selectedAccount?.address !== this.accountsStore.selectedWallet.address) {
      this.$router.push({ name: Components.Wallet }).catch(() => {});
    }
  }

  async setupWallet() {
    const accounts = await subscribeAccounts((accounts) => this.onAccountUpdate(accounts));

    this.onAccountUpdate(accounts);

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
  height: 100vh;
  color: white;
  text-align: center;
  padding: $default-padding;
  background-image: url('@/assets/background.png');
  background-position: center;
  background-size: cover;
}

.fw-web {
  font-size: 12px;
  margin: auto;
  min-height: 100dvh;
  min-width: 100dvw;
}

.fw-extension {
  font-size: 16px;
  margin: 0 auto;
  min-height: $extension-height;
  min-width: $extension-width;
  width: $extension-width;
}
</style>
