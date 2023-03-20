<template>
  <div>
    <div class="bar full" :style="fullBarStyle"></div>
    <div class="bar progress" :style="progressStyle"></div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class ProgressBar extends Vue {
  @Prop({ default: '365px' }) width!: string;
  @Prop(Number) fillFactor!: number;

  get fullBarStyle() {
    return `width:${this.width}`;
  }

  get progressStyle() {
    const width = `${this.fillFactor * 100}%`;

    return `width:${width}`;
  }
}
</script>

<style lang="scss" scoped>
.bar {
  border-radius: 16px;
  height: 5px;
}

.full {
  background-color: $default-white;
}

.progress {
  background-color: $pink-color;
  position: relative;
  top: -5px;
}
</style>
