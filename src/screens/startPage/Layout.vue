<template>
  <div class="layout">
    <div v-if="!hasAccount" class="back" @click="back">
      <s-icon name="arrow-left-16" />
    </div>

    <div class="header">{{ header }}</div>

    <CreateWallet
      v-if="showCreateForm"
      :currentIndexPage="currentIndexPage"
      :mnemonic="mnemonic"
      :selectedMnemonicElements="selectedMnemonicElements"
      :unselectedMnemonicElements="unselectedMnemonicElements"
      :substrateSecretDerivationPath="substrateSecretDerivationPath"
      :ethereumSecretDerivationPath="ethereumSecretDerivationPath"
      @updateSelectedMnemonicElements="updateSelectedMnemonicElements"
      @updatedDerivationPath="updatedDerivationPath"
    />

    <ImportWallet
      v-else-if="showImportForm"
      :mnemonic="mnemonic"
      :rawSeed="rawSeed"
      :json="json"
      :currentIndexPage="currentIndexPage"
      :password="password"
      @setValue="setValue"
    />

    <MainPage v-else-if="currentIndexPage === 3 || isImportWallet" />

    <div v-if="!hasAccount">
      <s-button class="button" type="primary" border-radius="none" @click="proceed" :disabled="disabledProceed">
        Continue
      </s-button>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import MainPage from '../mainPage/MainPage.vue';
import CreateWallet from './createWallet/CreateWallet.vue';
import ImportWallet from './importWallet/ImportWallet.vue';
import { Mutation, Getter } from 'vuex-class';
import { MutationTypes } from '../../store/account/mutations';
import { GettersTypes } from '../../store/account/getters';
import { Account } from '../../store/account/types';
import { mnemonicGenerate, mnemonicValidate } from '@polkadot/util-crypto';
import keyring from '@polkadot/ui-keyring';
import { WalletConnectionStatus, TypeFiledForImport } from '../../interfaces/connectionWallet';
import { isKeyringPairs$Json } from '../../util/typeGuards';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import type { KeyringPairs$Json } from '@polkadot/ui-keyring/types';

@Component({
  components: {
    MainPage,
    CreateWallet,
    ImportWallet,
  },
})
export default class extends Vue {
  json: KeyringPair$Json | KeyringPairs$Json | Record<string, never> = {};
  mnemonic = '';
  rawSeed = '';
  password = '';
  substrateSecretDerivationPath = '';
  ethereumSecretDerivationPath = '';
  headersCreateWallet = ['Create a new wallet', 'Backup mnemonic', 'Confirm mnemonic'];
  headerForImportWallet = 'Import wallet';
  headers = ['Create a new wallet', 'Backup mnemonic', 'Confirm mnemonic'];
  selectedMnemonicElements: string[] = [];
  unselectedMnemonicElements: string[] = [];
  currentIndexPage = 0;

  @Prop(String) walletConnectionStatus!: WalletConnectionStatus;
  @Getter(GettersTypes.getNickname) nickname!: string;
  @Getter(GettersTypes.getAccount) account!: Account;
  @Mutation(MutationTypes.SET_ACCOUNT) setAccount: any;
  @Mutation(MutationTypes.SET_NICKNAME) setNickname: any;

  get isCreateWallet() {
    return this.walletConnectionStatus === 'isCreateWallet';
  }

  get isImportWallet() {
    return this.walletConnectionStatus === 'isImportWallet';
  }

  get showCreateForm() {
    return this.isCreateWallet && !this.hasAccount;
  }

  get showImportForm() {
    return this.isImportWallet && !this.hasAccount;
  }

  get hasAccount() {
    return Object.keys(this.account).length !== 0;
  }

  get header() {
    return this.hasAccount
      ? ''
      : this.isImportWallet
      ? this.headerForImportWallet
      : this.headersCreateWallet[this.currentIndexPage];
  }

  get disabledProceed() {
    if (this.isImportWallet) {
      return (
        !this.nickname || (!mnemonicValidate(this.mnemonic) && Object.keys(this.json).length === 0 && !this.rawSeed)
      );
    }

    // else isCreateWallet
    if (this.currentIndexPage === 0) {
      return !this.nickname;
    } else if (this.currentIndexPage === 1) {
      return false;
    } else if (this.currentIndexPage === 2) {
      return this.mnemonic
        .split(' ')
        .map((mnemonicElement, index) => this.selectedMnemonicElements[index] === mnemonicElement)
        .includes(false);
    }

    return true;
  }

  updatedDerivationPath(value: string, name: 'substrateSecretDerivationPath' | 'ethereumSecretDerivationPath') {
    this[name] = value;
  }

  setValue(
    value: string & (KeyringPair$Json | KeyringPairs$Json | Record<string, never>) & string[],
    typeField: TypeFiledForImport | 'password'
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
    const mnemonic = `${this.mnemonic}${this.substrateSecretDerivationPath}`;

    const account = keyring.createFromUri(mnemonic || this.rawSeed);
    // const account = keyring.createFromUri('0x3d60d4270bc927dc5985631c9ae2f661a22458bd1733a6716da3b50aeb583912');

    this.setAccount({ account });

    alert(this.isImportWallet ? 'Wallet imported. Check console' : 'Wallet created. Check console');

    console.log('account info', this.account);
  }

  createWallet() {
    if (!this.currentIndexPage && !this.mnemonic.length) {
      const mnemonic = mnemonicGenerate();

      this.mnemonic = mnemonic;
      this.unselectedMnemonicElements = mnemonic.split(' ');
      // this.unselectedMnemonicElements = mnemonic.split(' ').sort(() => Math.random() - 0.5);
    } else if (this.currentIndexPage === 2) {
      this.accountAuthorization();
    }
  }

  importWallet() {
    if (this.mnemonic.length !== 0 || this.rawSeed.length !== 0) {
      this.accountAuthorization();
    } else if (Object.keys(this.json).length !== 0) {
      const typedJson = Object.prototype.hasOwnProperty.call(this.json, 'account')
        ? (this.json as KeyringPairs$Json)
        : (this.json as KeyringPair$Json);

      try {
        const keyringPair = isKeyringPairs$Json(typedJson)
          ? keyring.restoreAccounts(typedJson, this.password)
          : keyring.restoreAccount(typedJson, this.password);

        // TODO: currently only works for non-batch json file
        this.setAccount({
          account: {
            pair: keyringPair,
            json: this.json,
          },
        });

        alert('Wallet imported. Check console');

        console.log('account info', this.account);
      } catch {
        alert('Invalid password!');
      }
    }
  }

  updateSelectedMnemonicElements(element: string, index: number, added: boolean) {
    if (added) {
      this.selectedMnemonicElements.push(element);
      this.unselectedMnemonicElements.splice(index, 1);
    } else {
      this.unselectedMnemonicElements.push(element);
      this.selectedMnemonicElements.splice(index, 1);
    }
  }

  back() {
    if (this.currentIndexPage === 0) {
      this.mnemonic = '';
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
  background-color: black;
  color: white;
  display: flex;
  flex-direction: column;
  padding: 0 15px 20px 15px;

  i {
    color: white;
  }

  .back {
    position: absolute;
    top: 23px;

    &:hover {
      cursor: pointer;
    }
  }

  .header {
    display: flex;
    height: 65px;
    line-height: 65px;
    justify-content: center;
  }
}
</style>
