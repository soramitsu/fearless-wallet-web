<template>
  <div class="scroll">
    <slot></slot>
  </div>
</template>

<style lang="scss" scoped>
.scroll {
  overflow-y: scroll;
  width: 100%;
  height: 100%;

  ::-webkit-scrollbar {
    width: 6px;
  }

  ::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.25);
    border-radius: var(--default-border-radius);

    &:hover {
      background-color: rgba(255, 255, 255, 0.15);
    }
  }
}
</style>
