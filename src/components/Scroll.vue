<template functional>
  <div class="scroll">
    <slot></slot>
  </div>
</template>

<style lang="scss" scoped>
.scroll {
  overflow-y: auto;
  overflow-x: hidden;
  height: 100%;
  scrollbar-color: rgba(255, 255, 255, 0.25) transparent;

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
