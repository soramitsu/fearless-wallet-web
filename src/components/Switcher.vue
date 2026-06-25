<template>
  <label class="switch" data-testid="switch">
    <input v-model="vModel" class="switch__input" type="checkbox" :disabled="disabled" />
    <span class="switch__core"></span>
    <span v-if="activeText || inactiveText" class="switch__text">{{ vModel ? activeText : inactiveText }}</span>
  </label>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

interface Props {
  value: boolean;
  activeText?: string;
  inactiveText?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  value: false,
  activeText: '',
  inactiveText: '',
  disabled: false,
});

const emit = defineEmits(['change']);

const vModel = computed({
  get: () => props.value,
  set: (value: boolean) => emit('change', value),
});

const activeText = computed(() => props.activeText);
const inactiveText = computed(() => props.inactiveText);
const disabled = computed(() => props.disabled);
</script>

<style lang="scss">
.switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.switch__input {
  display: none;
}

.switch__core {
  display: inline-block;
  width: 40px;
  height: 20px;
  border-radius: 20px;
  position: relative;
  background-color: #422539 !important;
  border: 1px solid $default-background-color !important;

  &::after {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    top: 1px;
    left: 1px;
    border-radius: 50%;
    background: $plain-white;
    transition: transform 0.15s ease;
  }
}

.switch__input:checked + .switch__core {
  background-color: #7700ee !important;
  border: 1px solid $default-background-color !important;

  &::after {
    transform: translateX(20px);
  }
}
</style>
