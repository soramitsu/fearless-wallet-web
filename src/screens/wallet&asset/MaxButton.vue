<template>
  <div class="max-button" @click="$emit('click')">{{ $t('common.max') }}</div>
</template>

<style lang="scss" scoped>
.max-button {
  position: absolute;
  background-color: rgba(255, 255, 255, 0.03);
  border-radius: 20px;
  padding: 4px 7px;
  opacity: 0.9;
  color: $pink-lavender-color;
  z-index: 199;

  &:hover {
    cursor: pointer;
    opacity: 1;
  }
}
</style>
