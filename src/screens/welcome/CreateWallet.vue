<template>
  <div class="create-wallet">
    <MnemonicBackupForm v-if="showMnemonicBackupForm" :mnemonic="mnemonic">
      <slot></slot>
    </MnemonicBackupForm>
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
import { DerivationPath } from '@/interfaces/connectionWallet';
import MnemonicConfirmationForm from './MnemonicConfirmationForm.vue';
import MnemonicBackupForm from './MnemonicBackupForm.vue';

@Component({
  components: {
    MnemonicConfirmationForm,
    MnemonicBackupForm,
  },
})
export default class CreateWallet extends Vue {
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
