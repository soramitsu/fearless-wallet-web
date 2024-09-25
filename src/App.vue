<template>
  <div id="app" :class="appMainClass">
    <keep-alive :include="includeKeepAlive">
      <router-view />
    </keep-alive>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Mutation, Getter, Action } from 'vuex-class';
import { ALL_NETWORKS } from './consts/networks';
import { setTitle } from './helpers/common';
import type { ChainNftState } from '@extension-base/services/nft-service/types';
import type { AccountJson, BalanceJson, PriceJson } from '@extension-base/background/types/types';
import type { SetAccountsProps, SetNetworksStatusProps, SetAssetsPriceProps, SetSoraFee } from '@/store';
import type { AsyncFn, Fn } from '@/interfaces';
import { Components } from '@/router/routes';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import { MutationTypes as ExtensionMutationTypes } from '@/store/extension/mutations';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import {
  soraFeesSubscribe,
  isOnboardingRequired,
  pingServiceWorker,
  subscribeAccounts,
  subscribeAddresses,
  subscribeBalance,
  subscribeNetworkMap,
  subscribePrice,
} from '@/extension/messaging';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';
import { IS_EXTENSION, IS_PRODUCTION, IS_TEST_ONLY } from '@/consts/global';
import { ActionTypes as SoraCardActionTypes } from '@/store/soraCard/actions';
import { getNftSubscribe } from '@/extension/messaging/nfts';

@Component({})
export default class App extends Vue {
  @Getter(AccountsGettersTypes.showPolkaswapAlert) showPolkaswapAlert!: boolean;
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];
  @Mutation(NetworksMutationTypes.SET_NETWORKS) setNetworks!: Fn<SetNetworksStatusProps>;
  @Mutation(NetworksMutationTypes.SET_ASSETS_PRICE) setPrices!: Fn<SetAssetsPriceProps>;
  @Mutation(NetworksMutationTypes.SET_SORA_FEES) setSoraFees!: Fn<SetSoraFee>;
  @Mutation(AccountsMutationTypes.SET_ACCOUNTS) setAccounts!: Fn<SetAccountsProps>;
  @Mutation(AccountsMutationTypes.SET_SELECTED_FIAT) setSelectedFiat!: Fn<string>;
  @Mutation(AccountsMutationTypes.SET_NFTS) setNfts!: Fn<ChainNftState>;
  @Mutation(AccountsMutationTypes.SET_SELECTED_NETWORK) setSelectedNetwork!: (network: string) => void;
  @Mutation(ExtensionMutationTypes.SET_ONBOARDING) setOnboarding!: (payload: boolean) => void;
  @Action(NetworksActionTypes.FETCH_FIATS) fetchFiats!: AsyncFn;
  @Action(SoraCardActionTypes.GET_USER_STATUS) getUserStatus!: AsyncFn;
  @Action(AccountsActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: AsyncFn<AccountJson>;
  @Action(AccountsActionTypes.SET_BALANCE) setBalance!: AsyncFn<BalanceJson>;
  @Action(ExtensionActionTypes.SUBSCRIBE_EXTENSION_REQUESTS) extensionSubscribe!: AsyncFn;
  @Action(ExtensionActionTypes.FETCH_FEATURES) fetchFeatures!: AsyncFn;

  pingInterval: NodeJS.Timer | undefined = undefined;

  get includeKeepAlive() {
    const components = ['Main'];

    // Нужно чтобы не слетало состояние SwapForm при переходе к дисклеймеру
    if (this.showPolkaswapAlert) components.push('SwapForm');

    return components;
  }

  get appMainClass() {
    return IS_EXTENSION ? 'fw-extension' : 'fw-web';
  }

  async created() {
    if (IS_EXTENSION) this.extensionSubscribe();

    setTitle();

    this.setupWallet();
    this.setupNetworks();
    await this.setupBalance();
    this.setupNfts();
    await this.fetchFiats();
    this.setupPrice();
    this.setupSWPing();

    await this.fetchFeatures();

    this.getUserStatus(); // SORA Card
  }

  async mounted() {
    if (IS_PRODUCTION || IS_TEST_ONLY) {
      const isRequired = await isOnboardingRequired();

      if (isRequired) this.$router.push({ name: Components.Onboarding });
    }
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
    const balance = await subscribeBalance((balanceUpdates) => this.setBalance(balanceUpdates));

    this.setBalance(balance);
  }

  async setupNfts() {
    const ownedNfts = await getNftSubscribe((nftUpdates) => this.setNfts(nftUpdates));

    this.setNfts(ownedNfts);
  }

  async setupNetworks() {
    const nets = await subscribeNetworkMap((networksUpdates) =>
      this.setNetworks({ networks: Object.values(networksUpdates) })
    );

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
    const accounts = await subscribeAccounts((accounts) => this.onAccountUpdate(accounts));
    console.info('[debug], accounts', accounts);

    this.onAccountUpdate(accounts);

    subscribeAddresses((accounts) => this.onAccountUpdate(accounts, true));
    soraFeesSubscribe((fees) => this.setSoraFees({ fees }));
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
