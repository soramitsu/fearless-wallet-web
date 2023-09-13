<template>
  <svg :class="getSvgClasses" aria-hidden="true">
    <use :xlink:href="getIconName" :style="styles" :class="getUseClasses" v-on="$listeners" />
  </svg>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type Props = {
  icon: string;
  iconColor?: string;
  className?: string[] | string;
  width?: string;
  height?: string;
};

const props = withDefaults(defineProps<Props>(), { width: '32px', height: '32px', className: '' });

const getIconColor = computed(() => `icon--${props.iconColor}`);
const getUseClasses = computed(() => ['icon__inner', props.icon]);
const getIconName = computed(() => `#icon-${props.icon}`);
const styles = computed(() => `width:${props.width}; height:${props.height};`);

const getSvgClasses = computed(() => {
  const classes = ['svg-icon', ...[props.className].flat()];

  if (props.iconColor) classes.push(getIconColor.value);

  return classes;
});
</script>

<style lang="scss" scoped>
.svg-icon {
  vertical-align: -0.15em;
  fill: currentColor;
  overflow: hidden;
  outline: none;
}

.svg-icon:hover {
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

.icon--default {
  color: #ffffff;
}
</style>
