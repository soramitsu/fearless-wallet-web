<template>
  <FlowStepLayout :countSteps="countSteps" :step="step" :header="header" @back="back" :showFullScreenIcon="false">
    <div class="step__content">
      <NegativeMessage v-if="step === 1" :message="$t('addWallet.google.noWallets')" />

      <NickNameForm v-if="nickNameStep" :nickname="nickname" @update:nickname="setNickname" />

      <div class="icon__container" v-if="step === 3">
        <Icon className="icon--drive" icon="drive" />
      </div>

      <CreateWallet
        v-if="createWalletStep"
        :step="step"
        :shouldShowAtSteps="[4, 5]"
        :mnemonic="mnemonic"
        :selectedMnemonicElements="selectedMnemonicElements"
        @update:selectedMnemonicElements="updateSelectedMnemonicElements"
      >
        <AdvancedButton @click="toggleAdvancedFormVisible" />
      </CreateWallet>

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
        :headers="notificationHeaders"
        acceptButtonText="common.accept"
        :showAcceptButton="true"
        :handlerAccept="popupHandler"
        :handlerClose="popupHandler"
      />
    </div>
    <template v-slot:control>
      <Button
        size="big"
        fontSize="big"
        width="100%"
        :border="false"
        :disabled="disabledProceed"
        :text="buttonText"
        :type="buttonType"
        @click="proceed"
      />

      <Button
        v-if="step === 3"
        size="big"
        fontSize="big"
        width="100%"
        :border="false"
        :text="subButtonText"
        :type="subButtonType"
        @click="subButtonProceed"
      />
    </template>
  </FlowStepLayout>
</template>

<script lang="ts">
import { Getter, Action } from 'vuex-class';
import { Component, Vue, Watch } from 'vue-property-decorator';
import NegativeMessage from '@/screens/addWallet/google/NegativeMessage.vue';
import Icon from '@/components/Icon.vue';
import PasswordForm from '@/screens/addWallet/PasswordForm.vue';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';
import NickNameForm from '@/screens/addWallet/NicknameForm.vue';
import Button from '@/components/Button.vue';
import CreateWallet from '@/screens/addWallet/CreateWallet.vue';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import NotificationPopup from '@/components/NotificationPopup.vue';
import { Components } from '@/router/routes';
import { MnemonicConfirmation, TAction } from '@/interfaces';
import AdvancedForm from '@/screens/addWallet/AdvancedForm.vue';
import { INITIAL_DERIVATION_PATHS } from '@/consts/derivationPath';
import BaseApi from '@/util/BaseApi';
import { createGoogleFile } from '@/extension/messaging';
import { SelectedWallet, SetSelectedWallet } from '@/store/accounts/types';
import { ActionTypes as ActionActionTypes } from '@/store/accounts/actions';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component({
  components: {
    NegativeMessage,
    AdvancedButton,
    Icon,
    AdvancedForm,
    NickNameForm,
    CreateWallet,
    PasswordForm,
    FlowStepLayout,
    NotificationPopup,
    Button,
  },
})
export default class CreateGoogleWallet extends Vue {
  readonly countSteps = 7;
  step = 1;
  nickname = '';
  mnemonic = '';
  selectedMnemonicElements: MnemonicConfirmation[] = [];
  showAdvancedForm = false;
  walletPassword = '';
  derivationPaths = INITIAL_DERIVATION_PATHS;
  showNotificationPopup = false;
  notificationHeaders = { text: 'addWallet.google.saved', subtext: 'addWallet.google.passphraseSaved' };

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Action(ActionActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<SetSelectedWallet>;
  mounted() {
    this.mnemonic = BaseApi.generateMnemonic();
  }

  get nickNameStep() {
    return this.step === 2;
  }

  get createWalletStep() {
    return this.step === 4 || this.step === 5;
  }

  get passwordStep() {
    return this.step === 6;
  }

  back() {
    if (this.step === 1) {
      this.$router.push({ name: Components.Welcome });

      return;
    }

    this.step -= 1;
  }
  @Watch('step')
  watchStep() {
    if (this.step === 7) {
      const address = this.saveKeypairFromSeed();

      this.setSelectedWallet({ selectedWalletAddress: address || this.selectedWallet.address });

      this.backupWallet(address);
    }
  }

  popupHandler() {
    this.showNotificationPopup = false;
    this.step += 1;
  }

  proceed() {
    if (this.step === this.countSteps) {
      this.$router.push({ name: Components.Wallet });

      return;
    }

    if (this.step === 6) {
      this.showNotificationPopup = true;

      return;
    }

    this.step === 3 ? (this.step += 3) : (this.step += 1);
  }

  subButtonProceed() {
    this.step === 4 ? (this.step += 2) : (this.step = 4);
  }

  get subButtonText() {
    if (this.step === 4) return this.$t('addWallet.google.backupWallet');

    return this.$t('addWallet.google.showPassPhrase');
  }

  get subButtonType() {
    if (this.step === 4) return 'google';

    return 'link';
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

  get header() {
    if (this.step === 1) return '';
    if (this.step === 3) return 'Backup the passphrase for your new wallet';
    if (this.step === 5) return 'Confirm the passphrase';
    if (this.step === 6) return 'Set up password';

    return 'Create new wallet';
  }

  get buttonType() {
    if (this.step === 3) return 'google';

    return 'primary';
  }

  get buttonText() {
    if (this.step === 4) return this.$t('addWallet.haveWrittenPassphrase');

    if (this.step === 3) return this.$t('addWallet.google.backupWallet');

    if (this.step === 2) return this.$t('common.confirm');

    return this.$t('addWallet.createWallet');
  }

  get disabledProceed() {
    // mutual logic step(password)
    if (this.nickNameStep) return !this.nickname;

    if (this.passwordStep) return !this.walletPassword;

    return false;
  }

  get suriSubstrate() {
    const {
      substrate: { value: substrateDerivationPath },
    } = this.derivationPaths;

    return `${this.mnemonic}${substrateDerivationPath.trim()}`;
  }

  saveKeypairFromSeed() {
    const meta: Record<string, unknown> = { name: this.nickname.trim(), ethereumAddress: '' };
    const {
      substrate: { keypairType },
    } = this.derivationPaths;

    meta.ethereumAddress = '';

    const { address } = BaseApi.addKeypair(this.suriSubstrate, this.walletPassword, meta, keypairType);

    return address;
  }
}
</script>

<style lang="scss" scoped>
.step__content {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
}

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
