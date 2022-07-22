<template>
  <div class="create-wallet">
    <MnemonicBackupForm v-if="showMnemonicBackupForm" :mnemonic="mnemonic">
      <slot></slot>
    </MnemonicBackupForm>
    <MnemonicConfirmationForm
      v-if="showMnemonicConfirmationForm"
      :mnemonic="mnemonic"
      :selectedMnemonicElements="syncedSelectedMnemonicElements"
      @update:selectedMnemonicElements="updateSelectedMnemonicElements"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import type { DerivationPath } from '@/interfaces/common';
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
  @Prop(Object) derivationPath!: DerivationPath;
  @PropSync('selectedMnemonicElements', { type: Array }) syncedSelectedMnemonicElements!: string[];

  get showMnemonicBackupForm() {
    return this.currentIndexPage === 2;
  }

  get showMnemonicConfirmationForm() {
    return this.currentIndexPage === 3;
  }

  updateSelectedMnemonicElements(value: string[]) {
    this.syncedSelectedMnemonicElements = value;
  }
}
</script>

<style lang="scss" scoped>
.create-wallet {
  width: 100%;
}
</style>
