<template>
  <div id="app">
    <div class="background">
      <WelcomePage />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter, Action, Mutation } from 'vuex-class';
import { ActionTypes as ApiActionTypes } from './store/api/actions';
import { GettersTypes as AccountGettersTypes } from './store/accounts/getters';
import { GettersTypes as ApiGettersTypes } from './store/api/getters';
import { MutationTypes } from './store/api/mutations';
import { Networks } from './store/api/types';
import { formatBalance } from './util/balances';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import WelcomePage from './screens/welcomePage/WelcomePage.vue';
import { Accounts } from './store/accounts/types';

@Component({
  components: {
    WelcomePage,
  },
})
export default class App extends Vue {
  url = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/2.0.1/chains/chains_dev.json';

  @Getter(AccountGettersTypes.getAccounts) accounts!: Accounts;
  @Getter(AccountGettersTypes.getNickname) nickname!: string;

  get addresses() {
    return this.accounts.map((wallet) => wallet.address);
  }

  @Getter(ApiGettersTypes.getNetworksInfo) networksInfo!: Networks;
  @Action(ApiActionTypes.LOAD_NETWORKS_INFO) loadNetworksInfo: any;
  @Mutation(MutationTypes.SET_NETWORK_STATUS) setNetworkStatus: any;

  async mounted() {
    await this.loadNetworks(this.url);
  }

  @Watch('accounts')
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
        this.addresses.forEach((address) => {
          network.api.rx.query.balances.account(address).subscribe(async (result) => {
            const balances = formatBalance(result as AccountData);

            const nullBalances = !Object.values(balances).find((value) => value !== '0');

            console.log(
              `
              Address: ${address},
              Network: ${netName},
            `,
              balances
            );

            if (nullBalances) {
              network.api.disconnect();

              this.setNetworkStatus({ name: netName, active: false });
            }
          });
        });
      } catch (ex) {
        console.log(`
          Subscribe to ${netName} failed
          ${ex}
        `);
      }
    }
  }
}
</script>

<style lang="scss">
#app {
  input {
    color: #bb77ff;
  }

  button {
    clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
  }

  .s-input {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background-color: rgba(255, 255, 255, 0.05);
    clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
  }

  .s-select {
    clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
  }

  .s-select .el-input__inner {
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .s-select .s-placeholder {
    color: white;
    font-size: 13px;
    margin-top: 13px;
    padding-left: 30px;
  }

  .s-select input {
    padding-left: 30px;
  }

  .s-input .s-placeholder {
    color: white;
    font-size: 13px;
  }

  .s-input__content {
    padding-left: 15px;
    font-size: 15px;
  }

  .s-select .el-select i.el-icon-arrow-up:before {
    color: rgba(255, 255, 255, 0.5) !important;
  }
}
</style>

<style lang="scss" scoped>
#app {
  font-family: 'Sora';
  font-style: normal;
  font-feature-settings: 'tnum' on, 'lnum' on;
  border-radius: 8px;
  height: 640px;
  width: 560px;
  color: white;
  text-align: center;
  background: url(./assets/background.svg) center;

  .background {
    height: 100%;
    border-radius: 8px;
    padding: 16px;
    background-color: rgba(46, 3, 34, 0.637);
    backdrop-filter: blur(50px);
  }
}
</style>
