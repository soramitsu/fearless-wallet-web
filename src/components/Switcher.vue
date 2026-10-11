<template>
  <label class="switch" data-testid="switch">
    <input
      v-model="vModel"
      class="switch__input"
      type="checkbox"
      role="switch"
      :aria-label="ariaLabel || undefined"
      :disabled="disabled"
    />
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
  /** Names the switch for screen readers when no visible text sits next to it. */
  ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  value: false,
  activeText: '',
  inactiveText: '',
  disabled: false,
  ariaLabel: '',
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
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

// Hidden visually only: the checkbox stays focusable and is what keyboards and screen readers operate.
.switch__input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.switch__core {
  display: inline-block;
  width: 40px;
  height: 20px;
  border-radius: 20px;
  position: relative;
  background-color: palette(#422539, var(--fw-sunken)) !important;
  border: 1px solid palette($default-background-color, var(--fw-stroke-control)) !important;

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

.switch__input:focus-visible + .switch__core {
  outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
  outline-offset: 2px;
}

.switch__input:checked + .switch__core {
  background-color: palette(#7700ee, var(--fw-fill-top)) !important;
  // The edge lifts the on track to 3:1 over glass (design-system 3.4).
  border: 1px solid palette($default-background-color, var(--fw-accent-edge)) !important;

  &::after {
    transform: translateX(20px);
  }
}
</style>
