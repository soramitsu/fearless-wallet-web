<template>
  <div :class="classes">
    <slot></slot>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class Rotate extends Vue {
  @Prop(Boolean) isActive!: boolean;

  get classes() {
    return [
      {
        rotate: this.isActive,
      },
    ];
  }
}
</script>

<style lang="scss" scoped>
.rotate {
  transform: rotate(180deg);
  animation: rotate 0.3s;
}

@keyframes rotate {
  0% {
    transform: rotate(0deg);
  }
  10% {
    transform: rotate(18deg);
  }
  20% {
    transform: rotate(36deg);
  }
  30% {
    transform: rotate(54deg);
  }
  40% {
    transform: rotate(72deg);
  }
  50% {
    transform: rotate(90deg);
  }
  60% {
    transform: rotate(108deg);
  }
  70% {
    transform: rotate(126deg);
  }
  80% {
    transform: rotate(144deg);
  }
  90% {
    transform: rotate(162deg);
  }
  100% {
    transform: rotate(180deg);
  }
}
</style>
