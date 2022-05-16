<template>
  <div class="mnemonic-confirmation-form">
    <div class="warning">A security measure to make sure you have written it down</div>

    <MnemonicColumns :mnemonic="mnemonic" :selectedMnemonicElements="selectedMnemonicElements" />

    <div class="hint">Select words in the right order:</div>
    <div class="words">
      <BorderButton
        v-for="(mnemonicElement, index) in mnemonicMix"
        :key="index"
        type="secondary"
        size="small"
        borderRadius="mini"
        :text="mnemonicElement"
        :class="addButtonClasses(mnemonicElement)"
        @click="updateSelectedMnemonicElements(mnemonicElement, index)"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import BorderButton from '@/components/BorderButton.vue';
import MnemonicColumns from './MnemonicColumns.vue';

@Component({
  components: {
    MnemonicColumns,
    BorderButton,
  },
})
export default class MnemonicConfirmationForm extends Vue {
  @Prop(String) mnemonic!: string;
  @Prop(Array) selectedMnemonicElements!: string[];

  get mnemonicArray() {
    return this.mnemonic.split(' ');
  }

  get mnemonicMix() {
    return this.mnemonicArray;
  }

  addButtonClasses(word: string) {
    return [
      'button-mnemonic',
      {
        'inactive-button': this.selectedMnemonicElements.includes(word),
      },
    ];
  }

  updateSelectedMnemonicElements(element: string, index: number, added = true) {
    if (this.selectedMnemonicElements.includes(element) && added) return;

    this.$emit('updateSelectedMnemonicElements', element, index, added);
  }
}
</script>

<style lang="scss" scoped>
.mnemonic-confirmation-form {
  .hint {
    margin: 20px 0 26px;
  }

  .words {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .warning {
    height: 48px;
    line-height: 170%;
    margin-bottom: 10px;
  }

  .button-mnemonic {
    margin: 4px 8px 4px 0;
    flex: 1 1 70px;

    span {
      font-weight: 400;
    }
  }

  .inactive-button {
    opacity: 0.2;
  }
}
</style>
