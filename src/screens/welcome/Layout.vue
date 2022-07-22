<template>
  <div class="layout">
    <div class="header">
      <div class="icon-container">
        <CircleButton v-if="showBackIcon" backgroundColor="light-black" iconName="chevron-left" @click="back" />
      </div>
      <div class="steps">
        <div v-for="num in countSteps" :key="num" :class="getClassesStep(num)"></div>
      </div>
      <div class="icon-background">
        <CircleButton iconName="expand" backgroundColor="light-black" @click="fullScreen" />
      </div>
    </div>

    <div class="content-block">
      <div class="content">
        <div class="content-header">{{ header }}</div>

        <NicknameForm
          v-if="showNicknameForm"
          :nickname="nickname"
          :readonly="readonlyNickname"
          @update:nickname="setNickname"
        />

        <CreateWallet
          v-if="showCreateForm"
          :currentIndexPage="currentIndexPage"
          :mnemonic="mnemonic"
          :selectedMnemonicElements="selectedMnemonicElements"
          :derivationPath="derivationPath"
          @update:selectedMnemonicElements="updateSelectedMnemonicElements"
        >
          <AdvancedButton @click="toggleAdvancedFormVisible" />
        </CreateWallet>

        <ImportWallet
          v-if="showImportForm"
          v-model="typeImport"
          :currentIndexPage="currentIndexPage"
          :mnemonic="mnemonic"
          :substrateRawSeed="substrateRawSeed"
          :ethereumRawSeed="ethereumRawSeed"
          :substrateJson="substrateJson"
          :ethereumJson="ethereumJson"
          :passwordJson="passwordJson"
          :derivationPath="derivationPath"
          @setImportValue="setImportValue"
          @reset="reset"
          @update:passwordJson="setPasswordJson"
        >
          <AdvancedButton @click="toggleAdvancedFormVisible" />
        </ImportWallet>

        <AdvancedForm
          v-if="showAdvancedForm"
          :derivationPath="derivationPath"
          :showEthereumDP="showEthereumDP"
          @updateDP="updateDP"
          @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
        />

        <PasswordForm v-if="showPasswordForm" />

        <FinishForm v-if="showFinishForm" />
      </div>

      <Button
        v-if="!showAdvancedForm"
        size="big"
        fontSize="big"
        width="100%"
        :text="buttonText"
        :disabled="disabledProceed"
        @click="proceed"
      />
    </div>

    <NotificationPopup
      v-if="showNotificationPopup"
      sizeWidth="medium"
      :handlerClose="handlerCloseNotificationPopup"
      :headers="invalidMessages"
    />

    <EthereumAccountPopup
      v-if="showEthereumAccountPopup"
      sizeWidth="medium"
      :handlerClose="handlerCloseConfirmationPopup"
      :handlerAgree="handlerAgree"
    />
  </div>
</template>

<script lang="ts">
import BaseApi from '@/util/BaseApi';
import NotificationPopup from '@/components/NotificationPopup.vue';
import CircleButton from '@/components/CircleButton.vue';
import Button from '@/components/Button.vue';
import CreateWallet from './CreateWallet.vue';
import FinishForm from './FinishForm.vue';
import PasswordForm from './PasswordForm.vue';
import ImportWallet from './ImportWallet.vue';
import NicknameForm from './NicknameForm.vue';
import AdvancedForm from './AdvancedForm.vue';
import AdvancedButton from './AdvancedButton.vue';
import EthereumAccountPopup from './EthereumAccountPopup.vue';
import { accountController } from '@/controllers/accountController';
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';
import { INVALID_MESSAGES, InvalidValueName } from '@/consts/invalidMessages';
import { ETHEREUM_DEFAULT_DERIVATION_PATH } from '@/consts/ethereumNetworks';
import { INITIAL_DERIVATION_PATH } from '@/consts/derivationPath';
import type { DerivationPath, importType, WalletConnectionStatus, ValidateJsonResult } from '@/interfaces/common';
import type { KeyringPair$Json } from '@polkadot/keyring/types';

