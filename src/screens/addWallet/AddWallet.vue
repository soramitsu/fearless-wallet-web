<template>
  <div class="add-wallet">
    <div class="header">
      <div class="icon-container">
        <CircleButton
          v-if="showBackIcon"
          backgroundColor="light-black"
          iconName="chevron-left"
          data-testid="backBtn"
          @click="back"
        />
      </div>

      <div class="steps">
        <div v-for="num in countSteps" :key="num" :class="getClassesStep(num)"></div>
      </div>

      <div class="icon-background">
        <CircleButton
          v-if="isPopup"
          iconName="expand"
          backgroundColor="light-black"
          tooltipText="common.fullScreen"
          target=".expand"
          placement="left"
          @click="openFullScreen"
        />
      </div>
    </div>

    <div class="content-wrapper">
      <div class="content">
        <div class="content-header" data-testid="header">{{ header }}</div>

        <NicknameForm
          v-if="showNicknameForm"
          :nickname="nickname"
          :readonly="readonlyNickname"
          @update:nickname="setNickname"
        />

        <CreateWallet
          v-if="showCreateForm"
          :step="step"
          :mnemonic="mnemonic"
          :selectedMnemonicElements="selectedMnemonicElements"
          @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
          @update:selectedMnemonicElements="updateSelectedMnemonicElements"
        />

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
          :isOnlyEthereumAccount="isOnlyEthereumAccount"
          @setImportValue="setImportValue"
          @reset="reset"
          @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
          @update:passwordJson="setPasswordJson"
        />

        <AdvancedForm
          v-if="showAdvancedForm"
          :derivationPaths="derivationPaths"
          :showEthereumDP="showEthereumDP"
          @updateDP="updateDP"
          @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
        />

        <FinishForm v-if="showFinishForm" />
      </div>

      <div class="controls">
        <FButton
          v-if="confirmMnemonicStep"
          size="big"
          fontSize="big"
          width="64px"
          type="secondary"
          :border="false"
          :iconName="'reload'"
          data-testid="resetAllBtn"
          @click="resetAll"
        />

        <FButton
          v-if="confirmMnemonicStep"
          size="big"
          fontSize="big"
          width="100%"
          type="secondary"
          text="addWallet.skipConfirmation"
          :border="false"
          data-testid="skipBtn"
          @click="skipStep"
        />

        <FButton
          v-if="!showAdvancedForm"
          size="big"
          fontSize="big"
          width="100%"
          :iconName="isLoading ? 'loader' : ''"
          :iconType="isLoading ? 'loading' : ''"
          :disabled="disabledProceed"
          :text="isLoading ? '' : buttonText"
          data-testid="proceedBtn"
          @click="proceed"
        />
      </div>
    </div>

    <NotificationPopup
      v-if="showNotificationPopup"
      :headers="invalidMessages"
      acceptButtonText="common.accept"
      :showAcceptButton="isMobileWalletExists"
      :showRejectButton="isMobileWalletExists"
      @handlerClose="handlerCloseNotificationPopup"
      @handlerAccept="handlerAcceptAddWallet"
    />

    <AddEthereumAccountPopup
      v-if="showAddEthereumAccountPopup"
      sizeWidth="medium"
      @handlerClose="closeAddEthereumAccountPopup"
      @handlerAgree="handlerAgree"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { DerivationPaths, ImportType, ValidateJsonResult, MnemonicConfirmation } from '@/interfaces';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type { SelectedWallet } from '@/store';
import CreateWallet from '@/screens/addWallet/CreateWallet.vue';
import FinishForm from '@/screens/addWallet/FinishForm.vue';
import ImportWallet from '@/screens/addWallet/ImportWallet.vue';
import NicknameForm from '@/screens/addWallet/NicknameForm.vue';
import AdvancedForm from '@/screens/addWallet/AdvancedForm.vue';
import AddEthereumAccountPopup from '@/screens/addWallet/AddEthereumAccountPopup.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import BaseApi from '@/util/BaseApi';
import { Components } from '@/router/routes';
import { type WarningValueName } from '@/consts/messages';
import { INITIAL_DERIVATION_PATHS, ETHEREUM_DEFAULT_DERIVATION_PATH } from '@/consts/derivationPath';
import {
  forgetAccount,
  isDerivationPathValid,
  isJsonValid,
  jsonRestore,
  windowOpen,
  addAccount,
  updatePairMeta,
} from '@/extension/messaging';
import { IS_POPUP } from '@/consts/globalClient';

type AddWalletField = 'mnemonic' | 'ethereumRawSeed' | 'substrateRawSeed' | 'substrateJson' | 'ethereumJson';

