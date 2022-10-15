<template>
  <Corners>
    <div :class="tabButtonClasses" @click="$emit('click')" :title="title">
      {{ text }}
    </div>
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Corners from '@/components/Corners.vue';

@Component({
  components: { Corners },
})
export default class TabButton extends Vue {
  @Prop({ default: '' }) text!: string;
  @Prop({ default: '' }) title!: string;
  @Prop({ default: false }) isActive!: boolean;

  get tabButtonClasses() {
    return [
      'tab-button',
      {
        'active-background': this.isActive,
      },
    ];
  }
}
</script>

<style lang="scss" scoped>
.tab-button {
  background-color: $secondary-background-color;
  padding: 0 15px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 36px;
  clip-path: $medium-clip-path-left-top-and-right-bottom;
  border: 1px solid $default-background-color;
  height: 36px;
  user-select: none;

  &:hover {
    cursor: pointer;
  }
}

.active-background {
  background-color: $pink-purple-color;
}
</style>
