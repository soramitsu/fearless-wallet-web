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
import { defineComponent } from 'vue';

import type { MnemonicConfirmation } from '@/interfaces/common';
import MnemonicConfirmationForm from '@/screens/addWallet/MnemonicConfirmationForm.vue';
import MnemonicBackupForm from '@/screens/addWallet/MnemonicBackupForm.vue';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';
import { setClipboard } from '@/helpers';

export default defineComponent({ name: 'CreateWallet',
  components: {
    AdvancedButton,
    MnemonicBackupForm,
    MnemonicConfirmationForm,
  },
  props: {
    step: Number,
    mnemonic: String,
    mnemonicLength: Number,
    isSubstrate: Boolean,
    selectedMnemonicElements: { type: Array },
  },
  computed: {
    mnemonicArray() {
      return this.mnemonic.split(' ');
    },
    mnemonicMix() {
      return [...this.mnemonicArray].sort(() => Math.random() - 0.5).map((word) => `${word} `);
    },
    showMnemonicBackupForm() {
      return this.step === 2;
    },
    showMnemonicConfirmationForm() {
      return this.step === 3;
    },
    syncedSelectedMnemonicElements: {
      get() {
        return this.selectedMnemonicElements;
      },
      set(value) {
        this.$emit('update:selectedMnemonicElements', value);
      },
    },
  },
  methods: {
    updateSelectedMnemonicElements(value: MnemonicConfirmation[]) {
      this.syncedSelectedMnemonicElements = value;
    },
    onCopy() {
      setClipboard(this.mnemonic);
    },
    toggleAdvancedFormVisible() {
      this.$emit('toggleAdvancedFormVisible');
    },
  },
});
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
