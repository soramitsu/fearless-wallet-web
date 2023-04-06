<template>
  <FlowStepLayout
    :countSteps="countSteps"
    :showAdvancedForm="showAdvancedForm"
    :step="step"
    :header="header"
    :showFullScreenIcon="false"
    @back="back"
  >
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
        <Button
          v-if="confirmMnemonicStep"
          size="big"
          fontSize="big"
          width="64px"
          type="secondary"
          :border="false"
          iconName="reload"
          @click="resetAll"
        />

        <Button
          v-if="confirmMnemonicStep"
          size="big"
          fontSize="big"
          width="100%"
          type="secondary"
          :border="false"
          :text="$t('addWallet.skipConfirmation')"
          @click="skipStep"
        />

        <Button
          size="big"
          fontSize="big"
          width="100%"
          type="primary"
          :border="false"
          :iconName="isLoading ? 'loader' : ''"
          :iconType="isLoading ? 'loading' : ''"
          :disabled="disabledProceed"
          :text="isLoading ? '' : buttonText"
          @click="proceed"
        />
      </div>
    </template>

    <NotificationPopup
      v-if="showNotificationPopup"
      :headers="invalidMessages"
      acceptButtonText="common.accept"
      :handlerClose="handlerCloseNotificationPopup"
      :handlerAccept="handlerAcceptAddWallet"
    />
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
import { DerivationPaths, MnemonicConfirmation, TAction } from '@/interfaces';
import AdvancedForm from '@/screens/addWallet/AdvancedForm.vue';
import { ETHEREUM_DEFAULT_DERIVATION_PATH, INITIAL_DERIVATION_PATHS } from '@/consts/derivationPath';
import BaseApi from '@/util/BaseApi';
import { createAccountSuri, createGoogleFile, exportAccount } from '@/extension/messaging';
import { SelectedWallet } from '@/store/accounts/types';
import { ActionTypes as ActionActionTypes } from '@/store/accounts/actions';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { WarningValueName } from '@/consts/messages';

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
  readonly buttonTextForStep: Record<number, TranslateResult> = {
    1: this.$t('common.continue'),
    2: this.$t('addWallet.haveWrittenPassphrase'),
    3: this.$t('addWallet.ConfirmSecretData'),
    4: this.$t('common.confirm'),
    5: this.$t('common.finish'),
  };

  selectedMnemonicElements: MnemonicConfirmation[] = [];
  step = 1;
  nickname = '';
  mnemonic = '';
  showAdvancedForm = false;
  walletPassword = '';
  derivationPaths = INITIAL_DERIVATION_PATHS;
  showNotificationPopup = false;
  warningValueName: WarningValueName = '';
  isLoading = false;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Action(ActionActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<string>;

  get invalidMessages() {
    if (!this.warningValueName) return {};

    const mainPath = `addWallet.warningMessages.${this.warningValueName}`;

    return {
      text: `${mainPath}.text`,
      subtext: `${mainPath}.subtext`,
    };
  }

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
    if (this.isLoading) return true;
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

    return `${this.mnemonic.trim()}${substrateDerivationPath.trim()}`;
  }

  get suriEthereum() {
    const {
      ethereum: { value: ethereumDerivationPath },
    } = this.derivationPaths;

    const ethereumDP = (
      ethereumDerivationPath.length !== 0
        ? ethereumDerivationPath[0] === '/'
          ? ethereumDerivationPath
          : `/${ethereumDerivationPath}`
        : ETHEREUM_DEFAULT_DERIVATION_PATH
    ).trim();

    return `${this.mnemonic}${ethereumDP}`;
  }

  mounted() {
    this.mnemonic = BaseApi.generateMnemonic();
  }

  @Watch('step')
  async watchStep() {
    if (this.step === 5) {
      this.isLoading = false;
      const { address } = await this.saveKeypairFromSeed();

      this.backupWallet(address);

      this.isLoading = true;
    }
  }

  updateDP(derivationPaths: DerivationPaths) {
    this.derivationPaths = derivationPaths;
  }

  resetAll() {
    this.selectedMnemonicElements = [];
  }

  skipStep() {
    this.step += 1;
  }

  async handlerCloseNotificationPopup() {
    this.warningValueName = '';
    this.selectedMnemonicElements = [];
    this.showNotificationPopup = false;
  }

  async handlerAcceptAddWallet() {
    this.warningValueName = '';

    this.step += 1;
  }

  back() {
    if (this.step === 1) {
      this.$router.replace('/');
      this.$router.push({ name: Components.Welcome });

      return;
    }

    this.step -= 1;
  }

  proceed() {
    if (this.step === this.countSteps) {
      this.$router.replace('/');
      this.$router.push({ name: Components.Wallet });

      return;
    }

    if (this.step === 3) {
      const isValidSequenceMnemonic = BaseApi.isValidSequenceMnemonic(
        this.mnemonic,
        this.selectedMnemonicElements.map(({ word }) => word)
      );

      if (!isValidSequenceMnemonic) {
        this.warningValueName = 'mnemonicSequence';
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

  async backupWallet(address: string) {
    const { exportedJson: json } = await exportAccount(address, this.walletPassword);
    const ethAddress = json.meta.ethereumAddress as string;
    let ethRes;
    const token = this.$route.params.access_token;

    if (ethAddress) {
      const ethJson = await exportAccount(ethAddress, this.walletPassword);
      ethRes = await createGoogleFile({
        json: JSON.stringify(ethJson),
        options: { name: this.nickname, address: ethAddress },
        token,
      });
    }

    createGoogleFile({
      json: JSON.stringify(json),
      options: { name: this.nickname, address: `${address}/${ethRes ? ethRes.id : ''}` },
      token,
    });
  }

  async saveKeypairFromSeed() {
    const meta: Record<string, unknown> = { name: this.nickname.trim(), ethereumAddress: '' };
    const {
      substrate: { keypairType: substrateKeypairType },
      ethereum: { keypairType: ethereumKeypairType },
    } = this.derivationPaths;

    if (this.suriEthereum !== '') {
      const { ethereumAddress } = await createAccountSuri(
        this.walletPassword,
        this.suriEthereum,
        ethereumKeypairType,
        undefined,
        meta
      ); // for proper work of extension

      meta.ethereumAddress = ethereumAddress;
    }

    const address = await createAccountSuri(
      this.walletPassword,
      this.suriSubstrate,
      substrateKeypairType,
      undefined,
      meta
    ); // for proper work of extension

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
