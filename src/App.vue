<template>
  <div id="app" :class="appMainClass">
    <keep-alive :include="includeKeepAlive">
      <router-view />
    </keep-alive>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { initStorage } from '@extension-base/stores/Storage';
import { chrome } from '@extension-base/utils/crossenv';
import { ALL_NETWORKS } from './consts/networks';
import { useExtensionStore } from './stores/extension';
import { useNetworksStore } from './stores/networks';
import { useAccountsStore } from './stores/accounts';
import { Components } from './router/routes';
import type { AccountJson, BalanceJson, PriceJson } from '@extension-base/background/types/types';
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
} from '@/extension/messaging';
import { IS_EXTENSION } from '@/consts/global';
import { getNftSubscribe } from '@/extension/messaging/nfts';
import { getPopupIds } from '@/extension/messaging/popup';

export default defineComponent({ name: 'App' ,
  data() {
    return {
      extensionStore: useExtensionStore(),
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      pingInterval: undefined,
    };
  },
  computed: {
    includeKeepAlive() {
      const components = ['Main'];

          // It was necessary to prevent the SwapForm state from being reset when navigating to the Disclaimer page
          if (this.accountsStore.showPolkaswapAlert) components.push('SwapForm');

          return components;
    },
    appMainClass() {
      return IS_EXTENSION ? 'fw-extension' : 'fw-web';
    },
  },
  async created() {
    lockExtension();

        this.setupWallet();

        if (IS_EXTENSION) {
          const win = await chrome.windows.getCurrent();
          const hasRequests = await this.extensionStore.subscribeExtensionRequests();

          if (win.type === 'popup') {
            const popupIds = await getPopupIds();

            if (popupIds.includes(win.id ?? 0) && hasRequests) return;
          }
        }

        if (!IS_EXTENSION) await this.setupWeb();

        setTitle();

        this.setupNetworks();
        this.networksStore.getFiats();

        await this.setupBalance();

        this.setupNfts();
        this.setupPrice();
        this.setupSWPing();

        this.extensionStore.fetchFeatures();
  },
  unmounted() {
    clearInterval(this.pingInterval);
  },
  methods: {
    setupSWPing() {
      this.pingInterval = setInterval(() => {
            try {
              pingServiceWorker();
            } catch {
              window.close();
            }
          }, 20000);
    },
    async setupBalance() {
      const callback = (balance: BalanceJson) => {
            this.accountsStore.setIsBalanceLoading(false);
            this.accountsStore.setBalance(balance);
          };

          const balance = await subscribeBalance(callback);

          callback(balance);
    },
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
    },
    async setupNfts() {
      const ownedNfts = await getNftSubscribe((nftUpdates) => this.accountsStore.setNfts(nftUpdates));

          this.accountsStore.setNfts(ownedNfts);
    },
    async setupNetworks() {
      const nets = await subscribeNetworkMap((networksUpdates) =>
            this.networksStore.setNetworks({ networks: Object.values(networksUpdates) })
          );

          this.networksStore.setNetworks({ networks: Object.values(nets) });

          await subscribeSelectedNetworks((network) => this.accountsStore.setSelectedNetwork(network));
    },
    async setupPrice() {
      const prices = await subscribePrice((priceUpdates) => {
            this.updatePrice(priceUpdates);
          });

          this.updatePrice(prices);
    },
    updatePrice({ fiat, tokenPriceMap, tokenPriceChange }: PriceJson) {
      this.accountsStore.setSelectedFiat(fiat);
          this.networksStore.setPrices({ tokenPriceMap, tokenPriceChange });
    },
    onAccountUpdate(accounts: AccountJson[]) {
      const selectedAccount = accounts.find((account) => account.active);

          // если новый аккаунт отличается и мы не нахоимся на форме добавления аккаунта, тогда делаем редирект
          // это любой кейс смены аккаунта за исключением выше описанного
          if (
            selectedAccount?.address !== this.accountsStore.selectedWallet.address &&
            this.$route.name !== Components.AddWallet
          ) {
            this.$router.push({ name: Components.Wallet }).catch(() => {});
          }

          this.accountsStore.setAccounts({ accounts });

          if (!selectedAccount) return;

          this.accountsStore.setSelectedWallet(selectedAccount);
          this.accountsStore.setSelectedNetwork(selectedAccount?.network ?? ALL_NETWORKS);
    },
    async setupWallet() {
      const accounts = await subscribeAccounts(this.onAccountUpdate);

          this.onAccountUpdate(accounts);

          soraFeesSubscribe((fees) => this.networksStore.setSoraFees({ fees }));
    },
  },
});
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