@Component({
  components: {
    FinishForm,
    CreateWallet,
    ImportWallet,
    NicknameForm,
    AdvancedForm,
    AddEthereumAccountPopup,
  },
})
export default class AddWallet extends Vue {
  readonly isPopup = IS_POPUP;
  readonly countSteps = 4;

  step = 1;
  nickname = '';
  mnemonic = '';
  passwordSubstrateJson = '';
  passwordEthereumJson = '';
  ethereumJson = '';
  substrateJson = '';
  ethereumRawSeed = '';
  substrateRawSeed = '';
  showAdvancedForm = false;
  showAddEthereumAccountPopup = false;
  selectedMnemonicElements: MnemonicConfirmation[] = [];
  warningValueName: WarningValueName = '';
  typeImport: ImportType = 'mnemonic';
  derivationPaths = INITIAL_DERIVATION_PATHS;
  address: string | null = null;
  isLoading = false;

  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;

  get confirmMnemonicStep() {
    return this.step === 3 && this.isCreateWallet;
  }

  get isOnlyEthereumAccount() {
    return this.$route.params.onlyEthereumAccount !== undefined;
  }

  get walletType() {
    return this.$route.params.type;
  }

  get isDifferentPasswords() {
    return this.passwordEthereumJson !== this.passwordSubstrateJson;
  }

  get passwordJson() {
    if (this.isOnlyEthereumAccount) return this.passwordEthereumJson;

    return this.step === 1 ? this.passwordSubstrateJson : this.passwordEthereumJson;
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
    return this.warningValueName !== '';
  }

  get isMobileWalletExists() {
    return this.warningValueName === 'duplicateMobileWallet';
  }

  get invalidMessages() {
    if (!this.warningValueName) return {};

    const mainPath = `addWallet.warningMessages.${this.warningValueName}`;

    return {
      text: `${mainPath}.text`,
      subtext: `${mainPath}.subtext`,
    };
  }

  get showNicknameForm() {
    return (this.isImportWallet && this.step === 3) || (this.isCreateWallet && this.step === 1);
  }

  get isCreateWallet() {
    return this.walletType === 'create';
  }

  get isImportWallet() {
    return this.walletType === 'import';
  }

  get showCreateForm() {
    return this.isCreateWallet && (this.step === 2 || this.step === 3) && !this.showAdvancedForm;
  }

  get showImportForm() {
    return this.isImportWallet && (this.step === 1 || this.step === 2) && !this.showAdvancedForm;
  }

  get showBackIcon() {
    return this.step !== 4;
  }

  get showFinishForm() {
    return this.step === 4;
  }

  get header() {
    if (this.isCreateWallet) {
      if (this.step === 1) return this.t('createWallet');

      if (this.step === 2) return this.t('backupPassphrase');

      if (this.step === 3) return this.t('confirmPassphrase');
    }

    if (this.step === 1) {
      if (this.isOnlyEthereumAccount) return this.t('addEthereumAccount');

      return this.typeImport === 'mnemonic' ? this.t('importWallet') : this.t('importAccount', { type: 'substrate' });
    }

    if (this.step === 2) return this.t('importAccount', { type: 'ethereum' });

    if (this.step === 3) return this.t('walletNickname');

    return '';
  }

  get buttonText() {
    if (this.isCreateWallet && this.step === 2) return this.t('haveWrittenPassphrase');

    if (this.showFinishForm) return this.t('usingFearless');

    return 'common.continue';
  }

  get disabledProceed() {
    if (this.isLoading) return true;

    if (this.isImportWallet) {
      if (this.step === 1) {
        if (this.isOnlyEthereumAccount)
          return !this.ethereumRawSeed && this.isLengthZero(this.ethereumJson) && !this.passwordEthereumJson;

        if (
          !this.mnemonic &&
          !this.substrateRawSeed &&
          !this.passwordSubstrateJson &&
          this.isLengthZero(this.substrateJson)
        )
          return true;

        return false;
      }

      if (this.step === 2) {
        if (this.isDifferentPasswords) return true;

        if (!this.ethereumRawSeed) return true;

        if (!this.passwordEthereumJson) return true;

        if (this.isLengthZero(this.ethereumJson)) return true;

        return false;
      }

      if (this.step === 3) return !this.nickname;
    }

    // isCreateWallet
    if (this.step === 1) return !this.nickname;

    if (this.step === 3) return this.mnemonic.split(' ').length !== this.selectedMnemonicElements.length;

    return false;
  }

  get suriSubstrate() {
    const {
      substrate: { value: substrateDerivationPath },
    } = this.derivationPaths;

    return `${(this.mnemonic || this.substrateRawSeed).trim()}${substrateDerivationPath.trim()}`;
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

    return this.mnemonic
      ? `${this.mnemonic.trim()}${ethereumDP}`
      : this.ethereumRawSeed
      ? this.ethereumRawSeed.trim()
      : '';
  }

