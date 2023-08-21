<template>
  <div class="counters">
    <div v-for="index in count" :key="index" class="counter" :class="activeClass(index)"></div>
  </div>
</template>
<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class StoryCounter extends Vue {
  @Prop(Number) activeIndex!: number;
  @Prop(Number) count!: number;

  activeClass(index: number) {
    return this.activeIndex === index ? 'counter--active' : '';
  }
}
</script>

<style lang="scss" scoped>
.counters {
  display: flex;
  gap: 7px;
}
.counter {
  width: 22px;
  height: 7px;
  border-radius: 8px;
  background: $gray-2-color;

  &--active {
    background: $default-white;
  }
}
</style>
