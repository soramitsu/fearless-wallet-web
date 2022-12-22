<template>
  <Icon icon="loading" :style="style" className="spinner" />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class Loading extends Vue {
  @Prop({ type: Number, default: 21 }) width!: number;

  get style() {
    return `width:${this.width}; height: ${this.width}`;
  }
}
</script>

<style lang="scss" scoped>
.spinner {
  animation: spin-animation 1.5s infinite;
  display: inline-block;
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
