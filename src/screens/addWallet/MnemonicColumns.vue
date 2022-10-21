<template>
  <div class="mnemonic-columns">
    <div>
      <div v-for="(mnemonicElement, index) in mnemonicOne" :key="index" class="mnemonic-element">
        <div class="mnemonic-number">
          {{ getNumberString(index + 1) }}
        </div>
        <div>
          {{ mnemonicElement }}
        </div>
      </div>
    </div>

    <div>
      <div v-for="(mnemonicElement, index) in mnemonicTwo" :key="index" class="mnemonic-element">
        <div class="mnemonic-number">
          {{ getNumberString(midpoint + index + 1) }}
        </div>
        <div>
          {{ mnemonicElement }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class MnemonicColumns extends Vue {
  @Prop(Array) mnemonicArray!: string[];
  @Prop({ default: 12 }) mnemonicLength!: number;

  get midpoint() {
    return Math.ceil(this.mnemonicLength / 2);
  }

  get mnemonicArrayValidLength() {
    const array = [...this.mnemonicArray];

    array.length = this.mnemonicLength;

    return array.fill('', this.mnemonicArray.length, this.mnemonicLength);
  }

  get mnemonicOne() {
    return this.mnemonicArrayValidLength.slice(0, this.midpoint);
  }

  get mnemonicTwo() {
    return this.mnemonicArrayValidLength.slice(this.midpoint, this.mnemonicLength);
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
      color: $pink-lavender-color;
    }
  }
}
</style>
