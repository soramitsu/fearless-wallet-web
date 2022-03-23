<template>
  <div id="app">
    <StartPage />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter, Action, Mutation } from 'vuex-class';
import { ActionTypes as ApiActionTypes } from './store/api/actions';
import { GettersTypes as AccountGettersTypes } from './store/account/getters';
import { GettersTypes as ApiGettersTypes } from './store/api/getters';
import { MutationTypes } from './store/api/mutations';
import { Networks } from './store/api/types';
import { formatBalance } from './util/balances';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import StartPage from './screens/startPage/StartPage.vue';
import { Account } from './store/account/types';
import keyring from '@polkadot/ui-keyring';
import AccountsStore from './storeChrome/Accounts';

@Component({
  components: {
    StartPage,
  },
})
export default class App extends Vue {
  url = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/2.0.1/chains/chains_dev.json';

  @Getter(AccountGettersTypes.getAccount) account!: Account;
  @Getter(AccountGettersTypes.getNickname) nickname!: string;

  get address() {
    return this.account?.address;
  }

  @Getter(ApiGettersTypes.getNetworksInfo) networksInfo!: Networks;
  @Action(ApiActionTypes.LOAD_NETWORKS_INFO) loadNetworksInfo: any;
  @Mutation(MutationTypes.SET_NETWORK_STATUS) setNetworkStatus: any;

  @Watch('account')
  subscribe() {
    this.subscribeToNetworks();
  }

  async loadNetworks(url: string): Promise<void> {
    await this.loadNetworksInfo({ url });
  }

  async subscribeToNetworks() {
    console.log('networksInfo', this.networksInfo);

    const networks = Object.entries(this.networksInfo);

    // to speed up, first connect to all networks
    for (const [netName, network] of networks) {
      try {
        network.api.connect();
      } catch (ex) {
        network.api.disconnect();
        this.setNetworkStatus({ name: netName, active: false });

        console.log(`Connection to api failed.`);
      }
    }

    for (const [netName, network] of networks) {
      await network.api.isReady;

      this.setNetworkStatus({ name: netName, active: true });

      try {
        network.api.rx.query.balances.account(this.address).subscribe(async (result) => {
          const balances = formatBalance(result as AccountData);

          const nullBalances = !Object.values(balances).find((value) => value !== '0');

          console.log(netName, balances);

          if (nullBalances) {
            network.api.disconnect();

            this.setNetworkStatus({ name: netName, active: false });
          }
        });
      } catch (ex) {
        console.log(`
          Subscribe to ${netName} failed
          ${ex}
        `);
      }
    }
  }

  async mounted() {
    await this.loadNetworks(this.url);

    // load all the keyring data
    keyring.loadAll({
      // store: new AccountsStore(),
      type: 'sr25519',
    });

    console.log('initialization completed');
  }
}
</script>

<style lang="scss" scoped>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  text-align: center;
  width: 320px;
  height: 500px;
}
</style>
