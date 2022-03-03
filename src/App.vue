<template>
  <div id="app">
    <s-card shadow="always" size="small" border-radius="mini">
      <template #header>Here will be a header</template>
      <div class="body-test">Here will be a content</div>
    </s-card>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Action, Mutation } from 'vuex-class';
import { ActionTypes } from './store/api/actions';
import { GettersTypes } from './store/api/getters';
import { MutationTypes } from './store/api/mutations';

import { Networks } from './store/api/types';
import { formatBalance } from './util/balances';
import type { AccountData } from '@polkadot/types/interfaces/balances';

@Component({})
export default class App extends Vue {
  url = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/2.0.1/chains/chains_dev.json';
  address = '5DrEiPsthJmzZF8pS6QiD1DMb835opEKa7evnnGCgfDJ4331';

  @Action(ActionTypes.LOAD_NETWORKS_INFO) loadNetworksInfo: any;
  @Getter(GettersTypes.getNetworksInfo) networksInfo!: Networks;
  @Mutation(MutationTypes.SET_NETWORK_STATUS) setNetworkStatus: any;

  async loadNetworks(url: string): Promise<void> {
    await this.loadNetworksInfo({ url });
  }

  async connectToNetworks(url: string): Promise<void> {
    await this.loadNetworksInfo({ url });
  }

  async subscribeToNetworks() {
    console.log('networksInfo', this.networksInfo);

    for (const [netName, network] of Object.entries(this.networksInfo)) {
      try {
        network.api.connect();

        await network.api.isReady;

        this.setNetworkStatus({ name: netName, active: true });
      } catch (ex) {
        network.api.disconnect();
        this.setNetworkStatus({ name: netName, active: false });

        console.log(`Connection to api failed.`);
      }

      try {
        network.api.rx.query.balances?.account(this.address)?.subscribe(async (result) => {
          const balances = formatBalance(result as AccountData);

          const nullBalances = !Object.values(balances).find((value) => value !== '0');

          console.log(netName, balances);

          if (nullBalances) {
            network.api.disconnect();

            this.setNetworkStatus({ name: netName, active: false });
          }
        });
      } catch (ex) {
        console.log(`Subscribe to ${netName} failed`);
      }
    }
  }

  async mounted() {
    await this.loadNetworks(this.url);

    this.subscribeToNetworks();
  }
}
</script>

<style lang="scss" scoped>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: var(--s-color-base-content-primary);
  background-color: var(--s-color-utility-body);
  height: 100vh;
}
.body-test {
  height: 400px;
}
</style>
