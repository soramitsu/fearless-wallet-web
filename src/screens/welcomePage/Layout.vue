<template>
  <div class="layout">
    <div class="header" v-if="!showMainPage">
      <div class="icon-container">
        <div v-if="showBackIcon" :class="backIconClasses" @click="back">
          <s-icon name="chevron-left-16" />
        </div>
      </div>
      <div class="steps">
        <div
          v-for="item in countSteps"
          :key="item"
          class="circle-step"
          :class="item <= currentIndexPage ? 'circle-filled' : ''"
        ></div>
      </div>
      <div class="icon icon-background">
        <s-icon name="arrows-arrows-diagonals-bltr-24" class="arrows-diagonals" />
      </div>
    </div>

    <div v-if="!loading" class="content-block">
      <div class="content">
        <div v-if="showContentHeader" class="content-header">{{ header }}</div>

        <NicknameForm v-if="showNicknameForm" :nickname="nickname" @setValue="setValue" :readonly="readonlyNickname" />

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

        <MainPage v-else-if="showMainPage" />
      </div>

      <div v-if="!showMainPage">
        <s-button
          class="button"
          type="primary"
          size="big"
          border-radius="medium"
          @click="proceed"
          :disabled="disabledProceed"
        >
          {{ buttonText }}
        </s-button>
      </div>

      <InvalidPopup v-if="showInvalidPopup" :handlerClose="handlerClosePopup" :headers="invalidPopupHeader" />
    </div>

    <Loading v-else-if="loading" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Mutation, Getter } from 'vuex-class';
import { isHex } from '@polkadot/util';
import { MutationTypes } from '../../store/accounts/mutations';
import { GettersTypes } from '../../store/accounts/getters';
import { Accounts } from '../../store/accounts/types';
import { WalletConnectionStatus, DerivationPath, TypeFiledForImport } from '../../interfaces/connectionWallet';
import { isKeyringPairs$Json } from '../../util/typeGuards';
import { mnemonicGenerate, mnemonicValidate } from '@polkadot/util-crypto';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import type { KeyringPairs$Json } from '@polkadot/ui-keyring/types';
import { INVALID_POPUP_HEADERS } from '../../consts/invalidPopupHeaders';
import keyring from '@polkadot/ui-keyring';
import MainPage from '../mainPage/MainPage.vue';
import CreateWallet from './CreateWallet.vue';
import FinishForm from './FinishForm.vue';
import PasswordForm from './PasswordForm.vue';
import ImportWallet from './ImportWallet.vue';
import InvalidPopup from '../../components/InvalidPopup.vue';
import Loading from '../../components/Loading.vue';
import NicknameForm from './NicknameForm.vue';
import AdvancedForm from './AdvancedForm.vue';
import AdvancedButton from './AdvancedButton.vue';

type FieldsComponent = 'passwordJson' | 'derivationPath' | 'showEthereumDP';
type InvalidValueName = 'passphrase' | 'mnemonic' | 'rawSeed' | 'jsonPassword' | 'jsonInvalid' | '';

@Component({
  components: {
    MainPage,
    CreateWallet,
    ImportWallet,
    FinishForm,
    PasswordForm,
    Loading,
    InvalidPopup,
    NicknameForm,
    AdvancedForm,
    AdvancedButton,
  },
})
export default class extends Vue {
  nickname = '';
  json = '';
  mnemonic = '';
  rawSeed = '';
  passwordJson = '';
  invalidValueName: InvalidValueName = '';
  loading = false;
  showAdvancedForm = false;
  showEthereumDP = true;
  selectedMnemonicElements: string[] = [];
  currentIndexPage = 1;
  derivationPath: DerivationPath = {
    substrate: {
      value: '',
      keyPair: undefined,
    },
    ethereum: {
      value: '',
      keyPair: undefined,
    },
  };

