<template>
  <div id="app" class="sora-theme-provider" data-theme="dark" :class="appMainClass">
    <SNotificationsProvider vertical="top" horizontal="right" absolute>
      <NotificationsBridge />
      <DialogHost />
      <keep-alive :include="includeKeepAlive">
        <router-view />
      </keep-alive>
    </SNotificationsProvider>
  </div>
</template>

<script lang="ts" setup>
import { computed, defineComponent, onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { initStorage } from '@extension-base/stores/Storage';
import { chrome } from '@extension-base/utils/crossenv';
import { useNotifications } from '@soramitsu-ui/ui';
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
import { setNotificationsApi } from '@/plugins/soramitsuUI';
import DialogHost from '@/components/DialogHost.vue';

const extensionStore = useExtensionStore();
const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const router = useRouter();
const route = useRoute();
const pingInterval = ref<ReturnType<typeof setInterval> | null>(null);

const includeKeepAlive = computed(() => {
  const components = ['Main'];

  // It was necessary to prevent the SwapForm state from being reset when navigating to the Disclaimer page
  if (accountsStore.showPolkaswapAlert) components.push('SwapForm');

  return components;
});

const appMainClass = computed(() => (IS_EXTENSION ? 'fw-extension' : 'fw-web'));

const NotificationsBridge = defineComponent({
  name: 'NotificationsBridge',
  setup() {
    const api = useNotifications();

    onMounted(() => setNotificationsApi(api));
    onUnmounted(() => setNotificationsApi(null));

    return () => null;
  },
});

const setupSWPing = () => {
  pingInterval.value = setInterval(() => {
    try {
      pingServiceWorker();
    } catch (_error) {
      window.close();
    }
  }, 20000);
};

const setupBalance = async () => {
  const callback = (balance: BalanceJson) => {
    accountsStore.setIsBalanceLoading(false);
    accountsStore.setBalance(balance);
  };

  const balance = await subscribeBalance(callback);

  callback(balance);
};

const setupWeb = async () => {
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
};

const setupNfts = async () => {
  const ownedNfts = await getNftSubscribe((nftUpdates) => accountsStore.setNfts(nftUpdates));

  accountsStore.setNfts(ownedNfts);
};

const setupNetworks = async () => {
  const nets = await subscribeNetworkMap((networksUpdates) =>
    networksStore.setNetworks({ networks: Object.values(networksUpdates) })
  );

  networksStore.setNetworks({ networks: Object.values(nets) });

  await subscribeSelectedNetworks((network) => accountsStore.setSelectedNetwork(network));
};

const updatePrice = ({ fiat, tokenPriceMap, tokenPriceChange }: PriceJson) => {
  accountsStore.setSelectedFiat(fiat);
  networksStore.setPrices({ tokenPriceMap, tokenPriceChange });
};

const setupPrice = async () => {
  const prices = await subscribePrice((priceUpdates) => {
    updatePrice(priceUpdates);
  });

  updatePrice(prices);
};

const onAccountUpdate = (accounts: AccountJson[]) => {
  const selectedAccount = accounts.find((account) => account.active);
  const isOnAddWallet = route.name === Components.AddWallet;
  const currentSelectedAddress = accountsStore.selectedWallet?.address;

  // если новый аккаунт отличается и мы не нахоимся на форме добавления аккаунта, тогда делаем редирект
  // это любой кейс смены аккаунта за исключением выше описанного
  if (selectedAccount?.address !== currentSelectedAddress && !isOnAddWallet) {
    router.push({ name: Components.Wallet }).catch(() => {});
  }

  accountsStore.setAccounts({ accounts });

  if (!selectedAccount) return;

  accountsStore.setSelectedWallet(selectedAccount);
  accountsStore.setSelectedNetwork(selectedAccount.network ?? ALL_NETWORKS);
};

const setupWallet = async () => {
  const accounts = await subscribeAccounts(onAccountUpdate);

  onAccountUpdate(accounts);

  soraFeesSubscribe((fees) => networksStore.setSoraFees({ fees }));
};

onMounted(async () => {
  lockExtension();

  setupWallet();

  if (IS_EXTENSION) {
    const win = await chrome.windows.getCurrent();
    const hasRequests = await extensionStore.subscribeExtensionRequests();

    if (win.type === 'popup') {
      const popupIds = await getPopupIds();

      if (popupIds.includes(win.id ?? 0) && hasRequests) return;
    }
  }

  if (!IS_EXTENSION) await setupWeb();

  setTitle();

  setupNetworks();
  networksStore.getFiats();

  await setupBalance();

  setupNfts();
  setupPrice();
  setupSWPing();

  extensionStore.fetchFeatures();
});

onBeforeUnmount(() => {
  if (pingInterval.value) {
    clearInterval(pingInterval.value);
    pingInterval.value = null;
  }
});
</script>

<style lang="scss">
html,
body {
  font-family: 'Sora', sans-serif;
  font-style: normal;
  font-feature-settings:
    'tnum' on,
    'lnum' on;
  min-height: 100%;
}

body {
  background-color: rgb(54, 49, 52);
}
</style>

<style lang="scss" scoped>
#app {
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
