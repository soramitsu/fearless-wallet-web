<template>
  <div class="mnemonic-columns">
    <div v-for="(column, index1) in columns" :key="index1">
      <div v-for="(mnemonicElement, index2) in column" :key="index2" class="mnemonic-element">
        <div class="mnemonic-number">
          {{ getNumberString(index1 + 1, index2 + 1) }}
        </div>

        <div data-testid="mnemonicElement">
          {{ mnemonicElement }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';


const COLUMN_ELEMENTS = {
  24: 8,
  12: 6,
};

export default defineComponent({ name: 'MnemonicColumns' ,
  props: {
    mnemonicArray: Array,
    mnemonicLength: { default: 12 },
  },
  computed: {
    columnElements() {
      return COLUMN_ELEMENTS[this.mnemonicLength];
    },
    columns() {
      const columns = this.mnemonicLength / this.columnElements;

          return new Array(columns).fill('').map((item, index) => {
            const startIndex = index * this.columnElements;

            return this.mnemonicArrayValidLength.slice(startIndex, startIndex + this.columnElements);
          });
    },
    mnemonicArrayValidLength() {
      const array = [...this.mnemonicArray];

          array.length = this.mnemonicLength;

          return array.fill('', this.mnemonicArray.length, this.mnemonicLength);
    },
    columnOne() {
      return this.mnemonicArrayValidLength.slice(0, this.columnElements);
    },
    columnTwo() {
      return this.mnemonicArrayValidLength.slice(this.columnElements, this.columnElements * 2);
    },
    columnTree() {
      if (this.mnemonicLength === 12) return [];

          return this.mnemonicArrayValidLength.slice(this.columnElements * 2, this.columnElements * 3);
    },
  },
  methods: {
    getNumberString(number1: number, number2: number) {
      const baseValue = number1 * number2;

          return baseValue.toString().padStart(2, '0');
    },
  },
});
</script>

<style lang="scss" scoped>
@font-face {
  font-family: 'Roboto mono';
  src: local('Roboto mono'), url('@/assets/fonts/RobotoMono-Regular.ttf') format('truetype');
}

.mnemonic-columns {
  display: flex;
  justify-content: space-evenly;
  font-size: 1em;
  font-family: 'Roboto mono', sans-serif;
  font-weight: 400;

  .mnemonic-element {
    display: flex;
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
