<template>
  <FlowStepLayout
    :countSteps="countSteps"
    :showAdvancedForm="showAdvancedForm"
    :step="step"
    :completionConfirmed="isFinished"
    :isLoading="isLoading"
    :header="header"
    :showFullScreenIcon="false"
    @back="back"
  >
    <p v-if="generationExpired" role="alert" class="backup-error">{{ generationExpiredMessage }}</p>
    <p v-else-if="creationError" role="alert" class="backup-error">{{ $t('addWallet.google.somethingWrong') }}</p>
    <p v-if="confirmMnemonicStep" class="backup-consent">{{ $t('addWallet.google.dataWillStoreOnGDrive') }}</p>
    <p v-if="isFinished" role="status">{{ $t('addWallet.google.saved') }}</p>
    <NickNameForm v-if="nickNameStep" :nickname="nickname" @update:nickname="setNickname" />

    <CreateWallet
      v-if="createWalletStep"
      :step="step"
      :mnemonic="mnemonic"
      :mnemonicLength="mnemonicLength"
      :selectedMnemonicElements="selectedMnemonicElements"
      @update:selectedMnemonicElements="updateSelectedMnemonicElements"
      @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
    />

    <AdvancedForm
      v-if="showAdvancedForm"
      :derivationPaths="derivationPaths"
      @updateDP="updateDP"
      @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
    />

    <template v-slot:control>
      <div class="controls">
        <FButton
          v-if="confirmMnemonicStep"
          size="big"
          fontSize="big"
          width="64px"
          type="secondary"
          :border="false"
          iconName="reload"
          @click="resetAll"
        />

        <FButton
          v-if="confirmMnemonicStep"
          size="big"
          fontSize="big"
          width="100%"
          type="secondary"
          :border="false"
          :text="$t('addWallet.skipConfirmation')"
          @click="skipStep"
        />

        <FButton
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
      @handlerClose="handlerCloseNotificationPopup"
      @handlerAccept="handlerAcceptAddWallet"
    />
  </FlowStepLayout>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { KeyringPair$Json } from '@subwallet/keyring/types';

import type { FWKeyringMeta } from '@extension-base/types';
import { Components } from '@/router/routes';
import { isWalletGenerationExpired } from '@/util/walletSecurity';
import { walletGenerationExpiredMessage } from '@/locales/walletSecurity';
import { type DerivationPaths, WalletEcosystem, type MnemonicConfirmation } from '@/interfaces';
import NegativeMessage from '@/screens/addWallet/google/NegativeMessage.vue';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';
import NickNameForm from '@/screens/addWallet/NicknameForm.vue';
import CreateWallet from '@/screens/addWallet/CreateWallet.vue';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import AdvancedForm from '@/screens/addWallet/AdvancedForm.vue';
import { ETHEREUM_DEFAULT_DERIVATION_PATH, INITIAL_DERIVATION_PATHS } from '@/consts/derivationPath';
import { UNIVERSAL_WALLET_DEFAULT_WORD_COUNT } from '@/consts/universalWallet';
import { deriveUniversalWalletKeyringFields } from '@/util/universalWalletKeyringFields';
import BaseApi from '@/util/BaseApi';
import {
  addAccount,
  createGoogleFile,
  exportJSON,
  updateCurrentAccount,
  getExtensionPassword,
  generateMnemonic,
} from '@/extension/messaging';

