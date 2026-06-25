<template>
  <div class="mnemonic-confirmation-form">
    <div class="warning">
      {{ $t('addWallet.securityWritten') }}
    </div>

    <MnemonicColumns :mnemonicArray="selectedMnemonicArray" :mnemonicLength="mnemonicLength" />

    <div class="hint">{{ $t('addWallet.selectPassphraseWords') }}</div>

    <div class="words">
      <BorderButton
        v-for="(mnemonicElement, index) in mnemonicMix"
        size="small"
        fontSize="small"
        borderRadius="mini"
        :key="index"
        :text="mnemonicElement"
        :class="addButtonClasses(mnemonicElement, index)"
        data-testid="wordBtn"
        @click="updateSelectedMnemonicElements(mnemonicElement, index)"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import MnemonicColumns from './MnemonicColumns.vue';

export default defineComponent({ name: 'MnemonicConfirmationForm',
  components: {
    MnemonicColumns,
  },
  props: {
    mnemonicMix: Array,
    mnemonicLength: Number,
    selectedMnemonicElements: { type: Array },
  },
  computed: {
    selectedMnemonicArray() {
      return this.syncedSelectedMnemonicElements.map(({ word }) => word);
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
    addButtonClasses(word: string, index: number) {
      const findIndex = this.syncedSelectedMnemonicElements.findIndex(
            ({ word: _word, initialIndex }) => _word === word && initialIndex === index
          );

          return [
            'button-mnemonic',
            {
              'inactive-button': findIndex !== -1,
            },
          ];
    },
    updateSelectedMnemonicElements(word: string, index: number) {
      const findIndex = this.syncedSelectedMnemonicElements.findIndex(
            ({ word: _word, initialIndex }) => _word === word && initialIndex === index
          );

          if (findIndex !== -1) return;

          this.syncedSelectedMnemonicElements.push({ word, initialIndex: index });
    },
  },
});
</script>

<style lang="scss" scoped>
.mnemonic-confirmation-form {
  .hint {
    margin: 7px 0;
  }

  .words {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .warning {
    height: 48px;
    line-height: 170%;
  }

  .button-mnemonic {
    margin: 4px 4px 4px 0;
    flex: 1 1 60px;

    span {
      font-weight: 400;
    }
  }

  .inactive-button {
    opacity: 0.2;
  }
}
</style>
