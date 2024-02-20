<template>
  <FCorners size="big">
    <div class="info">
      <dl class="info__list">
        <slot></slot>
      </dl>
    </div>
  </FCorners>
</template>

<script lang="ts" setup></script>

<style lang="scss" scoped>
.info {
  position: relative;
  display: flex;
  flex-flow: column;
  background: $secondary-background-color;
  padding: 16px;
  border: 1px solid $default-background-color !important;
  border-radius: $default-border-radius;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  width: 100%;

  &__list {
    display: grid;
    grid-template-columns: 100px 1fr;
    place-items: start;
    gap: 8px;
  }
}
</style>
