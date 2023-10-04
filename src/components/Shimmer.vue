<template>
  <div :class="shimmerClasses" :style="shimmerStyles"></div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class Shimmer extends Vue {
  @Prop({ default: 'line' }) type!: string;
  @Prop({ default: '10px' }) height!: string;
  @Prop({ default: '10px' }) width!: string;

  get shimmerStyles() {
    const styles: Record<string, string> = {};

    if (this.height) styles.height = this.height;

    if (this.width) styles.width = this.width;

    return styles;
  }

  get shimmerClasses() {
    return ['shimmer', 'shimmer-animate', `shimmer-${this.type}`];
  }
}
</script>

<style lang="scss">
.shimmer {
  background: #777;
}

.shimmer-line {
  border-radius: 25px;
}

.shimmer-circle {
  border-radius: 50%;
}

.shimmer-animate {
  @include shimmer-animate;
}
</style>
