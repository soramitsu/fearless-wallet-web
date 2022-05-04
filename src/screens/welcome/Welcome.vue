<template>
  <div class="welcome-page">
    <template v-if="!walletConnectionStatus">
      <div class="first-page">
        <Logo class="description" size="big" text="Fearless Wallet" subtext="The DeFi Wallet From The Future" />

        <div>
          <Button
            class="button"
            text="Create a new wallet"
            size="big"
            :handler="changWalletConnectionStatus.bind(null, 'isCreateWallet')"
          />

          <Button
            class="button import-button"
            text="I already have a wallet"
            size="big"
            :handler="changWalletConnectionStatus.bind(null, 'isImportWallet')"
          />

          <div class="privacy-policy">
            By continuing you agree with
            <span class="important-text" @click="openTermsAndConditions">Terms and Conditions </span>
            and
            <span class="important-text" @click="openPrivacyPolicy"> Privacy Policy</span>
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
import { WalletConnectionStatus } from '@/interfaces/connectionWallet';
import Layout from './Layout.vue';
import Logo from '@/components/Logo.vue';
import Button from '@/components/Button.vue';

@Component({
  components: {
    Layout,
    Logo,
    Button,
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

  .first-page {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
  }

  .description {
    margin-top: 101px;
  }

  .privacy-policy {
    margin-top: 17px;
    font-size: 12px;
    font-weight: 400;
    line-height: 16px;
    color: rgba(255, 255, 255, 0.65);

    .important-text {
      color: rgb(199, 31, 95);

      &:hover {
        cursor: pointer;
      }
    }
  }

  .button {
    margin-top: 10px;
    width: 100%;
  }

  .import-button {
    background-color: rgba(255, 255, 255, 0.1);
    border: rgba(255, 255, 255, 0.1);
  }
}
</style>
