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
        <s-icon name="arrows-arrows-diagonals-bltr-24" />
      </div>
    </div>

    <div class="content-block">
      <div v-if="!loading" class="content">
        <CreateWallet
          v-if="showCreateForm"
          :currentIndexPage="currentIndexPage"
          :mnemonic="mnemonic"
          :selectedMnemonicElements="selectedMnemonicElements"
          :derivationPath="derivationPath"
          @updateSelectedMnemonicElements="updateSelectedMnemonicElements"
          @setValue="setValue"
        />

        <ImportWallet
          v-else-if="showImportForm"
          :mnemonic="mnemonic"
          :rawSeed="rawSeed"
          :json="json"
          :passwordJson="passwordJson"
          :derivationPath="derivationPath"
          @setValue="setValue"
        />

        <PasswordForm v-else-if="showPasswordForm" />

        <FinishForm v-else-if="showFinishForm" />

        <MainPage v-else-if="showMainPage" />

        <div v-if="!showMainPage">
          <s-button
            class="button"
            type="primary"
            size="big"
            border-radius="mini"
            @click="proceed"
            :disabled="disabledProceed"
          >
            {{ buttonText }}
          </s-button>
        </div>
      </div>

      <Loading v-else-if="loading" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Mutation, Getter } from 'vuex-class';
import { MutationTypes } from '../../store/accounts/mutations';
import { GettersTypes } from '../../store/accounts/getters';
import { Accounts } from '../../store/accounts/types';
import { WalletConnectionStatus, DerivationPath, TypeFiledForImport } from '../../interfaces/connectionWallet';
import { isKeyringPairs$Json } from '../../util/typeGuards';
import { mnemonicGenerate, mnemonicValidate } from '@polkadot/util-crypto';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import type { KeyringPairs$Json } from '@polkadot/ui-keyring/types';
import MainPage from '../mainPage/MainPage.vue';
import CreateWallet from './CreateWallet.vue';
import FinishForm from './FinishForm.vue';
import PasswordForm from './PasswordForm.vue';
import ImportWallet from './ImportWallet.vue';
import Loading from '../Loading.vue';
import keyring from '@polkadot/ui-keyring';

@Component({
  components: {
    MainPage,
    CreateWallet,
    ImportWallet,
    FinishForm,
    PasswordForm,
    Loading,
  },
})
export default class extends Vue {
  json: KeyringPair$Json | KeyringPairs$Json | Record<string, never> = {};
  mnemonic = '';
  rawSeed = '';
  passwordJson = '';
  loading = false;
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
  @Getter(GettersTypes.getNickname) nickname!: string;
  @Getter(GettersTypes.getAccounts) accounts!: Accounts;
  @Getter(GettersTypes.getPassword) passwordExtension!: string;
  @Mutation(MutationTypes.SET_ACCOUNT) setAccount: any;
  @Mutation(MutationTypes.SET_NICKNAME) setNickname: any;

  get countSteps() {
    return this.isImportWallet ? 3 : 5;
  }

  get backIconClasses() {
    return [
      'icon',
      {
        'icon-background': this.currentIndexPage <= 4,
      },
    ];
  }

  get buttonText() {
    if (this.isCreateWallet && this.currentIndexPage === 1) {
      return this.disabledProceed ? 'Enter nickname' : 'Continue';
    } else if (this.showPasswordForm) {
      return this.disabledProceed ? 'Enter password' : 'Continue';
    } else if (this.showFinishForm) {
      return 'Finish';
    }

    return 'Continue';
  }

  get isCreateWallet() {
    return this.walletConnectionStatus === 'isCreateWallet';
  }

  get isImportWallet() {
    return this.walletConnectionStatus === 'isImportWallet';
  }

  get showCreateForm() {
    return this.isCreateWallet && this.currentIndexPage < 4;
  }

  get showImportForm() {
    return this.isImportWallet && this.currentIndexPage === 1;
  }

  get showPasswordForm() {
    return this.isImportWallet ? this.currentIndexPage === 2 : this.currentIndexPage === 4;
  }

  get showMainPage() {
    return this.isImportWallet ? this.currentIndexPage === 4 : this.currentIndexPage === 6;
  }

  get showBackIcon() {
    return this.isImportWallet ? this.currentIndexPage < 3 : this.currentIndexPage < 5;
  }

