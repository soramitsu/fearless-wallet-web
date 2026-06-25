<template>
  <label class="fw-checkbox" data-testid="checkbox">
    <input v-model.lazy="vmodel" type="checkbox" :class="`fw-checkbox__input fw-checkbox__input--${size}`" />
    <span class="fw-checkbox__box"></span>
    <span class="fw-checkbox__label">{{ label }}</span>
  </label>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type Props = {
  label: string;
  value: boolean;
  size?: 'medium' | 'big';
};

const props = withDefaults(defineProps<Props>(), { size: 'medium' });
const emit = defineEmits(['change']);

const vmodel = computed({
  get: () => props.value,
  set: (value: boolean) => emit('change', value),
});
</script>

<style lang="scss">
.fw-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: $default-white !important;
  cursor: pointer;
}

.fw-checkbox__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.fw-checkbox__box {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background-color: $default-background-color;
  border: 1px solid transparent;
}

.fw-checkbox__input:focus + .fw-checkbox__box,
.fw-checkbox:hover .fw-checkbox__box {
  border-color: $purple-color;
}

.fw-checkbox__input:checked + .fw-checkbox__box {
  background-color: $purple-color;
  border-color: $purple-color;
}

.fw-checkbox__label {
  color: $default-white !important;
}
</style>
