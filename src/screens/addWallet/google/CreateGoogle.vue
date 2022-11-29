<template>
  <FlowStepLayout :countSteps="countSteps" :step="step" :header="header" @back="back" :showFullScreenIcon="false">
    <div class="step__content">
      <NoWallets v-if="step === 1" />

      <NickNameForm v-if="step === 2" :nickname="nickname" @update:nickname="setNickname" />

      <div class="icon__container" v-if="step === 3">
        <Icon className="icon--drive" icon="drive" />
      </div>

      <CreateWallet
        v-if="step === 4 || step === 5"
        :step="step"
        :shouldShowAtSteps="[4, 5]"
        mnemonic="betray pyramid orange rude orchard stool cement churn path car raw profit"
        :selectedMnemonicElements="selectedMnemonicElements"
        @update:selectedMnemonicElements="updateSelectedMnemonicElements"
      >
        <AdvancedButton @click="toggleAdvancedFormVisible" />
      </CreateWallet>

      <PasswordForm
        v-if="step === 6"
        :showMockPassword="false"
        :showSamePasswordText="false"
        @updateWalletPassword="updateWalletPassword"
      />

      <!-- <NotificationPopup /> -->
    </div>
    <template v-slot:control>
      <Button
        size="big"
        fontSize="big"
        width="100%"
        :border="false"
        :text="buttonText"
        :type="buttonType"
        @click="proceed"
      />

      <div v-if="step === 4" class="divider__container">
        <SDivider class="divider" />
        <span>{{ $t('common.or') }}</span>
        <SDivider class="divider" />
      </div>

      <Button
        v-if="step === 3 || step === 4"
        size="big"
        fontSize="big"
        width="100%"
        :border="false"
        :text="subButtonText"
        :type="subButtonType"
        @click="subButtonProceed"
      />
    </template>
  </FlowStepLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import NoWallets from '@/screens/addWallet/google/NoWallets.vue';
import Icon from '@/components/Icon.vue';
import PasswordForm from '@/screens/addWallet/PasswordForm.vue';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';
import NickNameForm from '@/screens/addWallet/NicknameForm.vue';
import Button from '@/components/Button.vue';
import CreateWallet from '@/screens/addWallet/CreateWallet.vue';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import NotificationPopup from '@/components/NotificationPopup.vue';
import { Components } from '@/router/routes';
import { MnemonicConfirmation } from '@/interfaces';

@Component({
  components: {
    NoWallets,
    AdvancedButton,
    Icon,
    NickNameForm,
    CreateWallet,
    PasswordForm,
    FlowStepLayout,
    NotificationPopup,
    Button,
  },
})
export default class CreateGoogleWallet extends Vue {
  readonly countSteps = 7;
  step = 1;
  nickname = '';
  selectedMnemonicElements: MnemonicConfirmation[] = [];
  showAdvancedForm = false;
  walletPassword = '';

  back() {
    if (this.step === 1) {
      this.$router.push({ name: Components.Welcome });

      return;
    }

    this.step -= 1;
  }

  proceed() {
    if (this.step === this.countSteps) {
      this.$router.push({ name: Components.Wallet });

      return;
    }

    this.step += 1;
  }

  subButtonProceed() {
    //
  }

  get subButtonText() {
    if (this.step === 4) return this.$t('addWallet.google.backupWallet');

    return this.$t('addWallet.google.showPassPhrase');
  }
  get subButtonType() {
    if (this.step === 4) return 'google';

    return 'link';
  }

  updateWalletPassword(password: string) {
    this.walletPassword = password;
  }

  setNickname(name: string) {
    this.nickname = name;
  }

  updateSelectedMnemonicElements(value: MnemonicConfirmation[]) {
    this.selectedMnemonicElements = value;
  }

  setValue(value: string) {
    this.nickname = value;
  }

  toggleAdvancedFormVisible(value = true) {
    this.showAdvancedForm = value;
  }

  get header() {
    if (this.step === 1) return '';
    if (this.step === 3) return 'Backup the passphrase for your new wallet';
    if (this.step === 5) return 'Confirm the passphrase';
    if (this.step === 6) return 'Set up password';

    return 'Create new wallet';
  }

  get buttonType() {
    if (this.step === 3) return 'google';

    return 'primary';
  }

  get buttonText() {
    if (this.step === 4) return this.$t('addWallet.haveWrittenPassphrase');

    if (this.step === 3) return this.$t('addWallet.google.backupWallet');

    if (this.step === 2) return this.$t('common.confirm');

    return this.$t('addWallet.createWallet');
  }
}
</script>

<style lang="scss" scoped>
.step__content {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
}

.icon__container {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;

  .icon--drive {
    width: 187px;
    height: 187px;
    place-content: center;
  }
}
.divider__container {
  display: flex;
  flex-flow: row nowrap;
  width: 100%;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding-left: 10px;
  padding-right: 10px;
  color: #ffffffbf;

  .divider {
    background: rgba(255, 255, 255, 0.1);
  }
}
</style>
