<template>
  <div class="add-wallet">
    <div class="header">
      <div class="icon-container">
        <CircleButton
          v-if="showBackIcon"
          backgroundColor="light-black"
          iconName="chevron-left"
          data-testid="backBtn"
          :disabled="isLoading"
          :aria-label="$t('ux.back')"
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
          :mnemonicLength="mnemonicLength"
          :isSubstrate="isSubstrate"
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
          :isSubstrate="isSubstrate"
          @setImportValue="setImportValue"
          @reset="reset"
          @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
          @update:passwordJson="setPasswordJson"
        />

        <TonAddressChoice v-if="showTonAddressChoice" v-model="tonDerivation" :candidates="tonCandidates" />

        <AdvancedForm
          v-if="showAdvancedForm"
          :derivationPaths="derivationPaths"
          :showEthereumDP="showEthereumDP"
          @updateDP="updateDP"
          @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
        />

        <p v-if="generationExpired" role="alert" data-testid="generationExpired" :lang="$i18n.locale === 'ru-RU' ? 'ru' : 'en'">{{ generationExpiredMessage }}</p>
        <p v-if="flowError" role="alert" data-testid="accountFailure">{{ $t('ux.accountSetupFailed') }}</p>
        <p v-if="isLoading" role="status">{{ $t('ux.settingUpWallet') }}</p>
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
          :loading="isLoading"
          :text="isLoading ? 'ux.settingUpWallet' : flowError ? 'ux.retry' : buttonText"
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
import { defineComponent } from 'vue';
import type { DerivationPaths, ValidateJsonResult, MnemonicConfirmation } from '@/interfaces';
import type { TonImportCandidateInfo } from '@extension-base/background/types/types';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import { isWalletGenerationExpired } from '@/util/walletSecurity';
import { walletGenerationExpiredMessage } from '@/locales/walletSecurity';

import { WalletEcosystem } from '@/interfaces';
import CreateWallet from '@/screens/addWallet/CreateWallet.vue';
import FinishForm from '@/screens/addWallet/FinishForm.vue';
import ImportWallet from '@/screens/addWallet/ImportWallet.vue';
import NicknameForm from '@/screens/addWallet/NicknameForm.vue';
import TonAddressChoice from '@/screens/addWallet/TonAddressChoice.vue';
import { preselectTonImportCandidate } from '@/screens/addWallet/tonImportChoice';
import AdvancedForm from '@/screens/addWallet/AdvancedForm.vue';
import AddEthereumAccountPopup from '@/screens/addWallet/AddEthereumAccountPopup.vue';
import BaseApi from '@/util/BaseApi';
import { Components } from '@/router/routes';
import { INITIAL_DERIVATION_PATHS, ETHEREUM_DEFAULT_DERIVATION_PATH } from '@/consts/derivationPath';
import { UNIVERSAL_WALLET_DEFAULT_WORD_COUNT } from '@/consts/universalWallet';
import { deriveUniversalWalletKeyringFields } from '@/util/universalWalletKeyringFields';
import {
  resolveUniversalWalletPassphrase,
  UNIVERSAL_WALLET_PASSWORD_NETWORKS,
  type UniversalWalletPasswordNetwork,
} from '@/util/universalWalletPassphrase';
import { normalizeTonImportPhrase, type TonImportChoice, type TonImportDerivation } from '@/util/tonKeyring';
import {
  forgetAccount,
  isDerivationPathValid,
  isJsonValid,
  jsonRestore,
  windowOpen,
  addAccount,
  updatePairMeta,
  generateMnemonic,
  mnemonicValidate,
  tonImportCandidates,
  universalWalletPasswordDiscovery,
} from '@/extension/messaging';
import { IS_POPUP, IS_SIDE_PANEL } from '@/consts/globalClient';
import { useAccountsStore } from '@/stores/accounts';
import { type FWKeyringMeta } from '@/extension/background/extension-base/src/types';

