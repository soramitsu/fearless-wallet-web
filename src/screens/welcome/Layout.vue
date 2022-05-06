<template>
  <div class="layout">
    <div class="header">
      <div class="icon-container">
        <CircleButton v-if="showBackIcon" backgroundColor="light-black" iconType="back" @click="back" />
      </div>
      <div class="steps">
        <div
          v-for="item in countSteps"
          :key="item"
          class="circle-step"
          :class="item <= currentIndexPage ? 'circle-filled' : ''"
        ></div>
      </div>
      <div class="icon-background">
        <CircleButton iconType="full-screen" backgroundColor="light-black" @click="fullScreen" />
      </div>
    </div>

    <div class="content-block">
      <div class="content">
        <div v-if="showContentHeader" class="content-header">{{ header }}</div>

        <NicknameForm
          v-if="showNicknameForm"
          :nickname="nickname"
          @update:nickname="setNickname"
          :readonly="readonlyNickname"
        />

        <CreateWallet
          v-else-if="showCreateForm"
          :currentIndexPage="currentIndexPage"
          :mnemonic="mnemonic"
          :selectedMnemonicElements="selectedMnemonicElements"
          :derivationPath="derivationPath"
          @updateSelectedMnemonicElements="updateSelectedMnemonicElements"
          @setValue="setValue"
        >
          <AdvancedButton :handler="toggleAdvancedFormVisible" />
        </CreateWallet>

        <ImportWallet
          v-else-if="showImportForm"
          v-model="typeImport"
          :mnemonic="mnemonic"
          :rawSeed="rawSeed"
          :json="json"
          :passwordJson="passwordJson"
          :derivationPath="derivationPath"
          @setValue="setValue"
        >
          <AdvancedButton :handler="toggleAdvancedFormVisible" />
        </ImportWallet>

        <AdvancedForm
          v-else-if="showAdvancedForm"
          :derivationPath="derivationPath"
          :showEthereumDP="showEthereumDP"
          @saveChanges="setValue"
          @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
        />

        <PasswordForm v-else-if="showPasswordForm" />

        <FinishForm v-else-if="showFinishForm" />
      </div>

      <Button
        v-if="!showAdvancedForm"
        size="big"
        class="button"
        :text="buttonText"
        :disabled="disabledProceed"
        @click="proceed"
      />
    </div>

    <InvalidPopup v-if="showInvalidPopup" :handlerClose="handlerClosePopup" :headers="invalidPopupMessages" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { isHex } from '@polkadot/util';
import { GettersTypes } from '@/store/accounts/getters';
import { WalletConnectionStatus, DerivationPath, TypeFiledForImport } from '@/interfaces/connectionWallet';
import { mnemonicGenerate, mnemonicValidate } from '@polkadot/util-crypto';
import { Components } from '@/router/routes';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import { INVALID_POPUP_MESSAGES, InvalidValueName } from '@/consts/invalidPopupMessages';
import { ETHEREUM_DEFAULT_DERIVATION_PATH } from '@/consts/ethereumNetworks';
import { DEFAULT_DERIVATION_PATH } from '@/consts/derivationPath';
import keyring from '@polkadot/ui-keyring';
import InvalidPopup from '@/components/InvalidPopup.vue';
import CircleButton from '@/components/CircleButton.vue';
import Button from '@/components/Button.vue';
import CreateWallet from './CreateWallet.vue';
import FinishForm from './FinishForm.vue';
import PasswordForm from './PasswordForm.vue';
import ImportWallet from './ImportWallet.vue';
import NicknameForm from './NicknameForm.vue';
import AdvancedForm from './AdvancedForm.vue';
import AdvancedButton from './AdvancedButton.vue';
import AccountController from '@/controllers/accountController';

type FieldsComponent = 'passwordJson' | 'derivationPath';