@Component({
  components: {
    Button,
    FinishForm,
    CreateWallet,
    ImportWallet,
    PasswordForm,
    NicknameForm,
    AdvancedForm,
    CircleButton,
    AdvancedButton,
    NotificationPopup,
    EthereumAccountPopup,
  },
})
export default class Layout extends Vue {
  nickname = '';
  mnemonic = '';
  passwordJson = '';
  ethereumJson = '';
  substrateJson = '';
  ethereumRawSeed = '';
  substrateRawSeed = '';
  currentIndexPage = 1;
  showAdvancedForm = false;
  showEthereumAccountPopup = false;
  selectedMnemonicElements: string[] = [];
  invalidValueName: InvalidValueName = '';
  typeImport: importType = 'mnemonic';
  derivationPath = INITIAL_DERIVATION_PATH;

  @Prop(String) walletConnectionStatus!: WalletConnectionStatus;
  @Getter(GettersTypes.getPassword) passwordExtension!: string;

  get isSavedPassword() {
    return accountController.isSavedPassword();
  }

  get substrateJSON() {
    return BaseApi.parseJson(this.substrateJson);
  }

  get ethereumJSON() {
    return BaseApi.parseJson(this.ethereumJson);
  }

  get showEthereumDP() {
    return this.typeImport === 'mnemonic';
  }

  get readonlyNickname() {
    return this.typeImport === 'json';
  }

  get showNotificationPopup() {
    return this.invalidValueName !== '';
  }

  get invalidMessages() {
    return this.invalidValueName ? INVALID_MESSAGES[this.invalidValueName] : {};
  }

  get showNicknameForm() {
    return (this.isImportWallet && this.currentIndexPage === 3) || (this.isCreateWallet && this.currentIndexPage === 1);
  }

  get countSteps() {
    return this.isCreateWallet || (this.isImportWallet && this.typeImport !== 'mnemonic') ? 5 : 4;
  }

  get isCreateWallet() {
    return this.walletConnectionStatus === 'isCreateWallet';
  }

  get isImportWallet() {
    return this.walletConnectionStatus === 'isImportWallet';
  }

  get showCreateForm() {
    return (
      this.isCreateWallet && (this.currentIndexPage === 2 || this.currentIndexPage === 3) && !this.showAdvancedForm
    );
  }

  get showImportForm() {
    return (
      this.isImportWallet && (this.currentIndexPage === 1 || this.currentIndexPage === 2) && !this.showAdvancedForm
    );
  }

  get showPasswordForm() {
    return this.currentIndexPage === 4;
  }

  get showBackIcon() {
    return this.currentIndexPage < 5;
  }

  get showFinishForm() {
    return this.currentIndexPage === 5;
  }

  get header() {
    if (this.isCreateWallet) {
      if (this.currentIndexPage === 1) return 'Create new wallet';
      else if (this.currentIndexPage === 2) return 'Backup the passphrase for your new wallet';
      else if (this.currentIndexPage === 3) return 'Confirm the passphrase';
      else if (this.showPasswordForm) return 'Set up password';
    }

    if (this.currentIndexPage === 1) {
      if (this.typeImport === 'mnemonic') return 'Import wallet';
      else return 'Import substrate accounts';
    } else if (this.currentIndexPage === 2) return 'Import ethereum accounts';
    else if (this.currentIndexPage === 3) return 'Wallet nickname';
    else if (this.currentIndexPage === 4) return 'Enter password';

    return '';
  }

  get buttonText() {
    if (this.isCreateWallet && this.currentIndexPage === 2) return 'I have written down passphrase';
    else if (this.showFinishForm) return 'Start using Fearless';

    return 'Continue';
  }

  get disabledProceed() {
    // mutual logic step(password)
    if (this.showPasswordForm) return !this.passwordExtension;

    if (this.isImportWallet) {
      if (this.currentIndexPage === 1)
        return (
          !this.mnemonic &&
          !this.substrateRawSeed &&
          (Object.keys(this.substrateJson).length === 0 || !this.passwordJson)
        );

      if (this.currentIndexPage === 2)
        return (
          (!this.substrateRawSeed || !this.ethereumRawSeed) &&
          (Object.keys(this.ethereumJson).length === 0 || !this.passwordJson)
        );

      if (this.currentIndexPage === 3) return !this.nickname;
    }

    // isCreateWallet
    if (this.currentIndexPage === 1) return !this.nickname;

    if (this.currentIndexPage === 3) return this.mnemonic.split(' ').length !== this.selectedMnemonicElements.length;

    return false;
  }

