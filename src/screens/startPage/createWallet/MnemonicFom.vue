<template>
  <div class="mnemonic-form">
    <template v-if="currentIndexPage === 1">
      <div class="info">Use non digital way to backup, such as writing it down on paper.</div>

      <div class="mnemonic-readonly">
        <div class="mnemonic-left">
          <div v-for="(mnemonicElement, index) in mnemonicOne" :key="index" class="mnemonic-element">
            <div class="mnemonic-number">
              {{ index + 1 }}
            </div>
            <div>
              {{ mnemonicElement }}
            </div>
          </div>
        </div>

        <div class="mnemonic-right">
          <div v-for="(mnemonicElement, index) in mnemonicTwo" :key="index" class="mnemonic-element">
            <div class="mnemonic-number">
              {{ midpoint + index + 1 }}
            </div>
            <div>
              {{ mnemonicElement }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="currentIndexPage === 2">
      <div class="mnemonics-block">
        <s-button
          v-for="(mnemonicElement, index) in selectedMnemonicElements"
          :key="index"
          class="mnemonic-button"
          type="primary"
          size="mini"
          border-radius="mini"
          @click="updateSelectedMnemonicElements(mnemonicElement, index, false)"
        >
          {{ mnemonicElement }}
        </s-button>
      </div>
      <div class="label">Choose words in the right order</div>
      <div class="mnemonics-block">
        <s-button
          v-for="(mnemonicElement, index) in unselectedMnemonicElements"
          :key="index"
          class="mnemonic-button"
          type="primary"
          size="mini"
          border-radius="mini"
          @click="updateSelectedMnemonicElements(mnemonicElement, index)"
        >
          {{ mnemonicElement }}
        </s-button>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class App extends Vue {
  @Prop(String) mnemonic!: string;
  @Prop(Array) selectedMnemonicElements!: string[];
  @Prop(Array) unselectedMnemonicElements!: string[];
  @Prop(Number) currentIndexPage!: number;

  get mnemonicArray() {
    return this.mnemonic.split(' ');
  }

  get mnemonicLength() {
    return this.mnemonicArray.length;
  }

  get midpoint() {
    return Math.ceil(this.mnemonicLength / 2);
  }

  get mnemonicOne() {
    return this.mnemonicArray.slice(0, this.midpoint);
  }

  get mnemonicTwo() {
    return this.mnemonicArray.slice(this.midpoint, this.mnemonicLength);
  }

  updateSelectedMnemonicElements(element: string, index: number, added = true) {
    this.$emit('updateSelectedMnemonicElements', element, index, added);
  }
}
</script>

<style lang="scss" scoped>
.mnemonic-form {
  .info {
    text-align: left;
    font-size: 12px;
    margin-left: 5px;
  }

  .mnemonic-readonly {
    display: flex;
    justify-content: space-evenly;
    padding: 20px 0;

    .mnemonic-element {
      display: flex;

      .mnemonic-number {
        margin-right: 10px;
        color: #888888;
      }
    }
  }

  .label {
    margin: 10px 0;
  }

  .mnemonics-block {
    min-height: 140px;
    background-color: #181818;
    padding: 10px;

    .mnemonic-button {
      margin: 3px;
    }
  }
}
</style>
