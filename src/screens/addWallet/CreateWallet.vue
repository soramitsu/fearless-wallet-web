<template>
  <Scroll>
    <div class="create-wallet">
      <MnemonicBackupForm v-if="showMnemonicBackupForm" :mnemonicArray="mnemonicArray" :mnemonicLength="mnemonicLength">
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

        <AdvancedButton v-if="isSubstrate" @click="toggleAdvancedFormVisible" />

        <Tooltip text="common.copied" target=".copy__phrase" trigger="click" :arrow="true" />
      </MnemonicBackupForm>

      <MnemonicConfirmationForm
        v-if="showMnemonicConfirmationForm"
        :mnemonicMix="mnemonicMix"
        :mnemonicLength="mnemonicLength"
        :selectedMnemonicElements="syncedSelectedMnemonicElements"
        @update:selectedMnemonicElements="updateSelectedMnemonicElements"
      />
    </div>
  </Scroll>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import type { MnemonicConfirmation } from '@/interfaces/common';
import type { WordCount } from '@extension-base/services';
import MnemonicConfirmationForm from '@/screens/addWallet/MnemonicConfirmationForm.vue';
import MnemonicBackupForm from '@/screens/addWallet/MnemonicBackupForm.vue';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';
import { setClipboard } from '@/helpers';

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
  @Prop(Number) mnemonicLength!: WordCount;
  @Prop(Boolean) isSubstrate!: boolean;
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
    setClipboard(this.mnemonic);
  }

  toggleAdvancedFormVisible() {
    this.$emit('toggleAdvancedFormVisible');
  }
}
</script>

<style lang="scss" scoped>
@media (max-height: 600px) {
  .create-wallet {
    height: 315px;
  }
}

.create-wallet {
  width: 100%;
}

.copy__phrase {
  text-decoration: underline;
  cursor: pointer;
  margin: 0 auto;
}
</style>
