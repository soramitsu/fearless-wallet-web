<template>
  <Icon icon="loading" className="spinner" />
</template>

<script lang="ts" setup>
const props = withDefaults(defineProps<{ width?: number }>(), { width: 21 });

const prepSize = `${props.width}px`;
</script>

<style lang="scss" scoped>
.spinner {
  animation: spin-animation 1.5s infinite;
  display: inline-block;
  width: v-bind(prepSize);
  height: v-bind(prepSize);
}

@keyframes spin-animation {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
