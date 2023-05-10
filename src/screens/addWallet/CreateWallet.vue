<template>
  <div class="create-wallet">
    <MnemonicBackupForm v-if="showMnemonicBackupForm" :mnemonicArray="mnemonicArray">
      <slot></slot>
    </MnemonicBackupForm>

    <MnemonicConfirmationForm
      v-if="showMnemonicConfirmationForm"
      :mnemonicMix="mnemonicMix"
      :selectedMnemonicElements="syncedSelectedMnemonicElements"
      @update:selectedMnemonicElements="updateSelectedMnemonicElements"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import MnemonicConfirmationForm from './MnemonicConfirmationForm.vue';
import MnemonicBackupForm from './MnemonicBackupForm.vue';
import type { MnemonicConfirmation } from '@/interfaces/common';

@Component({
  components: {
    MnemonicConfirmationForm,
    MnemonicBackupForm,
  },
})
export default class CreateWallet extends Vue {
  @Prop(Number) step!: number;
  @Prop(String) mnemonic!: string;
  @PropSync('selectedMnemonicElements', { type: Array }) syncedSelectedMnemonicElements!: MnemonicConfirmation[];

  get mnemonicArray() {
    return this.mnemonic.split(' ');
  }

  get mnemonicMix() {
    return [...this.mnemonicArray].sort(() => Math.random() - 0.5).map((word) => `${word} `);
  }

  get showMnemonicBackupForm() {
    return this.step === 2;
  }

  get showMnemonicConfirmationForm() {
    return this.step === 3;
  }

  updateSelectedMnemonicElements(value: MnemonicConfirmation[]) {
    this.syncedSelectedMnemonicElements = value;
  }
}
</script>

<style lang="scss" scoped>
.create-wallet {
  width: 100%;
}
</style>
