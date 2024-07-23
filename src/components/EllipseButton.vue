<template>
  <div data-testid="ellipseBtn" :class="classes" @click="$emit('click')">{{ $t(props.text) }}</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type Props = {
  text: string;
  disabled?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  text: '',
});

const classes = computed(() => {
  return [
    'ellipse-button',
    {
      'ellipse-disabled': props.disabled,
    },
  ];
});
</script>

<style lang="scss">
.ellipse-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  white-space: nowrap;
  height: 32px;
  gap: 4px;
  width: fit-content;
  color: $grayish-white-2;
  padding: 10px 15px;
  border-radius: 20px;
  background-color: $secondary-background-color;
  user-select: none;
  text-transform: uppercase;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background-color: $default-background-color;
  }
}

.ellipse-disabled {
  cursor: not-allowed;

  &:hover {
    background-color: $secondary-background-color;
  }
}
</style>
