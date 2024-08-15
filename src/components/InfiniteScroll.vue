<template>
  <div class="scroll" ref="containerRef">
    <slot></slot>
  </div>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { useInfiniteScroll } from '@vueuse/core';

const containerRef = ref<HTMLElement | null>(null);
const emit = defineEmits(['onScroll', 'canLoadMore']);
const props = defineProps<{ canLoadMore: boolean }>();

const onScroll = () => emit('onScroll');

useInfiniteScroll(containerRef, onScroll, { distance: 10, canLoadMore: () => props.canLoadMore });
</script>

<style lang="scss" scoped>
.scroll {
  overflow-y: auto;
  overflow-x: hidden;
  height: 100%;
  width: 100%;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.25);
    border-radius: $default-border-radius;

    &:hover {
      background-color: rgba(255, 255, 255, 0.15);
    }
  }
}
</style>
