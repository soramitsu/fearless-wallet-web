<template>
  <div class="mnemonic-confirmation-form">
    <div class="warning">A security measure to make sure you have written it down</div>

    <MnemonicColumns :mnemonic="mnemonic" :selectedMnemonicElements="selectedMnemonicElements" />

    <div class="hint">Select words in the right order:</div>
    <div>
      <s-button
        v-for="(mnemonicElement, index) in mnemonicMix"
        :key="index"
        :class="addButtonClasses(mnemonicElement)"
        type="primary"
        size="small"
        border-radius="mini"
        @click="updateSelectedMnemonicElements(mnemonicElement, index)"
      >
        <span>
          {{ mnemonicElement }}
        </span>
      </s-button>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import MnemonicColumns from './MnemonicColumns.vue';

@Component({
  components: {
    MnemonicColumns,
  },
})
export default class extends Vue {
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
  .hint {
    margin: 20px 0 26px;
  }

  .warning {
    height: 48px;
    line-height: 170%;
    margin-bottom: 10px;
  }

  .button {
    font-size: 13px;
    margin: 4px 3px;
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px) !important;

    span {
      font-weight: 400;
    }
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

  // reset default 'focusing', 's-pressed' classes
  .s-pressed[class~='unselected-button'],
  .focusing[class~='unselected-button'] {
    background-color: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
  }
}
</style>
