<template>
  <div id="app">
    <div class="drag"></div>
    <!-- <Transaction /> -->
    <!-- <Authorize /> -->
    <ManageAuths />
    <!-- <router-view /> -->
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Mutation } from 'vuex-class';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { SetSelectedWalletProps } from '@/store/accounts/types';
import type { TMutation } from '@/interfaces/common';
import type { BehaviorSubject } from 'rxjs';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import keyring from '@polkadot/ui-keyring';
import NetworksController from '@/controllers/networksController';
import Transaction from '@/screens/signing/Transaction.vue';
import ManageAuths from '@/screens/authorize/ManageAuths.vue';
import Authorize from '@/screens/authorize/Authorize.vue';
@Component({
  components: {
    Transaction,
    Authorize,
    ManageAuths,
  },
})
export default class App extends Vue {
  subscribeAccounts!: BehaviorSubject<SubjectInfo>;
  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<SetSelectedWalletProps>;

  get style() {
    return { 'background-image': 'url(./img/background.9b667fcd.png)' };
  }

  async mounted() {
    const { loadNetworksInfo, loadAssetsInfo, loadTokensPrice, subscribeToBalancesOfNetworks } = NetworksController;
    await Promise.all([loadNetworksInfo(), loadAssetsInfo()]);
    await loadTokensPrice();

    let loadHistory = true;
    this.subscribeAccounts = keyring.accounts.subject;
    this.subscribeAccounts.subscribe(async (accounts) => {
      const selectedWalletAddress = Object.entries(accounts).find(([, { type }]) => type !== 'ethereum')?.[0];

      if (selectedWalletAddress) this.setSelectedWallet({ selectedWalletAddress });

      await subscribeToBalancesOfNetworks(accounts, loadHistory);

      loadHistory = false;
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
  padding: 0 16px 16px 16px;
  background-image: url(./assets/background.png);

  .drag {
    height: 16px;
    -webkit-app-region: drag;
  }
}
</style>
