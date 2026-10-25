<template>
  <label class="switch" data-testid="switch">
    <input
      :checked="value"
      class="switch__input"
      type="checkbox"
      role="switch"
      :aria-checked="value"
      :aria-label="ariaLabel || undefined"
      :disabled="disabled"
      @change="change"
    />
    <span class="switch__core" aria-hidden="true"></span>
    <span v-if="activeText || inactiveText" class="switch__text">{{ value ? activeText : inactiveText }}</span>
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

function change(event: Event) {
  const input = event.target as HTMLInputElement;
  const desired = input.checked;
  // Native activation changes checked before this event. Keep the displayed state controlled by the owner.
  input.checked = props.value;
  if (!props.disabled) emit('change', desired);
}

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
  min-height: 48px;
  cursor: pointer;
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
  background-color: $fw-field-sunken !important;
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
  background-color: $fw-toggle-fill !important;
  // The edge lifts the on track to 3:1 over glass (design-system 3.4).
  border: 1px solid palette($default-background-color, var(--fw-accent-edge)) !important;

  &::after {
    transform: translateX(20px);
  }
}
@include v1-palette {
  .switch__core {
    box-sizing: border-box;
    flex-shrink: 0;
    width: 52px;
    height: 32px;
    &::after {
      content: '−';
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      top: 3px;
      left: 3px;
      background: var(--fw-thumb-off);
      color: var(--fw-sunken);
      font: 700 16px/1 var(--fw-font-body);
    }
  }
  .switch__input:checked + .switch__core::after {
    content: '✓';
    transform: translateX(20px);
    background: white;
    color: var(--fw-fill-bottom);
  }
  .switch:has(:disabled) {
    cursor: default;
  }
  .switch__input:disabled + .switch__core {
    opacity: 0.65;
  }
}
</style>
