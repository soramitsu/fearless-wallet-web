<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Mutation } from 'vuex-class';
import { MutationTypes as AccountsMutationTypes } from './store/accounts/mutations';
import type { BehaviorSubject } from 'rxjs';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import keyring from '@polkadot/ui-keyring';
import NetworksController from './controllers/networksController';

@Component
export default class App extends Vue {
  networksController = new NetworksController();
  subscribeAccounts!: BehaviorSubject<SubjectInfo>;

  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: (props: Record<string, string>) => void;

  async mounted() {
    await this.networksController.loadNetworksInfo();

    this.subscribeAccounts = keyring.accounts.subject;
    this.subscribeAccounts.subscribe((accounts) => {
      this.setSelectedWallet({ selectedWalletAddress: Object.keys(accounts)[0] });

      // TODO:refactoring and optimizing subscriptions, subscribe only to new accounts
      this.networksController.subscribeToNetworks(accounts);
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
  height: var(--extension-height);
  width: var(--extension-width);
  border-radius: var(--default-border-radius);
  color: white;
  text-align: center;
  margin: 0 auto;
  padding: 16px;
  background: url(./assets/background.png);
}
</style>
