<template>
  <SSlider
    v-model="vModel"
    class="slider"
    data-testid="slider"
    :step="props.stepsSize"
    :min="props.minValue"
    :max="props.maxValue"
    :disabled="props.disabled"
    :show-tooltip="props.showTooltip"
    @change="$emit('change', $event)"
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
  set: (value: boolean) => emit('updateValue', value),
});
</script>
