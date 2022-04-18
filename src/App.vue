<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import type { BehaviorSubject } from 'rxjs';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import keyring from '@polkadot/ui-keyring';
import NetworksController from './controllers/networksController';

@Component({})
export default class App extends Vue {
  networksController = new NetworksController();
  subscribeAccounts!: BehaviorSubject<SubjectInfo>;

  async mounted() {
    await this.networksController.loadNetworksInfo();

    this.subscribeAccounts = keyring.accounts.subject;
    this.subscribeAccounts.subscribe((accounts) => {
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
  height: var(--extension-height);
  width: var(--extension-width);
  color: white;
  text-align: center;
  margin: 0 auto;
  padding: 16px;
  background: url(./assets/background.jpg);
}
</style>
