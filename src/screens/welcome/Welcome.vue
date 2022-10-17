<template>
  <div class="welcome-page">
    <div>
      <div class="back-wallet-container">
        <CircleButton
          v-if="showBackWalletIcon"
          backgroundColor="light-black"
          iconName="chevron-left"
          @click="backWallet"
        />
      </div>

      <Logo class="description" size="big" text="Fearless Wallet" subtext="The DeFi Wallet From The Future" />
    </div>

    <div>
      <Button
        width="100%"
        text="Create a new wallet"
        class="create-button"
        size="big"
        fontSize="big"
        @click="openAddWalletComponent('create')"
      />

      <Button
        v-if="isExtension"
        class="import-button"
        width="100%"
        text="I already have a wallet"
        size="big"
        fontSize="big"
        type="secondary"
        :border="false"
        @click="openAddWalletComponent('import')"
      />

      <Button
        class="import-button"
        width="100%"
        text="Connect Mobile Wallet"
        size="big"
        fontSize="big"
        type="secondary"
        :border="false"
        @click="openAddWalletMobile"
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

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Logo from '@/components/Logo.vue';
import Button from '@/components/Button.vue';
import { Components } from '@/router/routes';
import CircleButton from '@/components/CircleButton.vue';
import BaseApi from '@/util/BaseApi';
import { TERMS_URL, PRIVACY_URL } from '@/consts/urls';
import AboveForm from '@/components/AboveForm.vue';
import MobileConnect from '@/screens/mobileConnect/MobileConnect.vue';
import { isExtension } from '@/helpers/common';

@Component({
  components: {
    Logo,
    Button,
    CircleButton,
    MobileConnect,
    AboveForm,
  },
})
export default class Welcome extends Vue {
  store: unknown;

  get showBackWalletIcon() {
    return BaseApi.getAccounts().length !== 0;
  }

  get isExtension() {
    return isExtension();
  }

  openTermsAndConditions() {
    window.open(TERMS_URL);
  }

  openPrivacyPolicy() {
    window.open(PRIVACY_URL);
  }

  backWallet() {
    this.$router.push({ name: Components.Wallet });
  }

  openAddWalletComponent(type: string) {
    this.$router.push({ name: Components.AddWallet, params: { type } });
  }

  openAddWalletMobile() {
    this.$router.push({
      name: Components.MobileConnect,
    });
  }
}
</script>

<style lang="scss" scoped>
.welcome-page {
  display: flex;
  flex-direction: column;
  height: $default-height-page;
  justify-content: space-between;

  .back-wallet-container {
    height: 32px;
  }

  .description {
    margin-top: 69px;
  }

  .privacy-policy {
    margin-top: 17px;
    font-size: 12px;
    font-weight: 400;
    line-height: 16px;
    color: $grayish-white;

    .important-text {
      color: rgb(199, 31, 95);

      &:hover {
        cursor: pointer;
      }
    }
  }

  .import-button {
    margin-top: 10px;
  }
}
</style>
