<template>
  <div id="app">
    <div class="drag"></div>

    <router-view />
  </div>
</template>

<script lang="ts">
import { keyring } from '@polkadot/ui-keyring';
import { Component, Vue } from 'vue-property-decorator';
import { Mutation, Getter, Action } from 'vuex-class';
import BaseApi from './util/BaseApi';
import type { SetSelectedWalletProps, setAccountsProps, Accounts, setAddressesProps } from '@/store/accounts/types';
import type { TAction, TMutation } from '@/interfaces/common';
import type { BehaviorSubject } from 'rxjs';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import { ActionTypes as AuthActionTypes } from '@/store/auth/actions';
import { ActionTypes as MetaActionTypes } from '@/store/metadata/actions';
import { ActionTypes as SignActionTypes } from '@/store/sign/actions';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import NetworksController from '@/controllers/networksController';
import { accountController } from '@/controllers/accountController';

@Component
export default class App extends Vue {
  subscribeAccounts!: BehaviorSubject<SubjectInfo>;
  subscribeAddresses!: BehaviorSubject<SubjectInfo>;

  @Getter(AccountsGettersTypes.getAccounts) accounts!: Accounts;
  @Getter(AccountsGettersTypes.getAddresses) addresses!: Accounts;

  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<SetSelectedWalletProps>;
  @Mutation(AccountsMutationTypes.SET_ACCOUNTS) setAccounts!: TMutation<setAccountsProps>;
  @Mutation(AccountsMutationTypes.SET_ADDRESSES) setAddresses!: TMutation<setAddressesProps>;

  @Action(AuthActionTypes.SUBSCRIBE_AUTH_REQUESTS) authSubscribe!: TAction<unknown>;
  @Action(SignActionTypes.SUBSCRIBE_SIGN_REQUESTS) signSubscribe!: TAction<unknown>;
  @Action(MetaActionTypes.SUBSCRIBE_METADATA_REQUESTS) metaSubscribe!: TAction<unknown>;

  async mounted() {
    const { loadJsons, connectToNodes, subscribeToBalancesOfNetworks } = NetworksController;

    await Promise.all([this.authSubscribe(), this.metaSubscribe(), this.signSubscribe()]);
    await loadJsons();
    await connectToNodes();

    this.subscribeAccounts = keyring.accounts.subject;
    this.subscribeAddresses = keyring.addresses.subject;

    this.subscribeAccounts.subscribe(async (accounts) => {
      const newAccounts = this.getNewAccounts(accounts, 'account');

      console.info('accounts', newAccounts);

      this.setAccounts({ accounts });

      await subscribeToBalancesOfNetworks(newAccounts);
    });

    this.subscribeAddresses.subscribe(async (addresses) => {
      const newAddresses = this.getNewAccounts(addresses, 'address');

      this.setAddresses({ addresses });

      await subscribeToBalancesOfNetworks(newAddresses);
    });

    this.setWallet();
  }

  getNewAccounts(accounts: SubjectInfo, type: 'account' | 'address') {
    const result = {} as SubjectInfo;

    for (const address in accounts) {
      if (type === 'account' && this.accounts[address] === undefined) {
        result[address] = accounts[address];
        continue;
      }

      if (type === 'address' && this.addresses[address] === undefined) result[address] = accounts[address];
    }

    return result;
  }

  setWallet() {
    const LSSelectedWalletAddress = accountController.getSelectedWalletAddress();
    const selectedWalletAddress = LSSelectedWalletAddress || BaseApi.getFirstSubstrateWalletAddress();

    if (selectedWalletAddress) this.setSelectedWallet({ selectedWalletAddress });
  }

  beforeUnmount() {
    this.subscribeAccounts.unsubscribe();
    this.subscribeAddresses.unsubscribe();
  }
}
</script>

<style lang="scss">
body {
  background-color: rgb(54, 49, 52);
}
</style>

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
  margin: 0 auto;

  .drag {
    height: 16px;
    -webkit-app-region: drag;
  }
}
</style>
