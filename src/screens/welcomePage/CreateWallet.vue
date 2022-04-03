<template>
  <div class="create-wallet">
    <NicknameForm v-if="currentIndexPage === 1" />
    <template v-else>
      <MnemonicBackupFom v-if="showMnemonicBackupFom" :mnemonic="mnemonic">
        <AdvancedButton :handler="toggleAdvancedFormVisible" />
      </MnemonicBackupFom>
      <MnemonicConfirmationForm
        v-if="showMnemonicConfirmationForm"
        :mnemonic="mnemonic"
        :selectedMnemonicElements="selectedMnemonicElements"
        @updateSelectedMnemonicElements="updateSelectedMnemonicElements"
      />
      <AdvancedForm
        v-if="showAdvancedForm"
        :derivationPath="derivationPath"
        @saveChanges="setValue"
        @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { DerivationPath } from '../../interfaces/connectionWallet';
import NicknameForm from './NicknameForm.vue';
import MnemonicConfirmationForm from './MnemonicConfirmationForm.vue';
import MnemonicBackupFom from './MnemonicBackupFom.vue';
import AdvancedButton from './AdvancedButton.vue';
import AdvancedForm from './AdvancedForm.vue';
import MainPage from '../mainPage/MainPage.vue';

@Component({
  components: {
    NicknameForm,
    MnemonicConfirmationForm,
    MnemonicBackupFom,
    MainPage,
    AdvancedForm,
    AdvancedButton,
  },
})
export default class extends Vue {
  @Prop(Number) currentIndexPage!: number;
  @Prop(String) mnemonic!: string;
  @Prop(Array) selectedMnemonicElements!: string[];
  @Prop(Object) derivationPath!: DerivationPath;

  showAdvancedForm = false;

  get showMnemonicBackupFom() {
    return this.currentIndexPage === 2 && !this.showAdvancedForm;
  }

  get showMnemonicConfirmationForm() {
    return this.currentIndexPage === 3 && !this.showAdvancedForm;
  }

  toggleAdvancedFormVisible(value = true) {
    this.showAdvancedForm = value;
  }

  updateSelectedMnemonicElements(element: string, index: number, added: boolean) {
    this.$emit('updateSelectedMnemonicElements', element, index, added);
  }

  setValue(value: DerivationPath) {
    this.$emit('setValue', value, 'derivationPath');

    this.toggleAdvancedFormVisible(false);
  }
}
</script>

<style lang="scss" scoped>
.create-wallet {
  width: 100%;
}
</style>
