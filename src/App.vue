<template>
  <div id="app">
    <div class="drag"></div>

    <router-view />
  </div>
</template>

<script lang="ts">
import { keyring } from '@polkadot/ui-keyring';
import { Component, Vue } from 'vue-property-decorator';
import { Mutation } from 'vuex-class';
import store from './store';
import BaseApi from './util/BaseApi';
import type { SetSelectedWalletProps, setAccountsProps } from '@/store/accounts/types';
import type { TMutation } from '@/interfaces/common';
import type { BehaviorSubject } from 'rxjs';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import { ActionTypes as AuthActionTypes } from '@/store/auth/actions';
import { ActionTypes as SignActionTypes } from '@/store/sign/actions';

import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import NetworksController from '@/controllers/networksController';
import { accountController } from '@/controllers/accountController';

@Component({
  components: {
    Transaction,
    SignRequest,
  },
})
export default class App extends Vue {
  subscribeAccounts!: BehaviorSubject<SubjectInfo>;

  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<SetSelectedWalletProps>;
  @Mutation(AccountsMutationTypes.SET_ACCOUNTS) setAccounts!: TMutation<setAccountsProps>;

  get style() {
    return { 'background-image': 'url(./img/background.9b667fcd.png)' };
  }

  async mounted() {
    let loadHistory = true;
    const { loadNetworks, loadAssets, loadFiats, loadTokensPrice, subscribeToBalancesOfNetworks } = NetworksController;

    await store.dispatch(AuthActionTypes.SUBSCRIBE_TO_DAPP_EVENTS); //TODO refactor to @Action
    await store.dispatch(SignActionTypes.SUBSCRIBE_SIGN_EVENTS); //TODO refactor to @Action

    await Promise.all([loadNetworks(), loadAssets(), loadFiats()]);
    await loadTokensPrice();

    this.subscribeAccounts = keyring.accounts.subject;
    this.subscribeAccounts.subscribe(async (accounts) => {
      this.setAccounts({ accounts });

      await subscribeToBalancesOfNetworks(accounts, loadHistory);

      loadHistory = false;
    });

    this.setWallet();
  }

  setWallet() {
    const LSSelectedWalletAddress = accountController.getSelectedWalletAddress();
    const selectedWalletAddress = LSSelectedWalletAddress || this.findWalletAddress();

    if (selectedWalletAddress) this.setSelectedWallet({ selectedWalletAddress });
  }

  findWalletAddress() {
    const accounts = BaseApi.getAccounts().map(({ address }) => BaseApi.getPair(address));

    const address = Object.entries(accounts).find(
      ([, { type, meta }]) => type !== 'ethereum' && !meta.isReplacedAccount
    )?.[0];

    return address ?? '';
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
  color: white;
  text-align: center;
  padding: 0 $default-padding $default-padding $default-padding;
  background-image: url(./assets/background.png);

  .drag {
    height: 16px;
    -webkit-app-region: drag;
  }
}
</style>
