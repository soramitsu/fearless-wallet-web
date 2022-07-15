<template>
  <div :class="classes">
    <slot></slot>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';

@Component
export default class Rotate extends Vue {
  notFirstOpening = false;

  @Prop(Boolean) isActive!: boolean;

  get classes() {
    return [
      {
        rotate: this.isActive,
        'non-rotate': this.notFirstOpening && !this.isActive,
      },
    ];
  }

  @Watch('isActive')
  filter() {
    this.notFirstOpening = true;
  }
}
</script>

<style lang="scss" scoped>
.rotate {
  @include rotate180deg;
}

.non-rotate {
  @include rotate180degReverse;
}
</style>