type AddWalletField = 'mnemonic' | 'ethereumRawSeed' | 'substrateRawSeed' | 'substrateJson' | 'ethereumJson';

export default defineComponent({ name: 'AddWallet',
  components: {
    FinishForm,
    CreateWallet,
    ImportWallet,
    NicknameForm,
    TonAddressChoice,
    AdvancedForm,
    AddEthereumAccountPopup,
  },
  data() {
    return {
      isPopup: IS_POPUP,
      countSteps: 4,
      accountsStore: useAccountsStore(),
      step: 1,
      nickname: '',
      mnemonic: '',
      passwordSubstrateJson: '',
      passwordEthereumJson: '',
      ethereumJson: '',
      substrateJson: '',
      ethereumRawSeed: '',
      substrateRawSeed: '',
      showAdvancedForm: false,
      showAddEthereumAccountPopup: false,
      selectedMnemonicElements: [],
      warningValueName: '',
      typeImport: 'mnemonic',
      derivationPaths: INITIAL_DERIVATION_PATHS,
      address: null,
      isLoading: false,
      flowError: false,
      generationExpired: false,
      savedSuccessfully: false,
      // TON import: every address the typed text opens, the text they were derived from, and the pick.
      tonCandidates: [] as TonImportCandidateInfo[],
      tonCandidatesText: '',
      tonDerivation: '' as TonImportDerivation | '',
      showTonAddressChoice: false,
    };
  },
  computed: {
    generationExpiredMessage() {
      return walletGenerationExpiredMessage(this.$i18n.locale);
    },
    confirmMnemonicStep() {
      return this.step === 3 && this.isCreateWallet;
    },
    isOnlyEthereumAccount() {
      return this.$route.params.onlyEthereumAccount !== undefined;
    },
    walletType() {
      return this.$route.params.type;
    },
    walletEcosystem() {
      return (this.$route.params.walletEcosystem ?? 'substrate') as WalletEcosystem;
    },
    isSubstrate() {
      return this.walletEcosystem === 'substrate';
    },
    isTonImport() {
      return this.isImportWallet && this.walletEcosystem === 'ton';
    },
    tonPhrase() {
      return normalizeTonImportPhrase(this.mnemonic);
    },
    tonImportChoice(): TonImportChoice | undefined {
      const candidate = this.tonCandidates.find(({ derivation }) => derivation === this.tonDerivation);

      return candidate && { derivation: candidate.derivation, address: candidate.address };
    },
    mnemonicLength() {
      return this.isCreateWallet || this.walletEcosystem === 'ton' ? UNIVERSAL_WALLET_DEFAULT_WORD_COUNT : 12;
    },
    isDifferentPasswords() {
      return this.passwordEthereumJson !== this.passwordSubstrateJson;
    },
    passwordJson() {
      if (this.isOnlyEthereumAccount) return this.passwordEthereumJson;

          return this.step === 1 ? this.passwordSubstrateJson : this.passwordEthereumJson;
    },
    substrateJSON() {
      return BaseApi.parseJson(this.substrateJson);
    },
    ethereumJSON() {
      return BaseApi.parseJson(this.ethereumJson);
    },
    showEthereumDP() {
      return this.typeImport === 'mnemonic';
    },
    readonlyNickname() {
      return this.typeImport === 'json';
    },
    showNotificationPopup() {
      return this.warningValueName !== '';
    },
    isMobileWalletExists() {
      return this.warningValueName === 'duplicateMobileWallet';
    },
    invalidMessages() {
      if (!this.warningValueName) return {};

          const mainPath = `addWallet.warningMessages.${this.warningValueName}`;

          return {
            text: `${mainPath}.text`,
            subtext: `${mainPath}.subtext`,
          };
    },
    showNicknameForm() {
      return (this.isImportWallet && this.step === 3) || (this.isCreateWallet && this.step === 1);
    },
    isCreateWallet() {
      return this.walletType === 'create';
    },
    isImportWallet() {
      return this.walletType === 'import';
    },
    showCreateForm() {
      return this.isCreateWallet && (this.step === 2 || this.step === 3) && !this.showAdvancedForm;
    },
    showImportForm() {
      return (
        this.isImportWallet && (this.step === 1 || this.step === 2) && !this.showAdvancedForm && !this.showTonAddressChoice
      );
    },
    showBackIcon() {
      return this.step !== 4 || this.flowError;
    },
    showFinishForm() {
      return this.step === 4 && this.savedSuccessfully;
    },
    header() {
      if (this.isCreateWallet) {
            if (this.step === 1) return this.t('createWallet');

            if (this.step === 2) return this.t('backupPassphrase');

            if (this.step === 3) return this.t('confirmPassphrase');
          }

          if (this.step === 1) {
            if (this.isOnlyEthereumAccount) return this.t('addEthereumAccount');

            if (this.showTonAddressChoice) return this.$t('ux.tonAddressChoiceTitle');

            return this.typeImport === 'mnemonic' ? this.t('importWallet') : this.t('importAccount', { type: 'substrate' });
          }

          if (this.step === 2) return this.t('importAccount', { type: 'ethereum' });

          if (this.step === 3) return this.t('walletNickname');

          return '';
    },
    buttonText() {
      if (this.isCreateWallet && this.step === 2) return this.t('haveWrittenPassphrase');

          if (this.showFinishForm) return this.t('usingFearless');

          return 'common.continue';
    },
    disabledProceed() {
      if (this.isLoading) return true;

          if (this.isImportWallet) {
            if (this.step === 1) {
              if (this.showTonAddressChoice) return !this.tonImportChoice;

              if (this.isOnlyEthereumAccount)
                return !this.ethereumRawSeed && this.isLengthZero(this.ethereumJson) && !this.passwordEthereumJson;

              if (
                !this.mnemonic &&
                !this.substrateRawSeed &&
                (this.isLengthZero(this.substrateJson) || !this.passwordSubstrateJson)
              )
                return true;

              return false;
            }

            if (this.step === 2) {
              if (this.isDifferentPasswords) return true;

              if (!this.ethereumRawSeed) return this.isLengthZero(this.ethereumJson) || !this.passwordEthereumJson;

              return false;
            }

            if (this.step === 3 && this.typeImport !== 'json') return !this.nickname;

            return false;
          }

          // isCreateWallet
          if (this.step === 1) return !this.nickname;

          if (this.step === 3) return this.mnemonic.split(' ').length !== this.selectedMnemonicElements.length;

          return false;
    },
    suriSubstrate() {
      const {
            substrate: { value: substrateDerivationPath },
          } = this.derivationPaths;

          return `${(this.mnemonic || this.substrateRawSeed).trim()}${substrateDerivationPath.trim()}`;
    },
    suriEthereum() {
      if (!this.isSubstrate) return '';

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
    },
  },
  watch: {
    "substrateJson": 'substrateJsonChanged',
    "ethereumJson": 'ethereumJsonChanged',
    "step": 'changedCurrentStep',
  },
  mounted() {
    if (this.isOnlyEthereumAccount && this.isCreateWallet) this.proceed();
  },
  methods: {
    substrateJsonChanged(value: string) {
      if (this.isLengthZero(this.substrateJSON) && value !== '') {
            this.warningValueName = 'jsonInvalid';

            return;
          }

          this.nickname = (this.substrateJSON?.meta?.name as string) || '';
    },
    ethereumJsonChanged(value: string) {
      if (this.isLengthZero(this.ethereumJSON) && value !== '') this.warningValueName = 'jsonInvalid';
    },
    async changedCurrentStep(step: number) {
      if (step === 0) this.$router.push({ name: Components.Welcome });

          if (step === 2) this.selectedMnemonicElements = [];
          else if (step === 5) this.$router.push({ name: Components.Wallet });
          else if (step === 4) await this.completeSave();
    },
    isLengthZero(value: string | KeyringPair$Json) {
      return Object.keys(value).length === 0;
    },
    t(value: string, obj: Record<string, string> = {}) {
      return this.$t(`addWallet.${value}`, obj);
    },
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
    },
    toggleAdvancedFormVisible(value = true) {
      this.showAdvancedForm = value;
    },
    updateDP(derivationPaths: DerivationPaths) {
      this.derivationPaths = derivationPaths;
    },
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
          this.tonCandidates = [];
          this.tonCandidatesText = '';
          this.tonDerivation = '';
          this.showTonAddressChoice = false;
    },
    setImportValue(value: string & (KeyringPair$Json | Record<string, never>), field: AddWalletField) {
      this[field] = value;
    },
    setNickname(value: string) {
      this.nickname = value;
    },
    setPasswordJson(value: string) {
      if (this.isOnlyEthereumAccount) {
            this.passwordEthereumJson = value;
          } else {
            if (this.step === 1) this.passwordSubstrateJson = value;
            else this.passwordEthereumJson = value;
          }
    },
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
    },
    async handlerAcceptAddWallet() {
      if (this.address) await forgetAccount(this.address, 'mobile');

          this.warningValueName = '';

          this.step += 1;
    },
    closeAddEthereumAccountPopup() {
      this.showAddEthereumAccountPopup = false;

          this.step += 2;
    },
    resetAll() {
      this.selectedMnemonicElements = [];
    },
    skipStep() {
      this.step += 1;
    },
    handlerAgree() {
      this.showAddEthereumAccountPopup = false;
          this.step += 1;
    },
    async completeSave() {
      if (this.isLoading || this.savedSuccessfully) return;
      this.isLoading = true;
      this.flowError = false;
      try {
        await this.saveKeypair();
        this.savedSuccessfully = true;
        if (this.isOnlyEthereumAccount) this.$router.push({ name: Components.Wallet });
      } catch (error) {
        if (isWalletGenerationExpired(error)) {
          this.generationExpired = true;
          this.mnemonic = '';
          this.selectedMnemonicElements = [];
          this.step = 1;
        } else this.flowError = true;
      } finally {
        this.isLoading = false;
      }
    },
    async proceed() {
      if (this.isLoading) return;
      if (this.step === 4 && !this.savedSuccessfully) return this.completeSave();
      this.isLoading = true;
      this.flowError = false;
      try {
        if (this.isCreateWallet) await this.createFlow();
        else await this.importFlow();
        // Keep the current step while validation, the optional account prompt or the TON address choice is open.
        this.step += this.showNotificationPopup || this.showAddEthereumAccountPopup || this.showTonAddressChoice ? 0 : 1;
      } catch {
        this.flowError = true;
      } finally {
        this.isLoading = false;
      }
    },
    async createFlow() {
      if (this.step === 1 && !this.mnemonic.length) {
            // New wallets share the Universal Wallet BIP39 phrase regardless of the first network.
            this.mnemonic = await generateMnemonic(WalletEcosystem.Substrate, this.mnemonicLength);
            this.generationExpired = false;
          } else if (this.step === 2) await this.validateSuri();
          else if (this.step === 3) this.validateSequenceMnemonic();
    },
    async importFlow() {
      if (this.step === 1) {
            // The address was chosen on the previous press of Continue.
            if (this.showTonAddressChoice) {
              this.showTonAddressChoice = false;
              this.step += 1;

              return;
            }

            await this.validateSuri();

            if (this.warningValueName !== '') return;
            else if (this.isOnlyEthereumAccount) {
              this.step += 2;

              return;
            }

            // A phrase that opens more than one TON address: the user picks before going on.
            if (this.isTonImport && this.tonCandidates.length > 1) {
              this.showTonAddressChoice = true;

              return;
            }

            // if import type is raw seed or json, show a window with a question about adding an ETH account
            if (this.typeImport === 'mnemonic') this.step += 1;
            else this.showAddEthereumAccountPopup = true;
          } else if (this.step === 2) await this.validateSuri();
    },
    // A TON import accepts native TON phrases as well as BIP39 ones, so it is valid when it opens an address.
    // The text goes to the background as typed: spacing and capitals can be part of a TON key.
    async loadTonCandidates() {
      const text = this.mnemonic;
      const previous = this.tonCandidatesText === text ? this.tonDerivation : '';

      this.tonCandidates = this.tonPhrase ? await tonImportCandidates(text) : [];
      this.tonCandidatesText = text;
      this.tonDerivation = this.tonCandidates.some(({ derivation }) => derivation === previous)
        ? previous
        : preselectTonImportCandidate(this.tonCandidates)?.derivation ?? '';

      return this.tonCandidates.length !== 0;
    },
    validateAddressForDubMobileWallet(address: string) {
      const substrate = BaseApi.encodeAddress(address);

          if (BaseApi.isMobileWallet(substrate)) {
            this.warningValueName = 'duplicateMobileWallet';
            this.address = substrate;
          }
    },
    async validateMobileDubs() {
      if (this.isOnlyEthereumAccount) return;

          if (this.typeImport === 'json') {
            this.validateAddressForDubMobileWallet(this.substrateJSON.address);

            return;
          }

          return true;
    },
    validateSequenceMnemonic() {
      const isValidSequenceMnemonic = this.isCreateWallet
            ? BaseApi.isValidSequenceMnemonic(
                this.mnemonic,
                this.selectedMnemonicElements.map(({ word }) => word.trim())
              )
            : true;

          if (!isValidSequenceMnemonic) this.warningValueName = 'mnemonicSequence';
    },
    async validateSuri() {
      const {
            ethereum: { value: ethereumDerivationPath },
            substrate,
          } = this.derivationPaths;

          const ETHDP = (ethereumDerivationPath[0] === '/' ? ethereumDerivationPath.slice(1) : ethereumDerivationPath).trim();
          const isValidMnemonic = this.isTonImport
            ? await this.loadTonCandidates()
            : this.mnemonic
            ? await mnemonicValidate(WalletEcosystem.Substrate, this.mnemonic.trim())
            : true;
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
          else if (!validatedSubstrateJson.value)
            this.warningValueName = 'errorType' in validatedSubstrateJson ? validatedSubstrateJson.errorType : 'jsonInvalid';
          else if (!validatedEthereumJson.value)
            this.warningValueName = 'errorType' in validatedEthereumJson ? validatedEthereumJson.errorType : 'jsonInvalid';
          else if (isValidMnemonic && isValidSubstrateRawSeed && validatedSubstrateJson.value && this.step === 1)
            this.validateMobileDubs();
    },
    saveKeypair() {
      if (this.substrateJson || this.ethereumJson) return this.saveKeypairFromJson();

          return this.saveKeypairFromSeed();
    },
    async saveKeypairFromSeed() {
          const meta: FWKeyringMeta = {
            name: this.nickname.trim(),
            ethereumAddress: '',
            walletEcosystem: this.walletEcosystem,
          };

          if (this.isTonImport) return this.saveTonImport(meta);

          if (this.mnemonic) {
            const passphrase = resolveUniversalWalletPassphrase(this.suriSubstrate, this.suriEthereum);
            // Imported words may already hold funds at the addresses they open without the password: those stay.
            const legacyNetworks = passphrase && !this.isCreateWallet ? await this.universalWalletLegacyNetworks() : [];

            Object.assign(meta, deriveUniversalWalletKeyringFields(this.mnemonic, passphrase, legacyNetworks));
            if (legacyNetworks.length) meta.universalWalletLegacyNetworks = legacyNetworks;
            // Old addresses found empty stay watched: funds can still reach them after the protected ones show.
            const watched = passphrase && !this.isCreateWallet
              ? UNIVERSAL_WALLET_PASSWORD_NETWORKS.filter((network) => !legacyNetworks.includes(network))
              : [];
            if (watched.length) meta.universalWalletWatchedNetworks = watched;
          }

          const {
            substrate: { keypairType: substrateKeypairType },
            ethereum: { keypairType: ethereumKeypairType },
          } = this.derivationPaths;

          if (this.isOnlyEthereumAccount) meta.name = this.accountsStore.selectedWallet.name;

          if (this.suriEthereum !== '') {
            const ethereumAddress = await addAccount(this.suriEthereum, ethereumKeypairType, meta, WalletEcosystem.Substrate, this.isCreateWallet);

            if (this.isOnlyEthereumAccount) {
              updatePairMeta(this.accountsStore.selectedWallet.address, { ethereumAddress });

              return '';
            }

            meta.ethereumAddress = ethereumAddress;
          }

          const address = await addAccount(this.suriSubstrate, substrateKeypairType, meta, this.walletEcosystem, this.isCreateWallet);

          return address;
    },
    // A no-password address that holds funds, or that could not be checked, keeps its network; as with the
    // TON chooser, nothing is guessed when the network cannot answer.
    async universalWalletLegacyNetworks(): Promise<UniversalWalletPasswordNetwork[]> {
      try {
        const found = await universalWalletPasswordDiscovery(this.mnemonic);

        return UNIVERSAL_WALLET_PASSWORD_NETWORKS.filter(
          (network) => found.find((item) => item.network === network)?.funds !== 'empty'
        );
      } catch {
        return [...UNIVERSAL_WALLET_PASSWORD_NETWORKS];
      }
    },
    // Saves the address picked on the import screen; the background refuses any other.
    async saveTonImport(meta: FWKeyringMeta) {
          const choice = this.tonImportChoice;

          if (!choice || this.tonCandidatesText !== this.mnemonic) throw new Error('ton_import_choice_missing');

          // Only the universal key shares the phrase's Universal Wallet accounts; a native TON phrase has none.
          if (choice.derivation === 'universal') Object.assign(meta, deriveUniversalWalletKeyringFields(this.tonPhrase));

          // The background stores the phrase that opens the chosen address, tidied or exactly as typed.
          return addAccount(this.mnemonic, this.derivationPaths.substrate.keypairType, meta, this.walletEcosystem, choice);
    },
    async saveKeypairFromJson() {
      const substrateJSON = { ...this.substrateJSON };
      let linkedEthereumAddress: string | undefined;

          if (this.ethereumJson) {
            const ethereumAddress = await jsonRestore(this.ethereumJSON, this.passwordEthereumJson);

            if (this.isOnlyEthereumAccount) {
              updatePairMeta(this.accountsStore.selectedWallet.address, {
                ethereumAddress,
                walletEcosystem: WalletEcosystem.Substrate,
              });

              return '';
            }

            linkedEthereumAddress = ethereumAddress;
          }

          const address = await jsonRestore(substrateJSON, this.passwordSubstrateJson, linkedEthereumAddress);

          return address;
    },
    updateSelectedMnemonicElements(value: MnemonicConfirmation[]) {
      this.selectedMnemonicElements = value;
    },
    openFullScreen() {
      windowOpen('/');
          // The side panel stays beside the new tab.
          if (!IS_SIDE_PANEL) window.close();
    },
    backIsImportWallet() {
      if (this.step === 3 && this.ethereumRawSeed === '' && this.ethereumJson === '') this.step -= 1;
    },
    back() {
      if (this.isLoading) return;
      this.flowError = false;
      // From the TON address choice, Back returns to the phrase.
      if (this.showTonAddressChoice) {
        this.showTonAddressChoice = false;

        return;
      }
      if (this.isOnlyEthereumAccount) this.step -= 1;
          else if (this.isImportWallet) this.backIsImportWallet();
          else if (this.step === 2) {
            this.ethereumRawSeed = '';
            this.ethereumJson = '';
          }

          this.step -= 1;

          // Back from the nickname returns to the TON address choice it came from.
          if (this.step === 1 && this.isTonImport && this.tonCandidates.length > 1) this.showTonAddressChoice = true;
    },
  },
});
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
      font-size: 1.25rem;
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
