<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Action, Mutation } from 'vuex-class';
import { ActionTypes as ApiActionTypes } from './store/api/actions';
import { GettersTypes as ApiGettersTypes } from './store/api/getters';
import { MutationTypes as ApiMutationTypes } from './store/api/mutations';
import { Networks } from './store/api/types';
import { formatBalance } from './util/balances';
import type { AccountData } from '@polkadot/types/interfaces/balances';
import type { BehaviorSubject } from 'rxjs';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import keyring from '@polkadot/ui-keyring';

@Component({})
export default class App extends Vue {
  url = 'https://raw.githubusercontent.com/soramitsu/fearless-utils/android/2.0.1/chains/chains_dev.json';
  subscribeAccounts!: BehaviorSubject<SubjectInfo>;

  @Getter(ApiGettersTypes.getNetworksInfo) networksInfo!: Networks;
  @Action(ApiActionTypes.LOAD_NETWORKS_INFO) loadNetworksInfo: any;
  @Mutation(ApiMutationTypes.SET_NETWORK_STATUS) setNetworkStatus: any;

  get networks() {
    return Object.entries(this.networksInfo);
  }

  async mounted() {
    await this.loadNetworks(this.url);

    // to speed up, first connect to all networks
    this.connectToNetworks();

    this.subscribeAccounts = keyring.accounts.subject;
    this.subscribeAccounts.subscribe((accounts) => {
      this.subscribeToNetworks(accounts);
    });
  }

  unmounted() {
    this.subscribeAccounts.unsubscribe();
  }

  async loadNetworks(url: string): Promise<void> {
    await this.loadNetworksInfo({ url });
  }

  connectToNetworks() {
    for (const [netName, network] of this.networks) {
      try {
        network.api.connect();

        this.setNetworkStatus({ name: netName, active: true });

        console.log(`%c${netName.toUpperCase()}. API connection successful.`, 'background:green;color:#fff');
      } catch (ex) {
        network.api.disconnect();

        this.setNetworkStatus({ name: netName, active: false });

        console.log(`%c${netName.toUpperCase()}. Connection to api failed.`, 'background:red;color:#fff');
      }
    }
  }

  async subscribeToNetworks(accounts: SubjectInfo) {
    console.log('accounts', accounts);

    for (const [netName, network] of this.networks) {
      await network.api.isReady;

      this.setNetworkStatus({ name: netName, active: true });

      try {
        // Object.keys(accounts).forEach((address) => {
        //   network.api.rx.query.balances.account(address).subscribe(async (result) => {
        //     const balances = formatBalance(result as AccountData);
        //     const nullBalances = !Object.values(balances).find((value) => value !== '0');
        //     console.log(
        //       `
        //       Address: ${address},
        //       Network: ${netName},
        //     `,
        //       balances
        //     );
        //     if (nullBalances) {
        //       network.api.disconnect();
        //       this.setNetworkStatus({ name: netName, active: false });
        //     }
        //   });
        // });
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
  textarea,
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
    padding-left: 25px;
  }

  .s-select {
    clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
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
    color: white;
    font-size: 12px;
    margin-top: 12px;
    padding-left: 25px;
  }

  .s-select input {
    padding-left: 25px;
  }

  .s-input .s-placeholder {
    color: white;
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
  border-radius: 8px;
  height: 640px;
  width: 560px;
  color: white;
  text-align: center;
  margin: 0 auto;
  border-radius: 8px;
  padding: 16px;
  background: url(./assets/background.jpg);
}
</style>
