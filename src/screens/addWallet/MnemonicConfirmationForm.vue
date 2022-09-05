<template>
  <div class="mnemonic-confirmation-form">
    <div class="warning">A security measure to make sure you have written it down</div>

    <MnemonicColumns :mnemonic="mnemonic" :selectedMnemonicElements="selectedMnemonicElements" />

    <div class="hint">Select words in the right order:</div>

    <div class="words">
      <BorderButton
        v-for="(mnemonicElement, index) in mnemonicMix"
        :key="index"
        size="small"
        fontSize="small"
        borderRadius="mini"
        :text="mnemonicElement"
        :class="addButtonClasses(mnemonicElement, index)"
        @click="updateSelectedMnemonicElements(mnemonicElement, index)"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import MnemonicColumns from './MnemonicColumns.vue';
import type { MnemonicConfirmation } from '@/interfaces/common';
import BorderButton from '@/components/BorderButton.vue';

@Component({
  components: {
    MnemonicColumns,
    BorderButton,
  },
})
export default class MnemonicConfirmationForm extends Vue {
  @Prop(String) mnemonic!: string;
  @PropSync('selectedMnemonicElements', { type: Array }) syncedSelectedMnemonicElements!: MnemonicConfirmation[];

  get mnemonicMix() {
    return this.mnemonic.split(' ').sort(() => Math.random() - 0.5);
  }

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
  }

  updateSelectedMnemonicElements(word: string, index: number) {
    const findIndex = this.syncedSelectedMnemonicElements.findIndex(
      ({ word: _word, initialIndex }) => _word === word && initialIndex === index
    );

    if (findIndex !== -1) return;

    this.syncedSelectedMnemonicElements.push({ word, initialIndex: index });
  }
}
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
