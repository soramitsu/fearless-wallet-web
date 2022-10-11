<template>
  <div class="add-wallet">
    <div class="header">
      <div class="icon-container">
        <CircleButton v-if="showBackIcon" backgroundColor="light-black" iconName="chevron-left" @click="back" />
      </div>
      <div v-if="countSteps > 1" class="steps">
        <div v-for="num in countSteps" :key="num" :class="getClassesStep(num)"></div>
      </div>
      <div class="icon-background">
        <CircleButton
          v-if="showFullScreenIcon"
          iconName="expand"
          backgroundColor="light-black"
          @click="openFullScreen"
        />
      </div>
    </div>

    <div class="content-wrapper">
      <div class="content">
        <div class="content-header">{{ header }}</div>

        <Input
          v-if="showReplacedNetwork"
          v-model="replaceNetworkUpper"
          placeholder="Network"
          size="big"
          :maxlength="15"
          :readonly="true"
          class="selected-network"
        />

        <NicknameForm
          v-if="!showReplacedNetwork && showNicknameForm"
          :nickname="nickname"
          :readonly="readonlyNickname"
          @update:nickname="setNickname"
        />

        <CreateWallet
          v-if="showCreateForm"
          :step="step"
          :mnemonic="mnemonic"
          :selectedMnemonicElements="selectedMnemonicElements"
          @update:selectedMnemonicElements="updateSelectedMnemonicElements"
        >
          <AdvancedButton @click="toggleAdvancedFormVisible" />
        </CreateWallet>

        <ImportWallet
          v-if="showImportForm"
          v-model="typeImport"
          :step="step"
          :mnemonic="mnemonic"
          :substrateRawSeed="substrateRawSeed"
          :ethereumRawSeed="ethereumRawSeed"
          :substrateJson="substrateJson"
          :ethereumJson="ethereumJson"
          :passwordJson="passwordJson"
          :isReplaceAccount="isReplaceAccount"
          :isEthereumReplacedNetwork="isEthereumReplacedNetwork"
          @setImportValue="setImportValue"
          @reset="reset"
          @update:passwordJson="setPasswordJson"
        >
          <AdvancedButton @click="toggleAdvancedFormVisible" />
        </ImportWallet>

        <AdvancedForm
          v-if="showAdvancedForm"
          :derivationPaths="derivationPaths"
          :showEthereumDP="showEthereumDP"
          :showSubstrateDP="showSubstrateDP"
          @updateDP="updateDP"
          @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
        />

        <PasswordForm
          v-if="showPasswordForm"
          :displayMockPassword="displayMockPassword"
          @updateWalletPassword="updateWalletPassword"
        />

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
      :headers="invalidMessages"
      :handlerClose="handlerCloseNotificationPopup"
    />

    <AddEthereumAccountPopup
      v-if="showAddEthereumAccountPopup"
      sizeWidth="medium"
      :handlerClose="closeAddEthereumAccountPopup"
      :handlerAgree="handlerAgree"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import CreateWallet from './CreateWallet.vue';
import FinishForm from './FinishForm.vue';
import PasswordForm from './PasswordForm.vue';
import ImportWallet from './ImportWallet.vue';
import NicknameForm from './NicknameForm.vue';
import AdvancedForm from './AdvancedForm.vue';
import AdvancedButton from './AdvancedButton.vue';
import AddEthereumAccountPopup from './AddEthereumAccountPopup.vue';
import type {
  DerivationPaths,
  ImportType,
  ValidateJsonResult,
  MnemonicConfirmation,
  TAction,
} from '@/interfaces/common';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import type { SelectedWallet, SetSelectedWallet } from '@/store/accounts/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import BaseApi from '@/util/BaseApi';
import NotificationPopup from '@/components/NotificationPopup.vue';
import CircleButton from '@/components/CircleButton.vue';
import Input from '@/components/Input.vue';
import Button from '@/components/Button.vue';
import { Components } from '@/router/routes';
import { INVALID_MESSAGES, InvalidValueName } from '@/consts/invalidMessages';
import { INITIAL_DERIVATION_PATHS, ETHEREUM_DEFAULT_DERIVATION_PATH } from '@/consts/derivationPath';
import { ActionTypes as ActionActionTypes } from '@/store/accounts/actions';

