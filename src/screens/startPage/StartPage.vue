<template>
  <div class="start-page">
    <template v-if="!walletConnectionStatus">
      <div class="registration-page">
        <div class="logo">
          <img src="../../assets/fearless-big-logo.svg" height="120px" />
        </div>
        <div class="active-block">
          <div>
            <s-button
              class="button"
              type="primary"
              border-radius="mini"
              @click="changWalletConnectionStatus('isCreateWallet')"
            >
              Create a new wallet
            </s-button>
          </div>
          <div>
            <s-button
              class="button"
              type="primary"
              border-radius="mini"
              @click="changWalletConnectionStatus('isImportWallet')"
            >
              I already have a wallet
            </s-button>
          </div>
        </div>
      </div>
    </template>

    <Layout
      v-else-if="walletConnectionStatus"
      :walletConnectionStatus="walletConnectionStatus"
      @reset="changWalletConnectionStatus"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Layout from './Layout.vue';
import { WalletConnectionStatus } from '../../interfaces/connectionWallet';

@Component({
  components: {
    Layout,
  },
})
export default class extends Vue {
  walletConnectionStatus: WalletConnectionStatus = '';

  changWalletConnectionStatus(value: WalletConnectionStatus = '') {
    this.walletConnectionStatus = value;
  }
}
</script>

<style lang="scss" scoped>
.start-page {
  display: flex;
  flex-direction: column;

  .registration-page {
    background-color: rgb(122, 11, 98);
    backdrop-filter: blur(48px);
  }

  .logo {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 350px;
  }

  .active-block {
    height: 150px;

    display: flex;
    flex-direction: column;
    justify-content: center;

    .button {
      width: 200px;
      margin-bottom: 10px;
    }
  }
}
</style>