  @Watch('substrateJson')
  substrateJsonChanged(value: string) {
    this.nickname = (this.substrateJSON?.meta?.name as string) || '';

    if (Object.keys(this.substrateJSON).length === 0 && value !== '') this.invalidValueName = 'jsonInvalid';
  }

  @Watch('ethereumJson')
  ethereumJsonChanged(value: string) {
    if (Object.keys(this.ethereumJSON).length === 0 && value !== '') this.invalidValueName = 'jsonInvalid';
  }

  @Watch('currentIndexPage')
  changedCurrentIndexPage(currentIndexPage: number) {
    // already have a keypairs
    if (this.currentIndexPage === 4 && this.isSavedPassword) {
      this.saveKeypair();

      this.$router.push({ name: Components.Wallet });
    }
    // first keypair
    else if (this.currentIndexPage === 5) this.saveKeypair();
    else if (currentIndexPage === 6) this.$router.push({ name: Components.Wallet });
  }

  getClassesStep(num: number) {
    const isCircleFilled =
      this.isCreateWallet || this.typeImport !== 'mnemonic'
        ? num <= this.currentIndexPage
        : num !== 1
        ? num <= this.currentIndexPage - 1
        : true;

    return [
      'circle-step',
      {
        'circle-filled': isCircleFilled,
      },
    ];
  }

  toggleAdvancedFormVisible(value = true) {
    this.showAdvancedForm = value;
  }

  updateDP(derivationPath: DerivationPath) {
    this.derivationPath = derivationPath;
  }

  reset() {
    this.mnemonic = '';
    this.substrateRawSeed = '';
    this.ethereumRawSeed = '';
    this.substrateJson = '';
    this.ethereumJson = '';
    this.passwordJson = '';
  }

  setImportValue(value: string & (KeyringPair$Json | Record<string, never>)) {
    const field =
      this.typeImport === 'mnemonic'
        ? 'mnemonic'
        : this.typeImport === 'rawSeed'
        ? this.currentIndexPage === 1
          ? 'substrateRawSeed'
          : 'ethereumRawSeed'
        : this.currentIndexPage === 1
        ? 'substrateJson'
        : 'ethereumJson';

    this[field] = value;
  }

  setNickname(value: string) {
    this.nickname = value;
  }

  setPasswordJson(value: string) {
    this.passwordJson = value;
  }

  handlerCloseNotificationPopup() {
    if (this.invalidValueName === 'jsonInvalid') this.substrateJson = '';

    this.invalidValueName = '';
    this.selectedMnemonicElements = [];
  }

  handlerCloseConfirmationPopup() {
    this.showEthereumAccountPopup = false;

    this.currentIndexPage += 2;
  }

  handlerAgree() {
    this.showEthereumAccountPopup = false;
    this.passwordJson = '';
    this.currentIndexPage += 1;
  }

  proceed() {
    if (this.isCreateWallet) this.createFlow();
    else this.importFlow();

    // if a invalid popup  or add ETH account popup is shown, then the index does not need to be increased
    this.currentIndexPage += this.showNotificationPopup || this.showEthereumAccountPopup ? 0 : 1;
  }

  createFlow() {
    if (this.currentIndexPage === 1 && !this.mnemonic.length) this.mnemonic = BaseApi.generateMnemonic();
    else if (this.currentIndexPage === 3) this.validateSuri();
  }

  importFlow() {
    if (this.currentIndexPage === 1) {
      this.validateSuri();

      if (this.invalidValueName !== '') return;

      // if import type is raw seed or json, show a window with a question about adding an ETH account
      if (this.typeImport === 'mnemonic') this.currentIndexPage += 1;
      else this.showEthereumAccountPopup = true;
    } else if (this.currentIndexPage === 2) this.validateSuri();
  }

