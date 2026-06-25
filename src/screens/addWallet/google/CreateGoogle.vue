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

import type { FWKeyringMeta } from '@extension-base/types';
import { type DerivationPaths, WalletEcosystem, type MnemonicConfirmation } from '@/interfaces';
import NegativeMessage from '@/screens/addWallet/google/NegativeMessage.vue';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';
import NickNameForm from '@/screens/addWallet/NicknameForm.vue';
import CreateWallet from '@/screens/addWallet/CreateWallet.vue';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import AdvancedForm from '@/screens/addWallet/AdvancedForm.vue';
import { ETHEREUM_DEFAULT_DERIVATION_PATH, INITIAL_DERIVATION_PATHS } from '@/consts/derivationPath';
import { UNIVERSAL_WALLET_DEFAULT_WORD_COUNT } from '@/consts/universalWallet';
import { deriveBitcoinReceiveAddress } from '@/util/bitcoinKeyring';
import { deriveIrohaAddress } from '@/util/irohaKeyring';
import { deriveSolanaAddress } from '@/util/solanaKeyring';
import { deriveTonAccount } from '@/util/tonKeyring';
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
    1: this.$t('common.continue'),
    2: this.$t('addWallet.haveWrittenPassphrase'),
    3: this.$t('addWallet.ConfirmSecretData'),
    4: this.$t('common.finish'),
  },
      selectedMnemonicElements: [],
      step: 1,
      nickname: '',
      mnemonic: '',
      showAdvancedForm: false,
      derivationPaths: INITIAL_DERIVATION_PATHS,
      showNotificationPopup: false,
      warningValueName: '',
      isLoading: false,
    };
  },
  computed: {
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
      if (this.buttonTextForStep[this.step]) return this.buttonTextForStep[this.step];

          return this.$t('addWallet.createWallet');
    },
    disabledProceed() {
      if (this.nickNameStep) return !this.nickname;

          if (this.isLoading) return true;

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
    "step": 'watchStep',
  },
  async mounted() {
    this.mnemonic = await generateMnemonic(WalletEcosystem.Substrate, UNIVERSAL_WALLET_DEFAULT_WORD_COUNT);
  },
  methods: {
    async watchStep() {
      if (this.step === 4) {
            this.isLoading = true;

            const address = await this.saveKeypairFromSeed();

            await this.backupWallet(address);

            updateCurrentAccount(address);

            this.isLoading = false;
          }
    },
    updateDP(derivationPaths: DerivationPaths) {
      this.derivationPaths = derivationPaths;
    },
    resetAll() {
      this.selectedMnemonicElements = [];
    },
    skipStep() {
      this.step += 1;
    },
    async handlerCloseNotificationPopup() {
      this.warningValueName = '';
          this.selectedMnemonicElements = [];
          this.showNotificationPopup = false;
    },
    async handlerAcceptAddWallet() {
      this.warningValueName = '';

          this.step += 1;
    },
    goBack() {
      this.$router.replace('/').catch((e) => e);
    },
    back() {
      if (this.step === 1) this.goBack();
          else this.step -= 1;
    },
    proceed() {
      if (this.step === this.countSteps) {
            this.goBack();

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
    async backupWallet(address: string) {
      const password = await getExtensionPassword();
          const { json } = await exportJSON(address, password);

          const ethAddress = json.meta.ethereumAddress as string;
          const token = this.$route.params.access_token;

          let ethRes;

          if (ethAddress) {
            const { json: ethJson } = await exportJSON(ethAddress, password);

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
    },
    async saveKeypairFromSeed() {
          const meta: FWKeyringMeta = {
            name: this.nickname.trim(),
            ethereumAddress: '',
            walletEcosystem: WalletEcosystem.Substrate,
          };

          if (this.mnemonic) {
            meta.bitcoinAddress = deriveBitcoinReceiveAddress({ mnemonicOrSeed: this.mnemonic });
            meta.bitcoinTestnetAddress = deriveBitcoinReceiveAddress({ mnemonicOrSeed: this.mnemonic, network: 'testnet' });
            meta.solanaAddress = deriveSolanaAddress({ mnemonic: this.mnemonic });
            const ton = deriveTonAccount({ mnemonic: this.mnemonic });
            const iroha = deriveIrohaAddress({ mnemonic: this.mnemonic, network: 'taira' });

            meta.tonAddress = ton.addressNonBounceable;
            meta.tonPublicKeyHex = ton.publicKeyHex;
            meta.irohaPublicKeyHex = iroha.publicKeyHex;
            meta.irohaAddress = iroha.address;
          }

          const {
            substrate: { keypairType: substrateKeypairType },
            ethereum: { keypairType: ethereumKeypairType },
          } = this.derivationPaths;

          if (this.suriEthereum !== '') {
            const ethereumAddress = await addAccount(this.suriEthereum, ethereumKeypairType, meta);

            meta.ethereumAddress = ethereumAddress;
          }

          const address = await addAccount(this.suriSubstrate, substrateKeypairType, meta);

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
