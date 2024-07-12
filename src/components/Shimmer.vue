<template>
  <div :class="shimmerClasses" :style="shimmerStyles"></div>
</template>

<script lang="ts" setup>
import { computed, withDefaults } from 'vue';

interface Props {
  type?: string;
  height?: string;
  width?: string;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'line',
  height: '10px',
  width: '10px',
});

const shimmerStyles = computed(() => {
  const styles: Record<string, string> = {};

  if (props.height) styles.height = props.height;

  if (props.width) styles.width = props.width;

  return styles;
});

const shimmerClasses = computed(() => {
  return ['shimmer', 'shimmer-animate', `shimmer-${props.type}`];
});
</script>

<style lang="scss">
.shimmer {
  background: #777;
}

.shimmer-line {
  border-radius: 25px;
}

.shimmer-circle {
  border-radius: 50%;
}

.shimmer-animate {
  @include shimmer-animate;
}
</style>
