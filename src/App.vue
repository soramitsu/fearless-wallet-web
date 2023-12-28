<template>
  <div id="app">
    <keep-alive :include="includeKeepAlive">
      <router-view />
    </keep-alive>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, onUnmounted } from 'vue';
import { useRouter } from 'vue-router/composables';
import { ALL_NETWORKS } from './consts/networks';
import { setTitle } from './helpers/common';
import type { AccountJson, PriceJson } from '@extension-base/background/types/types';
import { useStore } from '@/store';
import { Components } from '@/router/routes';
import {
  isOnboardingRequired,
  pingServiceWorker,
  subscribeAccounts,
  subscribeAddresses,
  subscribeBalance,
  subscribeNetworkMap,
  subscribePrice,
} from '@/extension/messaging';
import { IS_EXTENSION, IS_PRODUCTION } from '@/consts/global';

const store = useStore();
const router = useRouter();
const intervalId = ref<NodeJS.Timer | undefined>();
const showPolkaswapAlert = computed<boolean>(() => store.getters.showPolkaswapAlert);
const wallets = computed<AccountJson[]>(() => store.getters.getAccounts);

const includeKeepAlive = computed(() => {
  const components = ['Main'];

  if (showPolkaswapAlert.value) components.push('SwapForm');

  return components;
});

const setupSWPing = () => {
  intervalId.value = setInterval(() => {
    pingServiceWorker().catch(() => window.close());
  }, 20000);
};

const setupBalance = async () => {
  const balance = await subscribeBalance((balanceUpdates) => store.dispatch('SET_BALANCE', balanceUpdates));

  store.dispatch('SET_BALANCE', balance);
};

const setupNetworks = async () => {
  const nets = await subscribeNetworkMap((networksUpdates) =>
    store.commit('SET_NETWORKS', { networks: Object.values(networksUpdates) })
  );

  store.commit('SET_NETWORKS', { networks: Object.values(nets) });
};

const updatePrice = ({ currency, tokenPriceMap, tokenPriceChange }: PriceJson) => {
  store.commit('SET_SELECTED_FIAT', currency);
  store.commit('SET_ASSETS_PRICE', { tokenPriceMap, tokenPriceChange });
};

const setupPrice = async () => {
  const prices = await subscribePrice((priceUpdates) => {
    updatePrice(priceUpdates);
  });

  updatePrice(prices);
};

const onAccountUpdate = (accounts: AccountJson[], isMobileUpdate = false) => {
  const selectedAccount = accounts.find((account) => account.active);

  store.commit('SET_ACCOUNTS', { accounts, isMobileUpdate });

  if (selectedAccount || !wallets.value.length) {
    store.commit('SET_SELECTED_WALLET', selectedAccount);
    store.commit(
      'SET_SELECTED_NETWORK',
      selectedAccount && selectedAccount.network ? selectedAccount.network : ALL_NETWORKS
    );
  }
};

const setupWallet = async () => {
  const accounts = await subscribeAccounts((accounts) => {
    onAccountUpdate(accounts);
  });

  onAccountUpdate([...accounts]);

  subscribeAddresses((accounts) => {
    onAccountUpdate(accounts, true);
  });
};

onMounted(async () => {
  if (IS_EXTENSION) store.dispatch('SUBSCRIBE_EXTENSION_REQUESTS');

  setTitle();

  setupWallet();
  setupNetworks();
  setupBalance();
  store.dispatch('FETCH_FIATS');
  setupPrice();
  setupSWPing();

  await store.dispatch('FETCH_FEATURES');

  store.dispatch('GET_USER_STATUS'); // SORA Card

  if (IS_PRODUCTION) {
    const isRequired = await isOnboardingRequired();

    if (isRequired) router.push({ name: Components.Onboarding });
  }
});

onUnmounted(() => {
  clearInterval(intervalId.value);
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