@Component({
  components: {
    CreateWallet,
    ImportWallet,
    FinishForm,
    PasswordForm,
    InvalidPopup,
    NicknameForm,
    AdvancedForm,
    AdvancedButton,
    CircleButton,
    Button,
  },
})
export default class extends Vue {
  accountController = new AccountController();
  nickname = '';
  json = '';
  mnemonic = '';
  rawSeed = '';
  passwordJson = '';
  typeImport: TypeFiledForImport = 'mnemonic';
  invalidValueName: InvalidValueName = '';
  showAdvancedForm = false;
  selectedMnemonicElements: string[] = [];
  currentIndexPage = 1;
  derivationPath = DEFAULT_DERIVATION_PATH;

  @Prop(String) walletConnectionStatus!: WalletConnectionStatus;
  @Getter(GettersTypes.getPassword) passwordExtension!: string;

  get JSON() {
    try {
      const json = JSON.parse(this.json) as KeyringPair$Json;

      const isValid =
        Object.hasOwnProperty.call(json, 'encoded') &&
        Object.hasOwnProperty.call(json, 'encoding') &&
        Object.hasOwnProperty.call(json, 'meta') &&
        Object.hasOwnProperty.call(json, 'address');

      if (!isValid) throw Error;

      return json;
    } catch (e) {
      return undefined;
    }
  }

  get showEthereumDP() {
    return this.typeImport === 'mnemonic';
  }

  get readonlyNickname() {
    return !!this.json;
  }

  get showInvalidPopup() {
    return !!this.invalidValueName;
  }

  get invalidPopupMessages() {
    return this.invalidValueName ? INVALID_POPUP_MESSAGES[this.invalidValueName] : {};
  }

  get showNicknameForm() {
    return this.isImportWallet ? this.currentIndexPage === 2 : this.currentIndexPage === 1;
  }

  get showContentHeader() {
    if (this.showAdvancedForm) return false;

    return this.isImportWallet ? this.currentIndexPage <= 3 : this.currentIndexPage <= 4;
  }

  get countSteps() {
    return this.isImportWallet ? 4 : 5;
  }

  get isCreateWallet() {
    return this.walletConnectionStatus === 'isCreateWallet';
  }

  get isImportWallet() {
    return this.walletConnectionStatus === 'isImportWallet';
  }

  get showCreateForm() {
    return this.isCreateWallet && this.currentIndexPage < 4 && !this.showAdvancedForm;
  }

  get showImportForm() {
    return this.isImportWallet && this.currentIndexPage === 1 && !this.showAdvancedForm;
  }

  get showPasswordForm() {
    return this.isImportWallet ? this.currentIndexPage === 3 : this.currentIndexPage === 4;
  }

  get showBackIcon() {
    return this.isImportWallet ? this.currentIndexPage < 4 : this.currentIndexPage < 5;
  }

  get showFinishForm() {
    return this.isImportWallet ? this.currentIndexPage === 4 : this.currentIndexPage === 5;
  }

  get header() {
    if (this.isCreateWallet) {
      if (this.currentIndexPage === 1) return 'Create new wallet';
      else if (this.currentIndexPage === 2) return 'Backup the passphrase for your new wallet';
      else if (this.currentIndexPage === 3) return 'Confirm the passphrase';
      else if (this.showPasswordForm) return 'Set up password';
    }

    if (this.currentIndexPage === 1) return 'Import wallet';
    else if (this.currentIndexPage === 2) return 'Make up a nickname';
    else if (this.currentIndexPage === 3) return 'Enter password';

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
      if (this.currentIndexPage === 1) {
        return !this.mnemonic && !this.rawSeed && (Object.keys(this.json).length === 0 || !this.passwordJson);
      } else if (this.currentIndexPage === 2) return !this.nickname;
    }

    // isCreateWallet
    if (this.currentIndexPage === 1) return !this.nickname;
    else if (this.currentIndexPage === 3)
      return this.mnemonic.split(' ').length !== this.selectedMnemonicElements.length;