  @Watch('substrateJson')
  substrateJsonChanged(value: string) {
    if (this.isLengthZero(this.substrateJSON) && value !== '') {
      this.warningValueName = 'jsonInvalid';

      return;
    }

    this.nickname = (this.substrateJSON?.meta?.name as string) || '';
  }

  @Watch('ethereumJson')
  ethereumJsonChanged(value: string) {
    if (this.isLengthZero(this.ethereumJSON) && value !== '') this.warningValueName = 'jsonInvalid';
  }

  @Watch('step')
  async changedCurrentStep(step: number) {
    if (step === 0) this.$router.push({ name: Components.Welcome });

    if (step === 2) this.selectedMnemonicElements = [];
    else if (step === 5) this.$router.push({ name: Components.Wallet });
    else if (step === 4) {
      this.isLoading = true;

      await this.saveKeypair();

      this.isLoading = false;

      if (this.isOnlyEthereumAccount) this.$router.push({ name: Components.Wallet }).catch(() => {});
    }
  }

  mounted() {
    if (this.isOnlyEthereumAccount && this.isCreateWallet) this.proceed();
  }

  isLengthZero(value: string | KeyringPair$Json) {
    return Object.keys(value).length === 0;
  }

  t(value: string, obj: Record<string, string> = {}) {
    return this.$t(`addWallet.${value}`, obj);
  }