  @Prop(String) walletConnectionStatus!: WalletConnectionStatus;
  @Getter(GettersTypes.getAccounts) accounts!: Accounts;
  @Getter(GettersTypes.getPassword) passwordExtension!: string;
  @Getter(GettersTypes.getHaveConnectedAccounts) haveConnectedAccounts!: boolean;
  @Mutation(MutationTypes.SET_ACCOUNT) setAccount: any;

  get JSON() {
    try {
      const json = JSON.parse(this.json) as KeyringPair$Json | KeyringPairs$Json;

      const isValid =
        Object.hasOwnProperty.call(json, 'encoded') &&
        Object.hasOwnProperty.call(json, 'encoding') &&
        ((Object.hasOwnProperty.call(json, 'meta') && Object.hasOwnProperty.call(json, 'address')) ||
          Object.hasOwnProperty.call(json, 'accounts'));

      if (!isValid) throw Error;

      return json;
    } catch (e) {
      return undefined;
    }
  }

  get readonlyNickname() {
    return !!this.json;
  }

  get showInvalidPopup() {
    return !!this.invalidValueName;
  }

  get invalidPopupHeader() {
    return this.invalidValueName ? INVALID_POPUP_HEADERS[this.invalidValueName] : {};
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

  get showMainPage() {
    return this.isImportWallet ? this.currentIndexPage === 5 : this.currentIndexPage === 6;
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

  get backIconClasses() {
    return [
      'icon',
      {
        'icon-background': this.currentIndexPage <= 4,
      },
    ];
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
    value: string & (KeyringPair$Json | KeyringPairs$Json | Record<string, never>) & DerivationPath & boolean,
    typeField: TypeFiledForImport | FieldsComponent
  ) {
    this[typeField] = value;
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
    if (this.currentIndexPage === 1) this.validateSuriValue();
    else if (this.currentIndexPage === 3) {
      if (Object.keys(this.json).length === 0) this.accountAuthorization();
      else if (Object.keys(this.json).length !== 0) this.restoreJson();
    }
  }

  validateSuriValue() {
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
    const { value: substrate, keyPair } = this.derivationPath.substrate;
    const suri = `${this.mnemonic || this.rawSeed}${substrate}`;

    keyring.addUri(suri, '', { name: this.nickname }, keyPair);

    alert(this.isImportWallet ? 'Wallet imported. Check console' : 'Wallet created. Check console');
  }

  restoreJson() {
    try {
      if (isKeyringPairs$Json(this.JSON as KeyringPair$Json | KeyringPairs$Json))
        keyring.restoreAccounts(this.JSON as KeyringPairs$Json, this.passwordJson);
      else keyring.restoreAccount(this.JSON as KeyringPair$Json, this.passwordJson);

      alert('Wallet imported. Check console');

      return true;
    } catch {
      return false;
    }
  }

  updateSelectedMnemonicElements(element: string, index: number, added: boolean) {
    if (added) {
      this.selectedMnemonicElements.push(element);
    } else {
      this.selectedMnemonicElements.splice(index, 1);
    }
  }

  back() {
    if (this.currentIndexPage === 1) {
      this.mnemonic = '';
      this.derivationPath = {
        substrate: {
          value: '',
          keyPair: undefined,
        },
        ethereum: {
          value: '',
          keyPair: undefined,
        },
      };

      this.nickname = '';
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
        background-color: #ee0077;
      }
    }
  }

  .content-block {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;

    .content {
      width: 100%;
      height: 100%;
    }

    .content-header {
      font-weight: 600;
      font-size: 20px;
      line-height: 25px;
      margin: 13.5px 0 21.5px;
    }
  }

  i {
    color: white;
  }

  .button {
    width: 528px;
    font-size: 18px;
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

  .icon {
    width: 32px;
    height: 32px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-radius: 50%;

    .arrows-diagonals {
      font-size: 18px !important;
    }

    &:hover {
      cursor: pointer;
      opacity: 1;
    }
  }

  .icon-background {
    background-color: rgba(255, 255, 255, 0.1);
  }
}
</style>
