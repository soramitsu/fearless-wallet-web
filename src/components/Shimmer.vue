<template>
  <div :class="shimmerClasses" :style="shimmerStyles"></div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class Shimmer extends Vue {
  @Prop({ default: 'line' }) type!: boolean;
  @Prop({ default: '10px' }) height!: string;
  @Prop({ default: '10px' }) width!: string;

  get shimmerStyles() {
    const styles: Record<string, string> = {};

    if (this.height) styles.height = this.height;

    if (this.width) styles.width = this.width;

    return styles;
  }

  get shimmerClasses() {
    return ['shimmer-animate', `shimmer-${this.type}`];
  }
}
</script>

<style lang="scss">
.shimmer-line {
  background: #777;
  border-radius: 25px;
}

.shimmer-circle {
  background: #777;
  border-radius: 50%;
  height: 65px;
  width: 65px;
}

.shimmer-animate {
  @include shimmer-animate;
}
</style>
