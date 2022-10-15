<template>
  <div class="add-wallet">
    <div class="header">
      <div class="icon-container">
        <CircleButton v-if="showBackIcon" backgroundColor="light-black" iconName="chevron-left" @click="back" />
      </div>
      <div class="steps">
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
          :isOnlyEthereumAccountFlow="isOnlyEthereumAccountFlow"
          :isReplaceAccountFlow="isReplaceAccountFlow"
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
          :showMockPassword="showMockPassword"
          :showSamePasswordText="isOnlyEthereumAccountFlow || isReplaceAccountFlow"
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
import { INVALID_MESSAGES, InvalidValueName } from '@/consts/messages';
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
  readonly countSteps = 5;

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
  showMockPassword = false;
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

  get isReplaceAccountFlow() {
    return this.replacedNetwork !== '';
  }

  get isOnlyEthereumAccountFlow() {
    return this.$route.params.onlyEthereumAccount !== undefined;
  }

  get replaceNetworkUpper() {
    return this.replacedNetwork.toUpperCase();
  }

  get showReplacedNetwork() {
    return this.isReplaceAccountFlow && this.step === 1;
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
    if (this.isReplaceAccountFlow) {
      return this.isEthereumReplacedNetwork ? this.passwordEthereumJson : this.passwordSubstrateJson;
    }

    if (this.isOnlyEthereumAccountFlow) {
      return this.passwordEthereumJson;
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
    return !this.isReplaceAccountFlow || !this.isEthereumReplacedNetwork;
  }

  get showEthereumDP() {
    return !this.isReplaceAccountFlow ? this.typeImport === 'mnemonic' : this.isEthereumReplacedNetwork;
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
      if (this.step === 2) return 'Backup the passphrase for your new wallet';
      if (this.step === 3) return 'Confirm the passphrase';
      if (this.step === 4) return 'Set up password';
    }

    if (this.step === 1) {
      if (this.isReplaceAccountFlow) {
        if (this.isEthereumReplacedNetwork) return 'Import ethereum account';
        else return 'Import substrate account';
      }

      if (this.isOnlyEthereumAccountFlow) return 'Add ethereum account';

      if (this.typeImport === 'mnemonic') return 'Import wallet';
      else return 'Import substrate account';
    } else if (this.step === 2) return 'Import ethereum account';
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
    if (this.showPasswordForm) return !this.showMockPassword && !this.walletPassword;

    if (this.isImportWallet) {
      if (this.step === 1) {
        return (
          !this.mnemonic &&
          !this.substrateRawSeed &&
          (this.isReplaceAccountFlow && this.isEthereumReplacedNetwork
            ? !this.ethereumRawSeed && Object.keys(this.ethereumJson).length === 0 && this.passwordEthereumJson
            : true) &&
          (Object.keys(this.substrateJson).length === 0 || !this.passwordSubstrateJson)
        );
      }

      if (this.step === 2)
        return !this.ethereumRawSeed && (Object.keys(this.ethereumJson).length === 0 || !this.passwordEthereumJson);

      if (this.step === 3) return !this.nickname;
    }

    // isCreateWallet
    if (this.step === 1 && !this.isReplaceAccountFlow) return !this.nickname;

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
        : ETHEREUM_DEFAULT_DERIVATION_PATH
    ).trim();

    return this.mnemonic ? `${this.mnemonic}${ethereumDP}` : this.ethereumRawSeed ? this.ethereumRawSeed : '';
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
  changedCurrentStep(step: number) {
    if (step === 0) this.$router.back();

    if (step === 4) {
      const {
        substrate: { keypairType: substrateKeypairType },
        ethereum: { keypairType: ethereumKeypairType },
      } = this.derivationPaths;
      const suri =
        this.isEthereumReplacedNetwork || this.isOnlyEthereumAccountFlow ? this.suriEthereum : this.suriSubstrate;
      const type =
        this.isEthereumReplacedNetwork || this.isOnlyEthereumAccountFlow ? ethereumKeypairType : substrateKeypairType;

      const { address } = BaseApi.createFromUri(suri, type);

      if (BaseApi.isDuplicateReplacedKeypair(address)) this.showMockPassword = true;
      else this.showMockPassword = false;

      return;
    }

    if (step === 5) {
      if (this.isReplaceAccountFlow) {
        try {
          this.replaceAccount();
        } catch {
          return;
        }

        this.$router.push({ name: Components.Accounts });

        return;
      }

      const address = this.saveKeypair();

      this.setSelectedWallet({ selectedWalletAddress: address || this.selectedWallet.address });

      if (this.isOnlyEthereumAccountFlow) this.$router.push({ name: Components.Wallet });

      return;
    }

    if (step === 6) this.$router.push({ name: Components.Wallet });
  }

  mounted() {
    if (this.isOnlyEthereumAccountFlow && this.isCreateWallet) this.proceed();
  }

  updateWalletPassword(password: string) {
    this.walletPassword = password;
  }

  getClassesStep(num: number) {
    let arrayWithHiddenSteps: number[] = [];

    // steps import: 1 - type import, 2 - eth account, 3 - nickname, 4 - password, 5 - finish form
    // steps create: 1 - nickname, 2 - view mnemonic, 3 - confirm mnemonic, 4 - password, 5 - finish form
    if (this.isReplaceAccountFlow) {
      if (this.isImportWallet) {
        if (this.typeImport === 'mnemonic' || this.typeImport === 'rawSeed') arrayWithHiddenSteps = [2, 3, 5];
        else if (this.typeImport === 'json') arrayWithHiddenSteps = [2, 3, 4, 5];
      } else arrayWithHiddenSteps = [5];
    } else if (this.isOnlyEthereumAccountFlow) {
      if (this.isImportWallet) {
        if (this.typeImport === 'mnemonic' || this.typeImport === 'rawSeed') arrayWithHiddenSteps = [2, 3, 5];
        else if (this.typeImport === 'json') arrayWithHiddenSteps = [2, 3, 4, 5];
      } else arrayWithHiddenSteps = [1, 5];
    } else if (this.isImportWallet) {
      if (this.typeImport === 'json') arrayWithHiddenSteps = [4];
      else if (this.typeImport === 'mnemonic') arrayWithHiddenSteps = [2];
    }

    const isCircleHidden = arrayWithHiddenSteps.includes(num) || arrayWithHiddenSteps.length === this.countSteps - 1;
    const isCircleFilled = !isCircleHidden && num <= this.step;

    return [
      'circle-step',
      {
        'circle-filled': isCircleFilled,
        'circle-hidden': isCircleHidden,
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
    this.nickname = '';
    this.derivationPaths = INITIAL_DERIVATION_PATHS;
  }

  setImportValue(value: string & (KeyringPair$Json | Record<string, never>), field: AddWalletField) {
    this[field] = value;
  }

  setNickname(value: string) {
    this.nickname = value;
  }

  setPasswordJson(value: string) {
    if (this.isReplaceAccountFlow) {
      if (this.isEthereumReplacedNetwork) this.passwordEthereumJson = value;
      else this.passwordSubstrateJson = value;
    } else if (this.isOnlyEthereumAccountFlow) {
      this.passwordEthereumJson = value;
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

  checkPassword() {
    const isSameWalletPassword = BaseApi.isSameWalletPassword(this.selectedWallet.address, this.walletPassword);

    if (!isSameWalletPassword) this.invalidValueName = 'isNotSamePassword';
  }

  createFlow() {
    if (this.step === 1 && !this.mnemonic.length) this.mnemonic = BaseApi.generateMnemonic();
    else if (this.step === 3) this.validateSuri();
    else if (this.step === 4 && (this.isOnlyEthereumAccountFlow || this.isReplaceAccountFlow)) this.checkPassword();
  }

  importFlow() {
    if (this.step === 1) {
      this.validateSuri();

      if (this.invalidValueName !== '') return;
      else if (this.isReplaceAccountFlow || this.isOnlyEthereumAccountFlow) {
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
    else if (this.step === 4 && (this.isOnlyEthereumAccountFlow || this.isReplaceAccountFlow)) this.checkPassword();
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
    if (this.substrateJson || this.ethereumJson) return this.saveKeypairFromJson();
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

      if (this.isOnlyEthereumAccountFlow) {
        BaseApi.saveEthereumAddress(this.selectedWallet.address, ethereumAddress);

        return '';
      }

      meta.ethereumAddress = ethereumAddress;
    }

    const { address } = BaseApi.addKeypair(this.suriSubstrate, this.walletPassword, meta, substrateKeypairType);

    return address;
  }

  saveKeypairFromJson() {
    const substrateJSON = { ...this.substrateJSON };

    if (this.ethereumJson) {
      const { address: ethereumAddress } = BaseApi.addKeypairFromJson(this.ethereumJSON, this.passwordEthereumJson);

      if (this.isOnlyEthereumAccountFlow) {
        BaseApi.saveEthereumAddress(this.selectedWallet.address, ethereumAddress);

        return '';
      }

      substrateJSON.meta.ethereumAddress = ethereumAddress;
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
    if (this.isOnlyEthereumAccountFlow) {
      if (this.step === 2) this.step -= 1;
      else if (this.step === 4) this.step -= 2;
    } else if (this.isImportWallet) {
      if ((this.isReplaceAccountFlow || this.isOnlyEthereumAccountFlow) && this.step === 4) this.step -= 2;
      else if (this.step === 3 && this.ethereumRawSeed === '' && this.ethereumJson === '') this.step -= 1;
    } else if (this.step === 2) {
      this.ethereumRawSeed = '';
      this.ethereumJson = '';
    }

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
    margin-bottom: 24px;
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
      }

      .circle-filled {
        background-color: $pink-color;
      }

      .circle-hidden {
        display: none;
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
