<template>
  <input
    v-model="vModel"
    type="range"
    class="slider"
    data-testid="slider"
    :step="props.stepsSize"
    :min="props.minValue"
    :max="props.maxValue"
    :disabled="props.disabled"
    @change="$emit('change', Number(($event.target as HTMLInputElement).value))"
  />
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type Props = {
  value: number;
  disabled?: boolean;
  showTooltip?: boolean;
  minValue?: number;
  maxValue?: number;
  stepsSize?: number;
};

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  showTooltip: false,
  minValue: 0,
  maxValue: 100,
  stepsSize: 1,
});

const emit = defineEmits(['updateValue', 'change']);

const vModel = computed({
  get: () => props.value,
  set: (value: number | string) => emit('updateValue', Number(value)),
});
</script>

<style lang="scss">
.slider {
  width: 100%;
}

.el-slider__runway {
  background-color: $default-background-color !important;
}
</style>
