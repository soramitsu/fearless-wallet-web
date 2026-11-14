<template>
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
      :mnemonic="mnemonic"
      @update:mnemonicConfirmed="$emit('update:mnemonicConfirmed', $event)"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import MnemonicConfirmationForm from '@/screens/addWallet/MnemonicConfirmationForm.vue';
import MnemonicBackupForm from '@/screens/addWallet/MnemonicBackupForm.vue';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';
import { clearCopiedSecret, copySecretToClipboard } from '@/util/clipboardSecret';

export default defineComponent({ name: 'CreateWallet',
  components: {
    AdvancedButton,
    MnemonicBackupForm,
    MnemonicConfirmationForm,
  },
  emits: ['update:mnemonicConfirmed', 'toggleAdvancedFormVisible'],
  props: {
    step: Number,
    mnemonic: String,
    mnemonicLength: Number,
    isSubstrate: Boolean,
  },
  beforeUnmount() {
    void clearCopiedSecret();
  },
  computed: {
    mnemonicArray() {
      return this.mnemonic.split(' ');
    },
    showMnemonicBackupForm() {
      return this.step === 2;
    },
    showMnemonicConfirmationForm() {
      return this.step === 3;
    },
  },
  methods: {
    // Cleared again after a minute, when this screen closes, or when the wallet next opens.
    onCopy() {
      void copySecretToClipboard(this.mnemonic);
    },
    toggleAdvancedFormVisible() {
      this.$emit('toggleAdvancedFormVisible');
    },
  },
});
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
