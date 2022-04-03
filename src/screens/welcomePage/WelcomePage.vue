<template>
  <div class="welcome-page">
    <template v-if="!walletConnectionStatus">
      <div>
        <div class="description-block">
          <div class="circle">
            <div class="circle-blur">
              <img src="../../assets/fw-logo.svg" class="logo" />
            </div>
          </div>
          <div class="text">Fearless Wallet</div>
          <div class="subtext">The DeFi Wallet From The Future</div>
        </div>
        <div class="privacy-policy">
          I have read and agreed to <br />
          <span class="important" @click="openTermsAndConditions">Terms and Conditions </span>
          and
          <span class="important" @click="openPrivacyPolicy"> Privacy Policy</span>
        </div>
        <div>
          <s-button
            class="button"
            type="primary"
            border-radius="mini"
            size="big"
            @click="changWalletConnectionStatus('isCreateWallet')"
          >
            Create a new wallet
          </s-button>
        </div>
        <div>
          <s-button
            class="button import-button"
            type="primary"
            border-radius="mini"
            size="big"
            @click="changWalletConnectionStatus('isImportWallet')"
          >
            I already have a wallet
          </s-button>
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

  openTermsAndConditions() {
    alert('Terms and Conditions');
  }

  openPrivacyPolicy() {
    alert('privacy policy');
  }

  changWalletConnectionStatus(value: WalletConnectionStatus = '') {
    this.walletConnectionStatus = value;
  }
}
</script>

<style lang="scss" scoped>
.welcome-page {
  display: flex;
  flex-direction: column;
  height: 100%;

  .description-block {
    margin-top: 120px;
    display: flex;
    flex-direction: column;
    justify-content: center;

    .circle {
      border-radius: 50%;
      background: conic-gradient(from 180deg at 50% 50%, #ee7777 0deg, #ee0077 187.5deg, #7777ee 360deg);
      height: 96px;
      width: 96px;
      margin: 0 auto;
    }

    .circle-blur {
      backdrop-filter: blur(10px);
      height: 100%;
      width: 100%;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .logo {
      height: 42px;
      width: 85px;
      margin: 0 auto;
    }

    .text {
      font-weight: 700;
      font-size: 48px;
      line-height: 60px;
    }

    .subtext {
      font-weight: 300;
      font-size: 20px;
      line-height: 25px;
    }
  }

  .privacy-policy {
    margin-top: 70px;
    font-size: 15px;
    font-weight: 600;
    line-height: 19px;

    .important {
      color: rgb(199, 31, 95);

      &:hover {
        cursor: pointer;
      }
    }
  }

  .button {
    width: 528px;
    font-size: 24px;

    &:first-child {
      margin-top: 15px;
    }
  }

  .import-button {
    background-color: rgba(255, 255, 255, 0.1);
    border: rgba(255, 255, 255, 0.1);
  }
}
</style>