    return false;
  }

  @Watch('json')
  onTypeImportChanged(value: string) {
    this.nickname = ((this.JSON as KeyringPair$Json)?.meta?.name as string) || '';

    if (this.JSON === undefined && value !== '') this.invalidValueName = 'jsonInvalid';
  }

  toggleAdvancedFormVisible(value = true) {
    this.showAdvancedForm = value;
  }

  setValue(
    value: string & (KeyringPair$Json | Record<string, never>) & DerivationPath & boolean,
    typeField: TypeFiledForImport | FieldsComponent
  ) {
    this[typeField] = value;
  }

  setNickname(value: string) {
    this.nickname = value;
  }

  handlerClosePopup() {
    if (this.invalidValueName === 'jsonInvalid') this.json = '';

    this.invalidValueName = '';
    this.selectedMnemonicElements = [];
  }

  proceed() {
    if (this.isCreateWallet) this.createWallet();
    else this.importWallet();

    // if a invalid popup is shown, then the index does not need to be increased
    this.currentIndexPage += this.showInvalidPopup ? 0 : 1;

    if ((this.isCreateWallet && this.currentIndexPage === 6) || (this.isImportWallet && this.currentIndexPage === 5))
      this.$router.push({ name: Components.Wallet });
  }

  createWallet() {
    if (this.currentIndexPage === 1 && !this.mnemonic.length) this.mnemonic = mnemonicGenerate();
    else if (this.currentIndexPage === 3) {
      const isNotValidMnemonic = this.mnemonic
        .split(' ')
        .map((mnemonicElement, index) => this.selectedMnemonicElements[index] === mnemonicElement)
        .includes(false);

      this.invalidValueName = isNotValidMnemonic ? 'passphrase' : '';
    } else if (this.currentIndexPage === 4) this.accountAuthorization();
  }

  importWallet() {
    if (this.currentIndexPage === 1) this.validateSuri();
    else if (this.currentIndexPage === 3 && Object.keys(this.json).length === 0) this.accountAuthorization();
  }

  validateSuri() {
    const isValidMnemonic = this.mnemonic ? mnemonicValidate(this.mnemonic) : true;
    const isValidRawSeed = this.rawSeed ? isHex(this.rawSeed) : true;
    const isValidJson = this.json ? this.restoreJson() : true;

    this.invalidValueName = !isValidMnemonic
      ? 'mnemonic'
      : !isValidRawSeed
      ? 'rawSeed'
      : !isValidJson
      ? 'jsonPassword'
      : '';
  }

  accountAuthorization() {
    // test row seed: 0x3d60d4270bc927dc5985631c9ae2f661a22458bd1733a6716da3b50aeb583912
    // test mnemonic: sibling image belt spot resist year labor style fringe hamster render idle
    const {
      substrate: { value: substrateDP, keyPair: substrateKeyPair },
      ethereum: { value: ethereumDP, keyPair: ethereumKeyPair },
    } = this.derivationPath;
    const suriSubstrate = `${this.mnemonic || this.rawSeed}${substrateDP}`;

    keyring.addUri(suriSubstrate, '', { name: this.nickname }, substrateKeyPair);

    // We create an ETH account only if we entered the mnemonic
    if (this.mnemonic) {
      const suriEthereum = `${this.mnemonic}${ethereumDP ?? ETHEREUM_DEFAULT_DERIVATION_PATH}`;

      keyring.addUri(suriEthereum, '', { name: this.nickname }, ethereumKeyPair);
    }

    this.accountController.savePassword(this.passwordExtension);

    alert(this.isImportWallet ? 'Wallet imported. Check console' : 'Wallet created. Check console');
  }

  restoreJson() {
    try {
      keyring.restoreAccount(this.JSON as KeyringPair$Json, this.passwordJson);

      alert('Wallet imported. Check console');

      return true;
    } catch {
      return false;
    }
  }

  updateSelectedMnemonicElements(element: string, index: number, added: boolean) {
    if (added) this.selectedMnemonicElements.push(element);
    else this.selectedMnemonicElements.splice(index, 1);
  }

  fullScreen() {
    alert('full screen');
  }

  back() {
    if (this.currentIndexPage === 1) {
      this.mnemonic = '';
      this.nickname = '';
      this.derivationPath = DEFAULT_DERIVATION_PATH;

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
        background-color: var(--pink-color);
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

    .button {
      width: 100%;
    }

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
