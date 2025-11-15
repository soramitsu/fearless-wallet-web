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

<script lang="ts" setup>
import { computed } from 'vue';

const COLUMN_ELEMENTS = {
  24: 8,
  12: 6,
};

const props = withDefaults(
  defineProps<{
    mnemonicArray: string[];
    mnemonicLength?: keyof typeof COLUMN_ELEMENTS;
  }>(),
  {
    mnemonicLength: '12',
  }
);

const mnemonicLengthNumber = computed(() => Number(props.mnemonicLength));
const columnElements = computed(() => COLUMN_ELEMENTS[props.mnemonicLength]);

const mnemonicArrayValidLength = computed(() => {
  const array = [...props.mnemonicArray];

  array.length = mnemonicLengthNumber.value;

  return array.fill('', props.mnemonicArray.length, mnemonicLengthNumber.value);
});

const columns = computed(() => {
  const elementsPerColumn = columnElements.value;
  if (!elementsPerColumn) return [];
  const count = mnemonicLengthNumber.value / elementsPerColumn;

  return Array.from({ length: count }, (_, index) => {
    const startIndex = index * elementsPerColumn;

    return mnemonicArrayValidLength.value.slice(startIndex, startIndex + elementsPerColumn);
  });
});

const getNumberString = (number1: number, number2: number) => {
  const baseValue = number1 * number2;

  return baseValue.toString().padStart(2, '0');
};
</script>

<style lang="scss" scoped>
.mnemonic-columns {
  display: flex;
  justify-content: space-evenly;
  font-size: 1em;
  font-family: 'Sora', 'SFMono-Regular', 'Consolas', 'Liberation Mono', monospace;
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
