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

<style lang="scss">
#app {
  ::-webkit-scrollbar {
    width: 6px;
  }

  ::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.25);
    border-radius: var(--default-border-radius);

    &:hover {
      background-color: rgba(255, 255, 255, 0.15);
    }
  }

  textarea,
  input {
    color: var(--pink-lavender-color);
  }

  .s-input {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background-color: rgba(255, 255, 255, 0.05);
    clip-path: var(--default-clip-path-left-top-and-right-bottom);
    padding-left: 25px;
  }

  .s-select {
    clip-path: var(--default-clip-path-left-top-and-right-bottom);
  }

  .s-select .el-input__inner {
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 25px;
  }

  .el-input__inner {
    font-size: 16px;
  }

  .s-select .s-placeholder {
    color: rgba(255, 255, 255, 0.75);
    font-size: 12px;
    margin-top: 12px;
    padding-left: 25px;
  }

  .s-select input {
    padding-left: 25px;
  }

  .s-input .s-placeholder {
    color: rgba(255, 255, 255, 0.75);
    font-size: 12px;
  }

  .s-select .el-select i.el-icon-arrow-up:before {
    color: rgba(255, 255, 255, 0.5) !important;
  }

  .s-placeholder + .el-input {
    padding-top: 15px;
  }
}
</style>

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
