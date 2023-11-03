<template>
  <svg :class="getSvgClasses" aria-hidden="true" @click="click">
    <use :xlink:href="getIconName" :style="styles" :class="getUseClasses" @click="click" />
  </svg>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type Props = {
  icon: string;
  iconColor?: string;
  className?: string[] | string;
  isHoverable?: boolean;
  width?: string;
  height?: string;
};

const props = withDefaults(defineProps<Props>(), { width: '32px', height: '32px', className: '' });
const emit = defineEmits(['click']);

const getIconColor = computed(() => `icon--${props.iconColor}`);
const getUseClasses = computed(() => ['icon__inner', props.icon]);
const getIconName = computed(() => `#icon-${props.icon}`);
const styles = computed(() => `width:${props.width}; height:${props.height};`);

const getSvgClasses = computed(() => {
  const prepClasses = Array.isArray(props.className) ? props.className.flat() : [props.className];

  const classes = [...prepClasses];

  if (props.isHoverable) classes.push('svg-icon--hover');

  if (props.iconColor) classes.push(getIconColor.value);

  return classes;
});

let clickLock = false;

const click = () => {
  if (clickLock) return;

  clickLock = true;

  emit('click');

  // setTimeout нужен чтобы предотвратить всплытие при клике
  // чтобы он вызывался только 1 раз
  setTimeout(() => (clickLock = false), 0);
};
</script>

<style lang="scss" scoped>
.svg-icon {
  vertical-align: -0.15em;
  fill: currentColor;
  overflow: hidden;
  outline: none;
}

.svg-icon--hover:hover {
  opacity: 0.5;
}

.icon__inner {
  outline: none;
}

.icon--success {
  color: $success-color;
}
.icon--error {
  color: $reject-color;
}

.icon--purple {
  color: #7700ee;
}

.icon--purple:hover {
  color: #7700ee50;
}

.icon--purple {
  color: #7700ee;
}

.icon--purple:hover {
  color: #7700ee50;
}

.icon--default {
  color: #ffffff;
}
</style>
