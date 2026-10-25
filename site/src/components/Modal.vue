<script setup lang="ts">
const { open, opacity, zIndex } = defineProps<{ open: boolean, opacity?: number, zIndex?: number }>()
defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>

  <div class=" overlay" :class="{ open }" :style="`--opacity: ${opacity || '0.75'}; z-index: ${zIndex || '666'}`"
    @click="$emit('close')" />
  <section class="modal p-3xs" :class="{ open }" :style="`z-index: ${zIndex || '666'}`">
    <slot />
  </section>
</template>

<style scoped>
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  display: grid;
  align-items: center;
  overflow-y: auto;
  transition: opacity 0.3s ease, visibility 0.3s ease, transform 0.3s ease;
  opacity: 0;
  visibility: hidden;
  transform: scale(0.9);
}

.open.modal {
  opacity: 1;
  visibility: visible;
  transform: scale(1);
}

.modal>* {
  pointer-events: all;
}

.overlay {
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease, visibility 0.3s ease;
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: black;
  cursor: pointer;
  pointer-events: all;
}

.open.overlay {
  opacity: var(--opacity);
  visibility: visible;
}
</style>