  validateSuri() {
    const isValidMnemonic = this.mnemonic ? BaseApi.isMnemonic(this.mnemonic) : true;
    const isValidSubstrateRawSeed = this.substrateRawSeed ? BaseApi.isHex(this.substrateRawSeed) : true;
    const isValidEthereumRawSeed = this.ethereumRawSeed ? BaseApi.isHex(this.ethereumRawSeed) : true;

    const validatedSubstrateJson = this.substrateJson
      ? BaseApi.isValidJson(this.substrateJSON, this.passwordJson)
      : ({ value: true } as ValidateJsonResult);

    const validatedEthereumJson = this.ethereumJson
      ? BaseApi.isValidJson(this.ethereumJSON, this.passwordJson)
      : ({ value: true } as ValidateJsonResult);

    const isValidSequenceMnemonic = this.isCreateWallet
      ? BaseApi.isValidSequenceMnemonic(this.mnemonic, this.selectedMnemonicElements)
      : true;

    this.invalidValueName = !isValidSequenceMnemonic
      ? 'mnemonicSequence'
      : !isValidMnemonic
      ? 'mnemonic'
      : !isValidSubstrateRawSeed || !isValidEthereumRawSeed
      ? 'rawSeed'
      : !validatedSubstrateJson.value
      ? validatedSubstrateJson.errorType
      : !validatedEthereumJson.value
      ? validatedEthereumJson.errorType
      : '';
  }

  saveKeypair() {
    if (this.substrateJson) this.saveKeypairFromJson();
    else this.saveKeypairFromSeed();

    this.savePassword();
  }

  saveKeypairFromJson() {
    BaseApi.addKeypairFromJson(this.substrateJSON, this.passwordJson);

    if (this.ethereumJson) {
      BaseApi.addKeypairFromJson(this.ethereumJSON, this.passwordJson);
    }
  }

  saveKeypairFromSeed() {
    const meta = { name: this.nickname.trim(), ethereumAddress: '' };
    const {
      substrate: { value: substrateDerivationPath, keypairType: substrateKeypairType },
      ethereum: { value: ethereumDerivationPath, keypairType: ethereumKeypairType },
    } = this.derivationPath;
    const suriSubstrate = `${this.mnemonic || this.substrateRawSeed}${substrateDerivationPath.trim()}`;

    if (this.mnemonic) {
      const ethereumDP = (
        ethereumDerivationPath.length !== 0
          ? ethereumDerivationPath[0] === '/'
            ? ethereumDerivationPath
            : `/${ethereumDerivationPath}`
          : ''
      ).trim();

      const suriEthereum = `${this.mnemonic}${ethereumDP || ETHEREUM_DEFAULT_DERIVATION_PATH}`;

      const {
        pair: { address },
      } = BaseApi.addKeypair(suriEthereum, meta, ethereumKeypairType);

      meta.ethereumAddress = address;
    } else if (this.ethereumRawSeed) {
      const {
        pair: { address },
      } = BaseApi.addKeypair(this.ethereumRawSeed, meta, ethereumKeypairType);

      meta.ethereumAddress = address;
    }

    BaseApi.addKeypair(suriSubstrate, meta, substrateKeypairType);
  }

  savePassword() {
    accountController.savePassword(this.passwordExtension);
  }

  updateSelectedMnemonicElements(value: string[]) {
    this.selectedMnemonicElements = value;
  }

  fullScreen() {
    alert('full screen');
  }

  back() {
    if (this.currentIndexPage === 3 && this.ethereumRawSeed === '') {
      this.currentIndexPage -= 1;
    }

    if (this.currentIndexPage === 1) {
      this.mnemonic = '';
      this.nickname = '';
      this.derivationPath = INITIAL_DERIVATION_PATH;

      this.$emit('reset');

      return;
    }

    this.currentIndexPage -= 1;
  }
}
</script>

<style lang="scss" scoped>
.layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;

  .header {
    width: 100%;
    margin: 8px 0 24px;
    display: flex;
    justify-content: space-between;

    .steps {
      display: flex;
      align-items: center;

      .circle-step {
        border-radius: 50%;
        width: 10px;
        height: 10px;
        background-color: rgba(255, 255, 255, 0.1);
        margin-right: 8px;

        &:last-child {
          margin-right: 0;
        }
      }

      .circle-filled {
        background-color: $pink-color;
      }
    }
  }

  .content-block {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;

    .content {
      width: 100%;
    }

    .content-header {
      font-weight: 600;
      font-size: 20px;
      line-height: 25px;
      margin: 13.5px 0 21.5px;
    }
  }

  .el-button.s-primary:disabled {
    background-color: rgba(238, 0, 119, 0.4);
    border: rgba(238, 0, 119, 0.4);
    color: rgba(255, 255, 255, 0.5);
  }

  .icon-container {
    width: 32px;
    height: 32px;
  }
}
</style>