  getClassesStep(num: number) {
    let arrayWithHiddenSteps: number[] = [];

    // steps import: 1 - type import, 2 - eth account, 3 - nickname, 4 - finish form
    // steps create: 1 - nickname, 2 - view mnemonic, 3 - confirm mnemonic, 4 - finish form
    if (this.isOnlyEthereumAccount) {
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
    this.address = null;
    this.derivationPaths = INITIAL_DERIVATION_PATHS;
  }

  setImportValue(value: string & (KeyringPair$Json | Record<string, never>), field: AddWalletField) {
    this[field] = value;
  }

  setNickname(value: string) {
    this.nickname = value;
  }

  setPasswordJson(value: string) {
    if (this.isOnlyEthereumAccount) {
      this.passwordEthereumJson = value;
    } else {
      if (this.step === 1) this.passwordSubstrateJson = value;
      else this.passwordEthereumJson = value;
    }
  }

  async handlerCloseNotificationPopup() {
    if (this.warningValueName === 'jsonInvalid') {
      if (this.step === 1) this.substrateJson = '';
      else if (this.step === 2) this.ethereumJson = '';
    }

    if (this.step === 1) this.passwordSubstrateJson = '';
    else if (this.step === 2) this.passwordEthereumJson = '';

    if (this.warningValueName === 'duplicateMobileWallet') this.reset();

    this.warningValueName = '';
    this.selectedMnemonicElements = [];
  }

  async handlerAcceptAddWallet() {
    if (this.address) await forgetAccount(this.address, 'mobile');

    this.warningValueName = '';

    this.step += 1;
  }

  closeAddEthereumAccountPopup() {
    this.showAddEthereumAccountPopup = false;

    this.step += 2;
  }

  resetAll() {
    this.selectedMnemonicElements = [];
  }

  skipStep() {
    this.step += 1;
  }

  handlerAgree() {
    this.showAddEthereumAccountPopup = false;
    this.step += 1;
  }

  async proceed() {
    if (this.isCreateWallet) await this.createFlow();
    else await this.importFlow();

    // if a invalid popup or add ETH account popup is shown, then the index does not need to be increased
    this.step += this.showNotificationPopup || this.showAddEthereumAccountPopup ? 0 : 1;
  }

  async createFlow() {
    if (this.step === 1 && !this.mnemonic.length) this.mnemonic = BaseApi.generateMnemonic();
    else if (this.step === 2) await this.validateSuri();
    else if (this.step === 3) this.validateSequenceMnemonic();
  }

  async importFlow() {
    if (this.step === 1) {
      await this.validateSuri();

      if (this.warningValueName !== '') return;
      else if (this.isOnlyEthereumAccount) {
        this.step += 2;

        return;
      }

      // if import type is raw seed or json, show a window with a question about adding an ETH account
      if (this.typeImport === 'mnemonic') this.step += 1;
      else this.showAddEthereumAccountPopup = true;
    } else if (this.step === 2) await this.validateSuri();
  }

  validateAddressForDubMobileWallet(address: string) {
    const substrate = BaseApi.encodeAddress(address);

    if (BaseApi.isMobileWallet(substrate)) {
      this.warningValueName = 'duplicateMobileWallet';
      this.address = substrate;
    }
  }

  async validateMobileDubs() {
    if (this.isOnlyEthereumAccount) return;

    if (this.typeImport === 'json') {
      this.validateAddressForDubMobileWallet(this.substrateJSON.address);

      return;
    }

    return true;
  }

  validateSequenceMnemonic() {
    const isValidSequenceMnemonic = this.isCreateWallet
      ? BaseApi.isValidSequenceMnemonic(
          this.mnemonic,
          this.selectedMnemonicElements.map(({ word }) => word.trim())
        )
      : true;

    if (!isValidSequenceMnemonic) this.warningValueName = 'mnemonicSequence';
  }

  async validateSuri() {
    const {
      ethereum: { value: ethereumDerivationPath },
      substrate,
    } = this.derivationPaths;
    const ETHDP = (ethereumDerivationPath[0] === '/' ? ethereumDerivationPath.slice(1) : ethereumDerivationPath).trim();
    const isValidMnemonic = this.mnemonic ? BaseApi.isValidPhrase(this.mnemonic.trim()) : true;
    const isValidSubstratePhrase = substrate.value ? await isDerivationPathValid(substrate) : true;
    const isValidEthereumDP = ethereumDerivationPath ? BaseApi.isValidEthereumDerivationPath(ETHDP) : true;
    const isValidSubstrateRawSeed = this.substrateRawSeed ? BaseApi.isHex(this.substrateRawSeed) : true;
    const isValidEthereumRawSeed = this.ethereumRawSeed ? BaseApi.isHex(this.ethereumRawSeed) : true;

    const validatedSubstrateJson =
      this.substrateJson !== ''
        ? await isJsonValid(this.substrateJSON, this.passwordSubstrateJson)
        : ({ value: true } as ValidateJsonResult);

    const validatedEthereumJson =
      this.ethereumJson !== ''
        ? await isJsonValid(this.ethereumJSON, this.passwordEthereumJson, false)
        : ({ value: true } as ValidateJsonResult);

    if (!isValidMnemonic) this.warningValueName = 'mnemonic';
    else if (!isValidSubstratePhrase) this.warningValueName = 'substrateDP';
    else if (!isValidEthereumDP) this.warningValueName = 'ethereumDP';
    else if (!isValidSubstrateRawSeed || !isValidEthereumRawSeed) this.warningValueName = 'rawSeed';
    else if (!validatedSubstrateJson.value) this.warningValueName = validatedSubstrateJson.errorType;
    else if (!validatedEthereumJson.value) this.warningValueName = validatedEthereumJson.errorType;
    else if (isValidMnemonic && isValidSubstrateRawSeed && validatedSubstrateJson.value && this.step === 1)
      this.validateMobileDubs();
  }

  saveKeypair() {
    if (this.substrateJson || this.ethereumJson) return this.saveKeypairFromJson();

    return this.saveKeypairFromSeed();
  }

  async saveKeypairFromSeed() {
    const meta: Record<string, unknown> = { name: this.nickname.trim(), ethereumAddress: '' };
    const {
      substrate: { keypairType: substrateKeypairType },
      ethereum: { keypairType: ethereumKeypairType },
    } = this.derivationPaths;

    if (this.isOnlyEthereumAccount) meta.name = this.selectedWallet.name;

    if (this.suriEthereum !== '') {
      const ethereumAddress = await addAccount(this.suriEthereum, ethereumKeypairType, meta);

      if (this.isOnlyEthereumAccount) {
        updatePairMeta(this.selectedWallet.address, { ethereumAddress });

        return '';
      }

      meta.ethereumAddress = ethereumAddress;
    }

    const address = await addAccount(this.suriSubstrate, substrateKeypairType, meta);

    return address;
  }

  async saveKeypairFromJson() {
    const substrateJSON = { ...this.substrateJSON };

    if (this.ethereumJson) {
      const ethereumAddress = await jsonRestore(this.ethereumJSON, this.passwordEthereumJson);

      if (this.isOnlyEthereumAccount) {
        updatePairMeta(this.selectedWallet.address, { ethereumAddress });

        return '';
      }

      substrateJSON.meta.ethereumAddress = ethereumAddress;
    }

    const address = await jsonRestore(substrateJSON, this.passwordSubstrateJson);

    return address;
  }

  updateSelectedMnemonicElements(value: MnemonicConfirmation[]) {
    this.selectedMnemonicElements = value;
  }

  openFullScreen() {
    windowOpen('/');
    window.close();
  }

  backIsImportWallet() {
    if (this.step === 3 && this.ethereumRawSeed === '' && this.ethereumJson === '') this.step -= 1;
  }

  back() {
    if (this.isOnlyEthereumAccount) this.step -= 1;
    else if (this.isImportWallet) this.backIsImportWallet();
    else if (this.step === 2) {
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
  height: 100%;

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

.controls {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
  width: 100%;
}
</style>