type AddWalletField = 'mnemonic' | 'ethereumRawSeed' | 'substrateRawSeed' | 'substrateJson' | 'ethereumJson';

@Component({
  components: {
    Input,
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
    AddEthereumAccountPopup,
  },
})
export default class AddWallet extends Vue {
  step = 1;
  nickname = '';
  mnemonic = '';
  walletPassword = '';
  passwordSubstrateJson = '';
  passwordEthereumJson = '';
  ethereumJson = '';
  substrateJson = '';
  ethereumRawSeed = '';
  substrateRawSeed = '';
  displayMockPassword = false;
  showAdvancedForm = false;
  showAddEthereumAccountPopup = false;
  selectedMnemonicElements: MnemonicConfirmation[] = [];
  invalidValueName: InvalidValueName = '';
  typeImport: ImportType = 'mnemonic';
  derivationPaths = INITIAL_DERIVATION_PATHS;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Action(ActionActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<SetSelectedWallet>;

  get replacedNetwork() {
    return this.$route.params.network ?? '';
  }

  get isReplaceAccount() {
    return this.replacedNetwork !== '';
  }

  get replaceNetworkUpper() {
    return this.replacedNetwork.toUpperCase();
  }

  get showReplacedNetwork() {
    return this.replacedNetwork !== '' && this.step === 1;
  }

  get showFullScreenIcon() {
    return BaseApi.useIsPopup();
  }

  get isEthereumReplacedNetwork() {
    return BaseApi.isEthereumNetwork(this.replacedNetwork);
  }

  get addWalletType() {
    return this.$route.params.type;
  }

  get passwordJson() {
    if (this.isReplaceAccount) {
      return this.isEthereumReplacedNetwork ? this.passwordEthereumJson : this.passwordSubstrateJson;
    }

    return this.step === 1 ? this.passwordSubstrateJson : this.passwordEthereumJson;
  }

  get substrateJSON() {
    return BaseApi.parseJson(this.substrateJson);
  }

  get ethereumJSON() {
    return BaseApi.parseJson(this.ethereumJson);
  }

  get showSubstrateDP() {
    return !this.isReplaceAccount || !this.isEthereumReplacedNetwork;
  }

  get showEthereumDP() {
    return !this.isReplaceAccount ? this.typeImport === 'mnemonic' : this.isEthereumReplacedNetwork;
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
    return (this.isImportWallet && this.step === 3) || (this.isCreateWallet && this.step === 1);
  }

  get countSteps() {
    let countSteps = 4;

    if (!this.isReplaceAccount) {
      //  add mnemonic confirmation or import eth account
      if (this.isCreateWallet || (this.isImportWallet && this.typeImport === 'rawSeed')) countSteps += 1;
    } else {
      // if we make a replace account via import, then you do not need to enter a nickname and not show FinishPage
      if (this.isImportWallet) {
        countSteps -= 2;

        // no need to separately enter password for json
        if (this.typeImport === 'json') countSteps -= 1;
      }
    }

    return countSteps;
  }

  get isCreateWallet() {
    return this.addWalletType === 'create';
  }

  get isImportWallet() {
    return this.addWalletType === 'import';
  }

  get showCreateForm() {
    return this.isCreateWallet && (this.step === 2 || this.step === 3) && !this.showAdvancedForm;
  }

  get showImportForm() {
    return this.isImportWallet && (this.step === 1 || this.step === 2) && !this.showAdvancedForm;
  }

  get showPasswordForm() {
    return this.step === 4;
  }

  get showBackIcon() {
    return this.step < 5;
  }

  get showFinishForm() {
    return this.step === 5;
  }

  get header() {
    if (this.isCreateWallet) {
      if (this.step === 1) return 'Create new wallet';
      else if (this.step === 2) return 'Backup the passphrase for your new wallet';
      else if (this.step === 3) return 'Confirm the passphrase';
      else if (this.showPasswordForm) return 'Set up password';
    }

    if (this.step === 1) {
      if (this.isReplaceAccount) {
        if (this.isEthereumReplacedNetwork) return 'Import ethereum accounts';
        else return 'Import substrate accounts';
      }

      if (this.typeImport === 'mnemonic') return 'Import wallet';
      else return 'Import substrate accounts';
    } else if (this.step === 2) return 'Import ethereum accounts';
    else if (this.step === 3) return 'Wallet nickname';
    else if (this.step === 4) return 'Enter password';

    return '';
  }

  get buttonText() {
    if (this.isCreateWallet && this.step === 2) return 'I have written down passphrase';
    else if (this.showFinishForm) return 'Start using Fearless';

    return 'Continue';
  }

  get disabledProceed() {
    // mutual logic step(password)
    if (this.showPasswordForm) return !this.displayMockPassword && !this.walletPassword;

    if (this.isImportWallet) {
      if (this.step === 1) {
        return (
          !this.mnemonic &&
          !this.substrateRawSeed &&
          (this.isReplaceAccount && this.isEthereumReplacedNetwork
            ? !this.ethereumRawSeed &&
              !this.ethereumRawSeed &&
              Object.keys(this.ethereumJson).length === 0 &&
              this.passwordEthereumJson
            : true) &&
          (Object.keys(this.substrateJson).length === 0 || !this.passwordSubstrateJson)
        );
      }

      if (this.step === 2)
        return (
          (!this.substrateRawSeed || !this.ethereumRawSeed) &&
          (Object.keys(this.ethereumJson).length === 0 || !this.passwordEthereumJson)
        );

      if (this.step === 3) return !this.nickname;
    }

    // isCreateWallet
    if (this.step === 1 && !this.isReplaceAccount) return !this.nickname;

    if (this.step === 3) return this.mnemonic.split(' ').length !== this.selectedMnemonicElements.length;

    return false;
  }

  get suriSubstrate() {
    const {
      substrate: { value: substrateDerivationPath },
    } = this.derivationPaths;

    return `${this.mnemonic || this.substrateRawSeed}${substrateDerivationPath.trim()}`;
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
        : ''
    ).trim();

    return this.mnemonic
      ? `${this.mnemonic}${ethereumDP || ETHEREUM_DEFAULT_DERIVATION_PATH}`
      : this.ethereumRawSeed
      ? this.ethereumRawSeed
      : '';
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

  @Watch('step')
  changedCurrentIndexPage(step: number) {
    if (this.step === 4) {
      const {
        substrate: { keypairType: substrateKeypairType },
        ethereum: { keypairType: ethereumKeypairType },
      } = this.derivationPaths;
      const suri = this.isEthereumReplacedNetwork ? this.suriEthereum : this.suriSubstrate;
      const type = this.isEthereumReplacedNetwork ? ethereumKeypairType : substrateKeypairType;
      const { address } = BaseApi.createFromUri(suri, type);

      if (BaseApi.isDuplicateReplacedKeypair(address)) this.displayMockPassword = true;
      else this.displayMockPassword = false;
    } else if (this.step === 5) {
      if (this.isReplaceAccount) {
        try {
          this.replaceAccount();
        } catch {
          return;
        }

        this.$router.push({ name: Components.Accounts });

        return;
      }

      const address = this.saveKeypair();

      this.setSelectedWallet({ selectedWalletAddress: address });
    } else if (step === 6) this.$router.push({ name: Components.Wallet });
  }

  updateWalletPassword(password: string) {
    this.walletPassword = password;
  }

  getClassesStep(num: number) {
    const isCircleFilled =
      this.isCreateWallet || this.typeImport !== 'mnemonic'
        ? num <= this.step
        : num !== 1
        ? num <= this.step - 1
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

  updateDP(derivationPaths: DerivationPaths) {
    this.derivationPaths = derivationPaths;
  }

  reset() {
    this.mnemonic = '';
    this.substrateRawSeed = '';
    this.ethereumRawSeed = '';
    this.substrateJson = '';
    this.ethereumJson = '';
    this.passwordSubstrateJson = '';
    this.passwordEthereumJson = '';
    this.derivationPaths = INITIAL_DERIVATION_PATHS;
  }

  setImportValue(value: string & (KeyringPair$Json | Record<string, never>), field: AddWalletField) {
    this[field] = value;
  }

  setNickname(value: string) {
    this.nickname = value;
  }

  setPasswordJson(value: string) {
    if (this.isReplaceAccount) {
      if (this.isEthereumReplacedNetwork) this.passwordEthereumJson = value;
      else this.passwordSubstrateJson = value;
    } else {
      if (this.step === 1) this.passwordSubstrateJson = value;
      else this.passwordEthereumJson = value;
    }
  }

  handlerCloseNotificationPopup() {
    if (this.invalidValueName === 'jsonInvalid') {
      if (this.step === 1) this.substrateJson = '';
      else if (this.step === 2) this.ethereumJson = '';
    }

    if (this.step === 1) this.passwordSubstrateJson = '';
    else if (this.step === 2) this.passwordEthereumJson = '';

    this.invalidValueName = '';
    this.selectedMnemonicElements = [];
  }

  closeAddEthereumAccountPopup() {
    this.showAddEthereumAccountPopup = false;

    this.step += 2;
  }

  handlerAgree() {
    this.showAddEthereumAccountPopup = false;
    this.step += 1;
  }

  proceed() {
    if (this.isCreateWallet) this.createFlow();
    else this.importFlow();

    // if a invalid popup or add ETH account popup is shown, then the index does not need to be increased
    this.step += this.showNotificationPopup || this.showAddEthereumAccountPopup ? 0 : 1;
  }

  createFlow() {
    if (this.step === 1 && !this.mnemonic.length) this.mnemonic = BaseApi.generateMnemonic();
    else if (this.step === 3) this.validateSuri();
  }

  importFlow() {
    if (this.step === 1) {
      this.validateSuri();

      if (this.invalidValueName !== '') return;
      else if (this.isReplaceAccount) {
        this.step += 2;

        // no need to separately enter password for json
        if (this.typeImport === 'json') this.step += 1;

        return;
      }

      // if import type is raw seed or json, show a window with a question about adding an ETH account
      if (this.typeImport === 'mnemonic') this.step += 1;
      else this.showAddEthereumAccountPopup = true;
    } else if (this.step === 2) this.validateSuri();
    else if (this.step === 3 && this.typeImport === 'json') this.step += 1;
  }

  validateSuri() {
    const { ethereum, substrate } = this.derivationPaths;
    const isValidMnemonic = this.mnemonic ? BaseApi.isValidPhrase(this.mnemonic) : true;
    const isValidSubstratePhrase = substrate.value ? BaseApi.isValidSubstrateDerivationPath(substrate) : true;
    const isValidEthereumDP = ethereum.value ? BaseApi.isValidEthereumDerivationPath(ethereum.value) : true;
    const isValidSubstrateRawSeed = this.substrateRawSeed ? BaseApi.isHex(this.substrateRawSeed) : true;
    const isValidEthereumRawSeed = this.ethereumRawSeed ? BaseApi.isHex(this.ethereumRawSeed) : true;

    const validatedSubstrateJson =
      this.substrateJson !== ''
        ? BaseApi.isValidJson(this.substrateJSON, this.passwordSubstrateJson)
        : ({ value: true } as ValidateJsonResult);

    const validatedEthereumJson =
      this.ethereumJson !== ''
        ? BaseApi.isValidJson(this.ethereumJSON, this.passwordEthereumJson)
        : ({ value: true } as ValidateJsonResult);

    const isValidSequenceMnemonic = this.isCreateWallet
      ? BaseApi.isValidSequenceMnemonic(
          this.mnemonic,
          this.selectedMnemonicElements.map(({ word }) => word)
        )
      : true;

    if (!isValidSequenceMnemonic) this.invalidValueName = 'mnemonicSequence';
    else if (!isValidMnemonic) this.invalidValueName = 'mnemonic';
    else if (!isValidSubstratePhrase) this.invalidValueName = 'substrateDP';
    else if (!isValidEthereumDP) this.invalidValueName = 'ethereumDP';
    else if (!isValidSubstrateRawSeed || !isValidEthereumRawSeed) this.invalidValueName = 'rawSeed';
    else if (!validatedSubstrateJson.value) this.invalidValueName = validatedSubstrateJson.errorType;
    else if (!validatedEthereumJson.value) this.invalidValueName = validatedEthereumJson.errorType;
  }

  replaceAccount() {
    try {
      if (this.substrateJson || this.ethereumJson) this.replaceAccountFromJson();
      else this.replaceAccountFromSeed();
    } catch ({ message }) {
      this.step = 1;

      alert(message);

      throw Error;
    }
  }

  saveKeypair() {
    if (this.substrateJson) return this.saveKeypairFromJson();
    else return this.saveKeypairFromSeed();
  }

  saveKeypairFromSeed() {
    const meta: Record<string, unknown> = { name: this.nickname.trim() };
    const {
      substrate: { keypairType: substrateKeypairType },
      ethereum: { keypairType: ethereumKeypairType },
    } = this.derivationPaths;

    if (this.suriEthereum !== '') {
      const { address: ethereumAddress } = BaseApi.addKeypair(
        this.suriEthereum,
        this.walletPassword,
        meta,
        ethereumKeypairType
      );

      meta.ethereumAddress = ethereumAddress;
    }

    const { address } = BaseApi.addKeypair(this.suriSubstrate, this.walletPassword, meta, substrateKeypairType);

    return address;
  }

  saveKeypairFromJson() {
    const substrateJSON = { ...this.substrateJSON };

    if (this.ethereumJson) {
      const { address } = BaseApi.addKeypairFromJson(this.ethereumJSON, this.passwordEthereumJson);

      substrateJSON.meta.ethereumAddress = address;
    }

    const { address } = BaseApi.addKeypairFromJson(substrateJSON, this.passwordSubstrateJson);

    return address;
  }

  replaceAccountFromSeed() {
    const {
      substrate: { keypairType: substrateKeypairType },
      ethereum: { keypairType: ethereumKeypairType },
    } = this.derivationPaths;

    const parent = this.isEthereumReplacedNetwork ? this.selectedWallet.ethereumAddress : this.selectedWallet.address;
    const suri = this.isEthereumReplacedNetwork ? this.suriEthereum : this.suriSubstrate;
    const type = this.isEthereumReplacedNetwork ? ethereumKeypairType : substrateKeypairType;

    BaseApi.replaceAccountFromSeed(suri, this.walletPassword, type, parent, this.replacedNetwork);
  }

  replaceAccountFromJson() {
    const parent = this.isEthereumReplacedNetwork ? this.selectedWallet.ethereumAddress : this.selectedWallet.address;
    const json = this.isEthereumReplacedNetwork ? this.ethereumJSON : this.substrateJSON;
    const password = this.isEthereumReplacedNetwork ? this.passwordEthereumJson : this.passwordSubstrateJson;

    BaseApi.replaceAccountFromJson(json, password, parent, this.replacedNetwork);
  }

  updateSelectedMnemonicElements(value: MnemonicConfirmation[]) {
    this.selectedMnemonicElements = value;
  }

  openFullScreen() {
    BaseApi.windowOpen('/');
  }

  back() {
    if (this.step === 3 && this.ethereumRawSeed === '' && this.ethereumJson === '' && this.isImportWallet)
      this.step -= 1;
    else if (this.step === 4 && this.isReplaceAccount) this.step -= 2;
    else if (this.step === 2) {
      this.ethereumRawSeed = '';
      this.ethereumJson = '';
    }

    if (this.step === 1) this.$router.go(-1);

    this.step -= 1;
  }
}
</script>

<style lang="scss" scoped>
.add-wallet {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: calc(100% - 16px);

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
        background-color: $default-background-color;
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

  .content-wrapper {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;

    .content {
      width: 100%;

      .selected-network {
        margin-bottom: 16px;
      }
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
    color: $gray-color;
  }

  .icon-container {
    width: 32px;
    height: 32px;
  }
}
</style>
