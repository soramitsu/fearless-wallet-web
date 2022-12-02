<template>
  <FlowStepLayout :countSteps="countSteps" :step="step" :header="header" @back="back" :showFullScreenIcon="false">
    <ImportWallet
      v-if="importWalletStep"
      v-model="typeImport"
      :step="step"
      :mnemonic="mnemonic"
      :substrateRawSeed="substrateRawSeed"
      :ethereumRawSeed="ethereumRawSeed"
      :substrateJson="substrateJson"
      :ethereumJson="ethereumJson"
      :passwordJson="passwordJson"
      :isOnlyEthereumAccountFlow="false"
      :isReplaceAccountFlow="false"
      :isEthereumReplacedNetwork="false"
      @setImportValue="setImportValue"
      @reset="reset"
      @update:passwordJson="setPasswordJson"
    >
      <AdvancedButton @click="toggleAdvancedFormVisible" />
    </ImportWallet>

    <NickNameForm v-if="nickNameStep" :nickname="nickname" @update:nickname="setNickname" />

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
      :showMockPassword="false"
      :showSamePasswordText="false"
      @updateWalletPassword="updateWalletPassword"
    />

    <NotificationPopup
      v-if="showNotificationPopup"
      :headers="notificationPopupContent"
      acceptButtonText="common.accept"
      :showAcceptButton="true"
      :showWarningIcon="false"
      :handlerAccept="popupHandler"
      :handlerClose="popupHandler"
    />

    <template v-slot:control>
      <Button
        size="big"
        fontSize="big"
        width="100%"
        :border="false"
        :disabled="disabledProceed"
        :text="buttonText"
        @click="proceed"
      />
    </template>
  </FlowStepLayout>
</template>

<script lang="ts">
import { Getter, Action } from 'vuex-class';
import { Component, Vue, Watch } from 'vue-property-decorator';
import { TranslateResult } from 'vue-i18n';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import type { ImportType } from '@/interfaces';
import NegativeMessage from '@/screens/addWallet/google/NegativeMessage.vue';
import PasswordForm from '@/screens/addWallet/PasswordForm.vue';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';
import NickNameForm from '@/screens/addWallet/NicknameForm.vue';
import ImportWallet from '@/screens/addWallet/ImportWallet.vue';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import { Components } from '@/router/routes';
import { MnemonicConfirmation, TAction } from '@/interfaces';
import AdvancedForm from '@/screens/addWallet/AdvancedForm.vue';
import { INITIAL_DERIVATION_PATHS, ETHEREUM_DEFAULT_DERIVATION_PATH } from '@/consts/derivationPath';
import BaseApi from '@/util/BaseApi';
import { createGoogleFile } from '@/extension/messaging';
import { SelectedWallet, SetSelectedWallet } from '@/store/accounts/types';
import { ActionTypes as ActionActionTypes } from '@/store/accounts/actions';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

type AddWalletField = 'mnemonic' | 'ethereumRawSeed' | 'substrateRawSeed' | 'substrateJson' | 'ethereumJson';

@Component({
  components: {
    AdvancedForm,
    NickNameForm,
    ImportWallet,
    PasswordForm,
    FlowStepLayout,
    AdvancedButton,
    NegativeMessage,
  },
})
export default class ImportGoogle extends Vue {
  readonly countSteps = 5;
  typeImport: ImportType = 'mnemonic';
  step = 1;
  nickname = '';
  mnemonic = '';
  selectedMnemonicElements: MnemonicConfirmation[] = [];
  showAdvancedForm = false;
  walletPassword = '';
  derivationPaths = INITIAL_DERIVATION_PATHS;
  showNotificationPopup = false;
  passwordSubstrateJson = '';
  passwordEthereumJson = '';
  ethereumJson = '';
  substrateJson = '';
  ethereumRawSeed = '';
  substrateRawSeed = '';
  notificationHeaders = { text: 'addWallet.google.saved', subtext: 'addWallet.google.passphraseSaved' };
  jsonInvalid = {
    text: 'addWallet.warningMessages.jsonInvalid.text',
    subtext: 'addWallet.warningMessages.jsonInvalid.subtext',
  };

  buttonTextForStep: Record<number, TranslateResult> = {
    2: this.$t('common.continue'),
    5: this.$t('common.finish'),
  };

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Action(ActionActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<SetSelectedWallet>;

  get showEthereumDP() {
    return this.typeImport === 'mnemonic';
  }

  get passwordJson() {
    return this.step === 1 ? this.passwordSubstrateJson : this.passwordEthereumJson;
  }

  get importWalletStep() {
    return this.step === 1 || this.step === 2;
  }

  get nickNameStep() {
    return this.step === 3;
  }

  get passwordStep() {
    return this.step === 4;
  }

  get notificationPopupContent() {
    return this.step === 5 ? this.jsonInvalid : this.notificationHeaders;
  }

  get subButtonType() {
    if (this.step === 4) return 'google';

    return 'link';
  }

  get header() {
    if (this.step === 1 || this.step === 5) return '';
    if (this.step === 4) return this.$t('addWallet.setupPassword');

    return this.$t('addWallet.importWallet');
  }

  get buttonText() {
    if (this.buttonTextForStep[this.step]) return this.buttonTextForStep[this.step];

    return this.$t('addWallet.importWallet');
  }

  get disabledProceed() {
    if (this.nickNameStep) return !this.nickname;
    if (this.passwordStep) return !this.walletPassword;

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

  get substrateJSON() {
    return BaseApi.parseJson(this.substrateJson);
  }

  get ethereumJSON() {
    return BaseApi.parseJson(this.ethereumJson);
  }

  @Watch('step')
  watchStep() {
    if (this.step === 5) {
      const address = this.saveKeypair();

      this.setSelectedWallet({ selectedWalletAddress: address || this.selectedWallet.address });

      this.backupWallet(address);
    }
  }

  saveKeypair() {
    if (this.substrateJson || this.ethereumJson) return this.saveKeypairFromJson();

    return this.saveKeypairFromSeed();
  }

  saveKeypairFromJson() {
    const substrateJSON = { ...this.substrateJSON };

    if (this.ethereumJson) {
      const { address: ethereumAddress } = BaseApi.addKeypairFromJson(this.ethereumJSON, this.passwordEthereumJson);

      substrateJSON.meta.ethereumAddress = ethereumAddress;
    }

    const { address } = BaseApi.addKeypairFromJson(substrateJSON, this.passwordSubstrateJson);

    return address;
  }

  popupHandler() {
    this.showNotificationPopup = false;

    this.step === 5 ? (this.step -= 1) : (this.step += 1);
  }

  back() {
    if (this.step === 1) {
      this.$router.push({ name: Components.Welcome });

      return;
    }

    this.step -= 1;
  }

  proceed() {
    if (this.step === this.countSteps) {
      this.$router.push({ name: Components.Wallet });

      return;
    }

    if (this.step === 1 && this.typeImport === 'mnemonic') {
      this.step += 1;
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

  backupWallet(address: string) {
    const json = BaseApi.getPair(address).toJson(this.walletPassword);

    createGoogleFile(JSON.stringify(json), { name: this.nickname, address }, this.$route.params.access_token);
  }

  saveKeypairFromSeed() {
    const meta: Record<string, unknown> = { name: this.nickname.trim(), ethereumAddress: '' };
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

  setImportValue(value: string & (KeyringPair$Json | Record<string, never>), field: AddWalletField) {
    this[field] = value;
  }

  setPasswordJson(value: string) {
    if (this.step === 1) this.passwordSubstrateJson = value;
    else this.passwordEthereumJson = value;
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
</style>
