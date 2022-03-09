<template>
  <div class="create-wallet">
    <div v-if="currentIndexPage < 3" class="back" @click="back">
      <s-icon name="arrow-left-16" />
    </div>

    <div class="header">{{ header }}</div>

    <CreateWallet
      :currentIndexPage="currentIndexPage"
      :mnemonic="mnemonic"
      :selectedMnemonicElements="selectedMnemonicElements"
      :unselectedMnemonicElements="unselectedMnemonicElements"
      @updateSelectedMnemonicElements="updateSelectedMnemonicElements"
    />

    <div v-if="currentIndexPage < 3">
      <s-button class="button" type="primary" border-radius="none" @click="proceed" :disabled="disabledProceed">
        Continue
      </s-button>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import MainPage from '../mainPage/MainPage.vue';
import CreateWallet from './createWallet/CreateWallet.vue';
import { Mutation, Getter } from 'vuex-class';
import { MutationTypes } from '../../store/account/mutations';
import { GettersTypes } from '../../store/account/getters';
import { Account } from '../../store/account/types';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import keyring from '@polkadot/ui-keyring';

@Component({
  components: {
    MainPage,
    CreateWallet,
  },
})
export default class App extends Vue {
  mnemonic: string[] = [];
  headers = ['Create a new wallet', 'Backup mnemonic', 'Confirm mnemonic'];
  selectedMnemonicElements: string[] = [];
  unselectedMnemonicElements: string[] = [];
  currentIndexPage = 0;

  @Getter(GettersTypes.getNickname) nickname!: string;
  @Getter(GettersTypes.getAccount) account!: Account;
  @Mutation(MutationTypes.SET_ACCOUNT) setAccount: any;

  get header() {
    return this.headers[this.currentIndexPage];
  }

  get disabledProceed() {
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

  proceed() {
    if (!this.currentIndexPage && !this.mnemonic.length) {
      const mnemonic = mnemonicGenerate().split(' ');

      this.mnemonic = [...mnemonic];
      this.unselectedMnemonicElements = [...mnemonic];

      // this.unselectedMnemonicElements = [...mnemonic].sort(() => Math.random() - 0.5);
    } else if (this.currentIndexPage === 2) {
      const account = keyring.addUri(this.mnemonic.join(' '));

      this.setAccount({ account });

      alert('Wallet created. Check console');

      console.log('account info', this.account);
    }

    this.currentIndexPage += 1;
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
      this.$emit('reset');

      return;
    }

    this.currentIndexPage -= 1;
  }
}
</script>

<style lang="scss" scoped>
.create-wallet {
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
