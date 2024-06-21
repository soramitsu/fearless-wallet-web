<template>
  <div class="create-wallet">
    <MnemonicBackupForm v-if="showMnemonicBackupForm" :mnemonicArray="mnemonicArray">
      <BorderButton
        class="copy__phrase"
        size="small"
        fontSize="small"
        borderRadius="small"
        width="186px"
        type="secondary"
        text="common.copyToClipboard"
        @click="onCopy"
      />

      <AdvancedButton @click="toggleAdvancedFormVisible" />

      <slot></slot>

      <Tooltip text="common.copied" target=".copy__phrase" trigger="click" :arrow="true" />
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
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';

@Component({
  components: {
    AdvancedButton,
    MnemonicBackupForm,
    MnemonicConfirmationForm,
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

  onCopy() {
    navigator.clipboard.writeText(this.mnemonic);
  }

  toggleAdvancedFormVisible() {
    this.$emit('toggleAdvancedFormVisible');
  }
}
</script>

<style lang="scss" scoped>
.create-wallet {
  width: 100%;
}
.copy__phrase {
  text-decoration: underline;
  cursor: pointer;
  margin: 0 auto;
}
</style>