  get showFinishForm() {
    return this.isImportWallet ? this.currentIndexPage === 3 : this.currentIndexPage === 5;
  }

  get disabledProceed() {
    // isImportWallet
    if (this.isImportWallet && this.currentIndexPage === 1) {
      return (
        !this.nickname ||
        (!mnemonicValidate(this.mnemonic) &&
          (Object.keys(this.json).length === 0 || !this.passwordJson) &&
          !this.rawSeed)
      );
    }

    // isCreateWallet
    if (this.isCreateWallet && this.currentIndexPage === 1) {
      return !this.nickname;
    } else if (this.isCreateWallet && this.currentIndexPage === 3) {
      return this.mnemonic
        .split(' ')
        .map((mnemonicElement, index) => this.selectedMnemonicElements[index] === mnemonicElement)
        .includes(false);
    }

    // mutual logic step(password)
    if (this.showPasswordForm) {
      return !this.passwordExtension;
    }

    return false;
  }

  setValue(
    value: string & (KeyringPair$Json | KeyringPairs$Json | Record<string, never>) & DerivationPath,
    typeField: TypeFiledForImport | 'passwordJson' | 'derivationPath'
  ) {
    this[typeField] = value;
  }

  proceed() {
    if (this.isCreateWallet) {
      this.createWallet();
    } else {
      this.importWallet();
    }

    this.currentIndexPage += 1;
  }

  accountAuthorization() {
    this.loading = true;

    // test row seed: 0x3d60d4270bc927dc5985631c9ae2f661a22458bd1733a6716da3b50aeb583912
    // test mnemonic: sibling image belt spot resist year labor style fringe hamster render idle
    const { value: substrate, keyPair } = this.derivationPath.substrate;
    const suri = `${this.mnemonic || this.rawSeed}${substrate}`;
    const { pair: account } = keyring.addUri(suri, '', {}, keyPair);

    console.log('keyring', keyring.getAccounts());

    this.setAccount({ account });

    setTimeout(() => {
      alert(this.isImportWallet ? 'Wallet imported. Check console' : 'Wallet created. Check console');

      this.loading = false;
    }, 1000);

    console.log('accounts info', this.accounts);
  }

  createWallet() {
    if (this.currentIndexPage === 1 && !this.mnemonic.length) {
      const mnemonic = mnemonicGenerate();

      this.mnemonic = mnemonic;
    } else if (this.currentIndexPage === 4) {
      this.accountAuthorization();
    }
  }

  importWallet() {
    if (this.currentIndexPage !== 2) return;
    this.loading = true;

    if (Object.keys(this.json).length === 0) {
      this.accountAuthorization();
    } else if (Object.keys(this.json).length !== 0) {
      // temporary setTimeout
      // doesn't work as expected without it
      // loading does not have time to draw before the start of the function restoreAccounts
      setTimeout(() => {
        const typedJson = Object.prototype.hasOwnProperty.call(this.json, 'account')
          ? (this.json as KeyringPairs$Json)
          : (this.json as KeyringPair$Json);

        try {
          const keyringPair = isKeyringPairs$Json(typedJson)
            ? keyring.restoreAccounts(typedJson, this.passwordJson)
            : keyring.restoreAccount(typedJson, this.passwordJson);

          console.log('keyringPair', keyringPair);

          // TODO: currently only works for non-batch json file
          this.setAccount({
            account: keyringPair,
          });

          setTimeout(() => {
            alert('Wallet imported. Check console');

            this.loading = false;
          }, 1000);

          console.log('account info', this.accounts);
        } catch {
          alert('Invalid password JSON!');
        }
      }, 100);
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

      this.setNickname({ nickname: '' });
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
    margin: 15px 15px;
    display: flex;
    justify-content: space-between;

    .steps {
      display: flex;
      align-items: center;

      .circle-step {
        border-radius: 50%;
        width: 16px;
        height: 16px;
        background-color: rgba(255, 255, 255, 0.1);
        margin: 0 8px;
      }

      .circle-filled {
        background-color: #ee0077;
      }
    }
  }

  .content-block {
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .content {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
  }

  i {
    color: white;
  }

  .button {
    width: 528px;
    font-size: 24px;
  }

  .el-button.s-primary:disabled {
    background-color: rgba(255, 255, 255, 0.1);
    border: rgba(255, 255, 255, 0.05);
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
    font-size: 16px;

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
