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
      @updateSelectedMnemonicElements="updateSelectedMnemonicElements"
    />

    <ImportWallet
      v-else-if="showImportForm"
      :mnemonic="mnemonic"
      :json="json"
      :currentIndexPage="currentIndexPage"
      @setMnemonic="setMnemonic"
      @setJson="setJson"
      @setPassword="setPassword"
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
import { WalletConnectionStatus } from '../../interfaces/connectionWallet';
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
export default class App extends Vue {
  json: KeyringPair$Json | KeyringPairs$Json | Record<string, never> = {};
  password = '';
  mnemonic: string[] = [];
  headersCreateWallet = ['Create a new wallet', 'Backup mnemonic', 'Confirm mnemonic'];
  headerForCreateWallet = 'Import wallet';
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
      ? this.headerForCreateWallet
      : this.headersCreateWallet[this.currentIndexPage];
  }

  get disabledProceed() {
    if (this.isImportWallet) {
      return !this.nickname || (!mnemonicValidate(this.mnemonic.join(' ')) && Object.keys(this.json).length === 0);
    }

    // else isCreateWallet
    if (this.currentIndexPage === 0) {
      return !this.nickname;
    } else if (this.currentIndexPage === 1) {
      return false;
    } else if (this.currentIndexPage === 2) {
      return this.mnemonic
        .map((mnemonicElement, index) => this.selectedMnemonicElements[index] === mnemonicElement)
        .includes(false);
    }

    return true;
  }

  setMnemonic(value: string[]) {
    this.mnemonic = value;
  }

  setJson(value: KeyringPairs$Json | KeyringPair$Json) {
    this.json = value;
  }

  setPassword(value: string) {
    this.password = value;
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
    const account = keyring.addUri(this.mnemonic.join(' '));

    this.setAccount({ account });

    alert(this.isImportWallet ? 'Wallet imported. Check console' : 'Wallet created. Check console');

    console.log('account info', this.account);
  }

  createWallet() {
    if (!this.currentIndexPage && !this.mnemonic.length) {
      const mnemonic = mnemonicGenerate().split(' ');

      this.mnemonic = [...mnemonic];
      this.unselectedMnemonicElements = [...mnemonic];
      // this.unselectedMnemonicElements = [...mnemonic].sort(() => Math.random() - 0.5);
    } else if (this.currentIndexPage === 2) {
      this.accountAuthorization();
    }
  }

  importWallet() {
    if (this.mnemonic.length !== 0) {
      this.accountAuthorization();
    } else if (Object.keys(this.json).length !== 0) {
      const typedJson = Object.prototype.hasOwnProperty.call(this.json, 'account')
        ? (this.json as KeyringPairs$Json)
        : (this.json as KeyringPair$Json);

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
      this.mnemonic = [];
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
