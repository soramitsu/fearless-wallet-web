<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Mutation } from 'vuex-class';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { SetSelectedWalletAddressProps } from '@/store/accounts/types';
import type { BehaviorSubject } from 'rxjs';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import keyring from '@polkadot/ui-keyring';
import NetworksController from '@/controllers/networksController';

@Component
export default class App extends Vue {
  networksController = new NetworksController();
  subscribeAccounts!: BehaviorSubject<SubjectInfo>;

  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: (
    props: SetSelectedWalletAddressProps
  ) => void;

  async mounted() {
    await Promise.all([this.networksController.loadNetworksInfo(), this.networksController.loadAssetsInfo()]);
    await this.networksController.loadTokensPrice();

    this.subscribeAccounts = keyring.accounts.subject;
    this.subscribeAccounts.subscribe((accounts) => {
      const selectedWalletAddress = Object.entries(accounts).find(([, { type }]) => type !== 'ethereum')?.[0];

      if (selectedWalletAddress) this.setSelectedWallet({ selectedWalletAddress });

      // TODO:refactoring and optimizing subscriptions, subscribe only to new accounts
      this.networksController.subscribeToBalancesOfNetworks(accounts);

      console.log('accounts', accounts);
    });
  }

  beforeUnmount() {
    this.subscribeAccounts.unsubscribe();
  }
}
</script>

<style lang="scss" scoped>
#app {
  font-family: 'Sora';
  font-style: normal;
  font-feature-settings: 'tnum' on, 'lnum' on;
  height: $extension-height;
  width: $extension-width;
  border-radius: $default-border-radius;
  color: white;
  text-align: center;
  padding: 16px;
  background-image: url(./assets/background.png);
}
</style>
