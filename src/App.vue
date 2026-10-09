<template>
  <div id="app" :class="appMainClass">
    <keep-alive :include="includeKeepAlive">
      <router-view />
    </keep-alive>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

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
import { markAccountsReady } from '@/bootstrap/accountsReady';

export default defineComponent({
  name: 'App',
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
        this.accountsStore.selectedWallet.address &&
        selectedAccount?.address !== this.accountsStore.selectedWallet.address &&
        this.$route.name !== Components.AddWallet
      ) {
        this.$router.push({ name: Components.Wallet }).catch(() => {});
      }

      this.accountsStore.setAccounts({ accounts });

      if (selectedAccount) {
        this.accountsStore.setSelectedWallet(selectedAccount);
        this.accountsStore.setSelectedNetwork(selectedAccount?.network ?? ALL_NETWORKS);
      }
      markAccountsReady();
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
  box-sizing: border-box;
  font-family: var(--s-font-family-default);
  font-style: normal;
  font-feature-settings:
    'tnum' on,
    'lnum' on;
  height: 100vh;
  color: white;
  text-align: center;
  padding: $default-padding;
  background-image: url('@/assets/background.png');
  background-position: center;
  background-size: cover;
}

.fw-web {
  font-size: 16px;
  margin: auto;
  min-height: 100dvh;
  width: 100%;
  max-width: 1120px;
  min-width: 0;
}

.fw-extension {
  font-size: 16px;
  margin: 0 auto;
  min-height: min($extension-height, 100dvh);
  min-width: 0;
  width: $extension-width;
  max-width: 100vw;
}
</style>

<style lang="scss">
.fw-web {
  .main-content {
    overflow: auto;
  }
  .main-child {
    overflow: auto;
  }
  .transfer-form,
  .add-wallet,
  .welcome-page {
    width: 100%;
    max-width: 680px;
    margin-inline: auto;
  }
  .main > .header {
    min-height: 64px;
    height: auto;
    gap: 16px;
  }
  .menu {
    margin-top: 16px;
  }
  @media (max-width: 620px) {
    .main > .header {
      flex-wrap: wrap;
      gap: 8px;
      min-height: 104px;
    }
    .main > .header .header-part {
      min-width: 0;
    }
    .main > .header .header-part-left {
      flex: 0 0 100%;
    }
    .main > .header .header-part-right {
      flex: 0 0 100%;
    }
    .main > .header .wallet-name .name {
      max-width: 160px;
      font-size: 1rem;
    }
    .main > .header .logo-container {
      width: 44px;
    }
    .wallet-ecosystem {
      flex-direction: column;
    }
    .content-form-ecosystem {
      width: 100%;
      min-width: 0;
    }
    .menu-item .name {
      font-size: 0.75rem;
    }
  }
}
button:focus-visible,
summary:focus-visible,
select:focus-visible {
  outline: 2px solid #ee0077;
  outline-offset: 3px;
}
summary {
  cursor: pointer;
  padding-block: 12px;
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
</style>
