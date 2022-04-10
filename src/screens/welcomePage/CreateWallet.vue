<template>
  <div class="create-wallet">
    <MnemonicBackupFom v-if="showMnemonicBackupForm" :mnemonic="mnemonic">
      <slot></slot>
    </MnemonicBackupFom>
    <MnemonicConfirmationForm
      v-if="showMnemonicConfirmationForm"
      :mnemonic="mnemonic"
      :selectedMnemonicElements="selectedMnemonicElements"
      @updateSelectedMnemonicElements="updateSelectedMnemonicElements"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { DerivationPath } from '../../interfaces/connectionWallet';
import MnemonicConfirmationForm from './MnemonicConfirmationForm.vue';
import MnemonicBackupFom from './MnemonicBackupFom.vue';
import MainPage from '../mainPage/MainPage.vue';

@Component({
  components: {
    MnemonicConfirmationForm,
    MnemonicBackupFom,
    MainPage,
  },
})
export default class extends Vue {
  @Prop(Number) currentIndexPage!: number;
  @Prop(String) mnemonic!: string;
  @Prop(Array) selectedMnemonicElements!: string[];
  @Prop(Object) derivationPath!: DerivationPath;

  get showMnemonicBackupForm() {
    return this.currentIndexPage === 2;
  }

  get showMnemonicConfirmationForm() {
    return this.currentIndexPage === 3;
  }

  updateSelectedMnemonicElements(element: string, index: number, added: boolean) {
    this.$emit('updateSelectedMnemonicElements', element, index, added);
  }
}
</script>

<style lang="scss" scoped>
.create-wallet {
  width: 100%;
}
</style>