export default defineComponent({ name: 'CreateGoogle',
  components: {
    AdvancedForm,
    NickNameForm,
    CreateWallet,
    FlowStepLayout,
    AdvancedButton,
    NegativeMessage,
  },
  data() {
    return {
      countSteps: 4,
      buttonTextForStep: {
        1: 'common.continue',
        2: 'addWallet.haveWrittenPassphrase',
        3: 'addWallet.ConfirmSecretData',
        4: 'common.finish',
      },
      selectedMnemonicElements: [],
      step: 1,
      nickname: '',
      mnemonic: '',
      showAdvancedForm: false,
      derivationPaths: structuredClone(INITIAL_DERIVATION_PATHS),
      showNotificationPopup: false,
      warningValueName: '',
      isLoading: false,
      isActive: true,
      revision: 0,
      creationError: false,
      generationExpired: false,
      isFinished: false,
      createdAddress: '',
      createdEthereumAddress: '',
      backup: null as { primary: KeyringPair$Json; child?: KeyringPair$Json; childAddress?: string; primaryAddress: string; childId?: string; primaryId?: string } | null,
    };
  },
  computed: {
    generationExpiredMessage() {
      return walletGenerationExpiredMessage(this.$i18n.locale);
    },
    invalidMessages() {
      if (!this.warningValueName) return {};

          const mainPath = `addWallet.warningMessages.${this.warningValueName}`;

          return {
            text: `${mainPath}.text`,
            subtext: `${mainPath}.subtext`,
          };
    },
    nickNameStep() {
      return this.step === 1;
    },
    createWalletStep() {
      return this.step === 2 || this.step === 3;
    },
    header() {
      if (this.nickNameStep) return this.$t('addWallet.createWallet');

          if (this.step === 2) return this.$t('addWallet.backupPassphrase');

          if (this.step === 3) return this.$t('addWallet.confirmPassphrase');

          if (this.step === 4) return '';

          return this.$t('addWallet.createWallet');
    },
    buttonText() {
      if (this.creationError) return this.$t('ux.retry');
      if (this.buttonTextForStep[this.step]) return this.$t(this.buttonTextForStep[this.step]);

          return this.$t('addWallet.createWallet');
    },
    disabledProceed() {
      if (this.isLoading) return true;
      if (this.creationError && !this.mnemonic) return false;
      if (this.nickNameStep) return !this.nickname.trim() || !this.mnemonic;

          if (this.step === 3) return this.mnemonic.split(' ').length !== this.selectedMnemonicElements.length;

          return false;
    },
    confirmMnemonicStep() {
      return this.step === 3;
    },
    mnemonicLength() {
      return UNIVERSAL_WALLET_DEFAULT_WORD_COUNT;
    },
    suriSubstrate() {
      const {
            substrate: { value: substrateDerivationPath },
          } = this.derivationPaths;

          return `${this.mnemonic.trim()}${substrateDerivationPath.trim()}`;
    },
    suriEthereum() {
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
    },
  },
  watch: {
    step: 'watchStep',
    '$route.params.access_token'() { this.abandon(); },
  },
  async mounted() { await this.prepareMnemonic(); },
  beforeUnmount() { this.abandon(); },
  methods: {
    abandon() {
      this.isActive = false;
      this.revision++;
      this.mnemonic = '';
      this.selectedMnemonicElements = [];
      this.backup = null;
    },
    async prepareMnemonic() {
      if (!this.isActive || this.isLoading) return;
      const revision = ++this.revision;
      this.isLoading = true;
      this.creationError = false;
      try {
        const mnemonic = await generateMnemonic(WalletEcosystem.Substrate, UNIVERSAL_WALLET_DEFAULT_WORD_COUNT);
        if (this.isActive && this.revision === revision) {
          this.mnemonic = mnemonic;
          this.generationExpired = false;
        }
      } catch { if (this.isActive && this.revision === revision) this.creationError = true; }
      finally { if (this.isActive && this.revision === revision) this.isLoading = false; }
    },
    async watchStep() {
      if (!this.isActive || this.step !== 4 || this.isLoading || this.isFinished) return;
      const revision = ++this.revision;
      const token = this.$route.params.access_token;
      const ownsRequest = () => this.isActive && this.revision === revision && this.step === 4 && this.$route.params.access_token === token;
      this.isLoading = true;
      this.creationError = false;
      try {
        const address = await this.saveKeypairFromSeed(ownsRequest);
        if (!ownsRequest()) return;
        await this.backupWallet(address, ownsRequest);
        if (!ownsRequest()) return;
        await updateCurrentAccount(address);
        if (ownsRequest()) this.isFinished = true;
      } catch (error) {
        if (ownsRequest()) {
          if (isWalletGenerationExpired(error)) {
            this.generationExpired = true;
            this.mnemonic = '';
            this.selectedMnemonicElements = [];
            this.createdAddress = '';
            this.createdEthereumAddress = '';
            this.backup = null;
            this.isLoading = false;
            this.step = 1;
          } else this.creationError = true;
        }
      }
      finally { if (ownsRequest()) this.isLoading = false; }
    },
    updateDP(derivationPaths: DerivationPaths) {
      if (!this.isActive || this.isLoading || this.step === 4) return;
      this.derivationPaths = derivationPaths;
    },
    resetAll() {
      this.selectedMnemonicElements = [];
    },
    skipStep() {
      if (!this.isActive || this.isLoading || this.step !== 3) return;
      this.step = 4;
    },
    async handlerCloseNotificationPopup() {
      this.warningValueName = '';
          this.selectedMnemonicElements = [];
          this.showNotificationPopup = false;
    },
    async handlerAcceptAddWallet() {
      if (!this.isActive || this.isLoading || this.step !== 3) return;
      this.warningValueName = '';
      this.showNotificationPopup = false;
      this.step = 4;
    },
    goBack() {
      this.abandon();
      this.$router.replace({ name: Components.Wallet, params: { access_token: '' } }).catch((e) => e);
    },
    back() {
      if (this.step === 1 || this.step === 4) this.goBack();
      else if (!this.isLoading) this.step -= 1;
    },
    async proceed() {
      if (!this.isActive || this.isLoading) return;
      if (!this.mnemonic) { await this.prepareMnemonic(); return; }
      if (this.step === this.countSteps) {
        if (this.isFinished) this.goBack();
        else await this.watchStep();
        return;
      }

          if (this.step === 3) {
            const isValidSequenceMnemonic = BaseApi.isValidSequenceMnemonic(
              this.mnemonic,
              this.selectedMnemonicElements.map(({ word }) => word.trim())
            );

            if (!isValidSequenceMnemonic) {
              this.warningValueName = 'mnemonicSequence';
              this.showNotificationPopup = true;

              return;
            }
          }

          this.step += 1;
    },
    setNickname(name: string) {
      if (!this.isActive || this.isLoading || this.step === 4) return;
      this.nickname = name;
    },
    updateSelectedMnemonicElements(value: MnemonicConfirmation[]) {
      this.selectedMnemonicElements = value;
    },
    setValue(value: string) {
      this.nickname = value;
    },
    toggleAdvancedFormVisible(value = true) {
      this.showAdvancedForm = value;
    },
    async backupWallet(address: string, ownsRequest = () => this.isActive) {
      const token = this.$route.params.access_token;
      if (!this.backup) {
        const password = await getExtensionPassword();
        if (!ownsRequest()) return;
        if (!password) throw new Error('Wallet is locked');
        const { json } = await exportJSON(address, password);
        if (!ownsRequest()) return;
        const ethAddress = json.meta.ethereumAddress as string | undefined;
        let child: KeyringPair$Json | undefined;
        if (ethAddress && ethAddress.toLowerCase() !== address.toLowerCase()) {
          child = (await exportJSON(ethAddress, password)).json;
          if (!ownsRequest()) return;
        }
        this.backup = { primary: json, primaryAddress: address, child, childAddress: ethAddress };
      }
      const backup = this.backup;
      const upload = async (json: KeyringPair$Json, description: string) => {
        const result = await createGoogleFile({ json: JSON.stringify(json), options: {
          name: String(json.meta.name ?? this.nickname), address: description,
        }, token });
        if (typeof result?.id !== 'string' || !result.id.trim()) throw new Error('Google Drive did not confirm the backup');
        return result.id;
      };
      if (backup.child && !backup.childId) {
        const id = await upload(backup.child, backup.childAddress!);
        if (!ownsRequest()) return;
        backup.childId = id;
      }
      if (!backup.primaryId) {
        const description = backup.childId ? `${backup.primaryAddress}/${backup.childId}` : backup.primaryAddress;
        const id = await upload(backup.primary, description);
        if (!ownsRequest()) return;
        backup.primaryId = id;
      }
    },
    async saveKeypairFromSeed(ownsRequest = () => this.isActive) {
          if (this.createdAddress) return this.createdAddress;
          if (!this.mnemonic || !this.nickname.trim()) throw new Error('Wallet details are incomplete');
          const meta: FWKeyringMeta = {
            name: this.nickname.trim(),
            ethereumAddress: '',
            walletEcosystem: WalletEcosystem.Substrate,
          };

          if (this.mnemonic) {
            Object.assign(meta, deriveUniversalWalletKeyringFields(this.mnemonic));
          }

          const {
            substrate: { keypairType: substrateKeypairType },
            ethereum: { keypairType: ethereumKeypairType },
          } = this.derivationPaths;

          const suriEthereum = this.suriEthereum;
          const suriSubstrate = this.suriSubstrate;
          if (!this.createdEthereumAddress) {
            const ethereumAddress = await addAccount(suriEthereum, ethereumKeypairType, meta, WalletEcosystem.Substrate, true);
            if (!ownsRequest()) return '';
            if (!ethereumAddress) throw new Error('Ethereum account was not confirmed');
            this.createdEthereumAddress = ethereumAddress;
          }
          meta.ethereumAddress = this.createdEthereumAddress;
          const address = await addAccount(suriSubstrate, substrateKeypairType, meta, WalletEcosystem.Substrate, true);
          if (!ownsRequest()) return '';
          if (!address) throw new Error('Primary account was not confirmed');
          this.createdAddress = address;
          return address;
    },
  },
});
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
  color: $grayish-white-2;

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

<style lang="scss" scoped>
.backup-error { color: var(--fw-danger); overflow-wrap: anywhere; }
</style>
