<template>
  <div>
    <div class="bar full" :style="fullBarStyle"></div>
    <div :class="classesProgress" :style="progressStyle"></div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

interface Props {
  width?: string;
  fillFactor: number;
}

const props = withDefaults(defineProps<Props>(), {
  width: '365px',
  fillFactor: 0,
});

const fullBarStyle = computed(() => `width:${props.width}`);

const progressStyle = computed(() => {
  const width = `${props.fillFactor * 100}%`;

  return `width:${width}`;
});

const classesProgress = computed(() => [
  'bar',
  'progress',
  {
    'progress-100': props.fillFactor === 1,
  },
]);
</script>

<style lang="scss" scoped>
.bar {
  border-radius: 16px;
  height: 5px;
}

.full {
  background-color: $default-white;
}

.progress {
  background-color: $pink-color;
  position: relative;
  top: -5px;
}

.progress-100 {
  background-color: $success-color;
}
</style>
