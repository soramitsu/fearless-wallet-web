<template>
  <div class="mnemonic-confirmation-form">
    <div class="header">Confirm mnemonic</div>
    <div class="mnemonic-block">
      <s-button
        v-for="(mnemonicElement, index) in selectedMnemonicElements"
        :key="index"
        class="button selected-button"
        type="primary"
        size="mini"
        border-radius="mini"
        @click="updateSelectedMnemonicElements(mnemonicElement, index, false)"
      >
        {{ mnemonicElement }}
      </s-button>
    </div>
    <div class="hint">Choose words in the right order</div>
    <div>
      <s-button
        v-for="(mnemonicElement, index) in mnemonicMix"
        :key="index"
        :class="addButtonClasses(mnemonicElement)"
        type="primary"
        size="mini"
        border-radius="mini"
        @click="updateSelectedMnemonicElements(mnemonicElement, index)"
      >
        {{ mnemonicElement }}
      </s-button>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class extends Vue {
  @Prop(String) mnemonic!: string;
  @Prop(Array) selectedMnemonicElements!: string[];

  get mnemonicArray() {
    return this.mnemonic.split(' ');
  }

  get mnemonicMix() {
    return this.mnemonicArray.sort(() => Math.random() - 0.5);
  }

  addButtonClasses(word: string) {
    return [
      'button',
      'unselected-button',
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
  .header {
    margin: 5px 0 20px;
    font-size: 20px;
    font-weight: 600;
  }

  .hint {
    margin: 20px 0;
  }

  .mnemonic-block {
    min-height: 170px;
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
    padding: 10px;
    width: 100%;
  }

  .button {
    font-size: 12px;
    margin: 3px;
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px) !important;
  }

  .unselected-button {
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);

    &:hover {
      background-color: rgba(255, 255, 255, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
  }

  .inactive-button {
    opacity: 0.2;
  }

  .selected-button {
    background-color: rgba(119, 0, 238, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.1);

    &:hover {
      background-color: rgba(119, 0, 238, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
  }

  // reset default 'focusing', 's-pressed' classes
  .s-pressed[class~='unselected-button'],
  .focusing[class~='unselected-button'] {
    background-color: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
  }

  // reset default 'focusing', 's-pressed' classes
  .s-pressed[class~='selected-button'],
  .focusing[class~='selected-button'] {
    background-color: rgba(119, 0, 238, 0.25) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
  }
}
</style>
