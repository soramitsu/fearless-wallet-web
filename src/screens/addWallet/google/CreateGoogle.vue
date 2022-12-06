<template>
  <FlowStepLayout :countSteps="countSteps" :step="step" :header="header" @back="back" :showFullScreenIcon="false">
    <NickNameForm v-if="nickNameStep" :nickname="nickname" @update:nickname="setNickname" />

    <CreateWallet
      v-if="createWalletStep"
      :step="step"
      :mnemonic="mnemonic"
      :selectedMnemonicElements="selectedMnemonicElements"
      @update:selectedMnemonicElements="updateSelectedMnemonicElements"
    >
      <AdvancedButton @click="toggleAdvancedFormVisible" />
    </CreateWallet>

    <AdvancedForm
      v-if="showAdvancedForm"
      :derivationPaths="derivationPaths"
      :showEthereumDP="showEthereumDP"
      :showSubstrateDP="showSubstrateDP"
      @updateDP="updateDP"
      @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
    />

    <PasswordForm
      v-if="passwordStep"
      :isGoogleFlow="true"
      :showMockPassword="false"
      :showSamePasswordText="false"
      @updateWalletPassword="updateWalletPassword"
    />

    <template v-slot:control>
      <div class="controls">
        <BorderButton v-if="confirmMnemonicStep" iconName="reload" @click="resetAll" />
        <BorderButton v-if="confirmMnemonicStep" :text="$t('addWallet.skipConfirmation')" @click="skipStep" />

        <Button
          size="big"
          fontSize="big"
          width="100%"
          type="primary"
          :border="false"
          :disabled="disabledProceed"
          :text="buttonText"
          @click="proceed"
        />
      </div>
    </template>
  </FlowStepLayout>
</template>

<script lang="ts">
import { Getter, Action } from 'vuex-class';
import { Component, Vue, Watch } from 'vue-property-decorator';
import { TranslateResult } from 'vue-i18n';
import NegativeMessage from '@/screens/addWallet/google/NegativeMessage.vue';
import PasswordForm from '@/screens/addWallet/PasswordForm.vue';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';
import NickNameForm from '@/screens/addWallet/NicknameForm.vue';
import CreateWallet from '@/screens/addWallet/CreateWallet.vue';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import { Components } from '@/router/routes';
import { MnemonicConfirmation, TAction } from '@/interfaces';
import AdvancedForm from '@/screens/addWallet/AdvancedForm.vue';
import { INITIAL_DERIVATION_PATHS } from '@/consts/derivationPath';
import BaseApi from '@/util/BaseApi';
import { createGoogleFile } from '@/extension/messaging';
import { SelectedWallet, SetSelectedWallet } from '@/store/accounts/types';
import { ActionTypes as ActionActionTypes } from '@/store/accounts/actions';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component({
  components: {
    AdvancedForm,
    NickNameForm,
    CreateWallet,
    PasswordForm,
    FlowStepLayout,
    AdvancedButton,
    NegativeMessage,
  },
})
export default class CreateGoogle extends Vue {
  readonly countSteps = 5;
  step = 1;
  nickname = '';
  mnemonic = '';
  selectedMnemonicElements: MnemonicConfirmation[] = [];
  showAdvancedForm = false;
  walletPassword = '';
  derivationPaths = INITIAL_DERIVATION_PATHS;
  showNotificationPopup = false;
  notificationHeaders = { text: 'addWallet.google.saved', subtext: 'addWallet.google.passphraseSaved' };
  jsonInvalid = {
    text: 'addWallet.warningMessages.jsonInvalid.text',
    subtext: 'addWallet.warningMessages.jsonInvalid.subtext',
  };

  buttonTextForStep: Record<number, TranslateResult> = {
    1: this.$t('common.continue'),
    2: this.$t('addWallet.google.backupWallet'),
    3: this.$t('addWallet.ConfirmSecretData'),
    5: this.$t('common.finish'),
  };

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Action(ActionActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<SetSelectedWallet>;

  get nickNameStep() {
    return this.step === 1;
  }

  get createWalletStep() {
    return this.step === 2 || this.step === 3;
  }

  get passwordStep() {
    return this.step === 4;
  }

  get header() {
    if (this.nickNameStep) return this.$t('addWallet.createWallet');
    if (this.step === 2) return this.$t('addWallet.backupPassphrase');
    if (this.step === 3) return this.$t('addWallet.confirmPassphrase');
    if (this.passwordStep) return this.$t('addWallet.setupPassword');
    if (this.step === 5) return '';

    return this.$t('addWallet.createWallet');
  }

  get buttonText() {
    if (this.buttonTextForStep[this.step]) return this.buttonTextForStep[this.step];

    return this.$t('addWallet.createWallet');
  }

  get disabledProceed() {
    if (this.nickNameStep) return !this.nickname;
    if (this.step === 3) return this.mnemonic.split(' ').length !== this.selectedMnemonicElements.length;

    if (this.passwordStep) return !this.walletPassword;

    return false;
  }

  get confirmMnemonicStep() {
    return this.step === 3;
  }

  get suriSubstrate() {
    const {
      substrate: { value: substrateDerivationPath },
    } = this.derivationPaths;

    return `${this.mnemonic}${substrateDerivationPath.trim()}`;
  }

  mounted() {
    this.mnemonic = BaseApi.generateMnemonic();
  }

  @Watch('step')
  watchStep() {
    if (this.step === 5) {
      const address = this.saveKeypairFromSeed();

      this.setSelectedWallet({ selectedWalletAddress: address || this.selectedWallet.address });

      this.backupWallet(address);
    }
  }

  resetAll() {
    this.selectedMnemonicElements.splice(0);
  }

  skipStep() {
    this.step += 1;
  }

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

    if (this.step === 3) {
      const isValidSequenceMnemonic = BaseApi.isValidSequenceMnemonic(
        this.mnemonic,
        this.selectedMnemonicElements.map(({ word }) => word)
      );

      if (!isValidSequenceMnemonic) {
        this.showNotificationPopup = true;

        return;
      }
    }

    this.step += 1;
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

  backupWallet(address: string) {
    const json = BaseApi.getPair(address).toJson(this.walletPassword);
    console.log(this.walletPassword);

    createGoogleFile(JSON.stringify(json), { name: this.nickname, address }, this.$route.params.access_token);
  }

  saveKeypairFromSeed() {
    const meta: Record<string, unknown> = { name: this.nickname.trim(), ethereumAddress: '' };
    const {
      substrate: { keypairType },
    } = this.derivationPaths;

    meta.ethereumAddress = '';

    const { address } = BaseApi.addKeypair(this.suriSubstrate, this.walletPassword, meta, keypairType);

    return address;
  }
}
</script>

<style lang="scss" scoped>
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
.controls {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
}
</style>
