<template>
  <div class="mnemonic-columns">
    <div>
      <div v-for="(mnemonicElement, index) in mnemonicOne" :key="index" class="mnemonic-element">
        <div class="mnemonic-number">
          {{ getNumberString(index + 1) }}
        </div>
        <div>
          {{ getMnemonicElement(mnemonicElement, index) }}
        </div>
      </div>
    </div>

    <div>
      <div v-for="(mnemonicElement, index) in mnemonicTwo" :key="index" class="mnemonic-element">
        <div class="mnemonic-number">
          {{ getNumberString(midpoint + index + 1) }}
        </div>
        <div>
          {{ getMnemonicElement(mnemonicElement, midpoint + index) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class MnemonicColumns extends Vue {
  @Prop(String) mnemonic!: string;
  @Prop(Array) selectedMnemonicElements!: string[];

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

  getMnemonicElement(mnemonicElement: string, index: number) {
    return !this.selectedMnemonicElements ? mnemonicElement : this.selectedMnemonicElements[index];
  }

  getNumberString(number: number) {
    return number.toString().padStart(2, '0');
  }
}
</script>

<style lang="scss" scoped>
.mnemonic-columns {
  display: flex;
  justify-content: space-evenly;
  font-size: 20px;

  .mnemonic-element {
    display: flex;
    font-family: Roboto Mono;
    line-height: 21px;
    margin: 9px 0;
    width: 110px;

    .mnemonic-number {
      margin-right: 16px;
      color: var(--pink-lavender-color);
    }
  }
}
</style>
