<template>
  <Corners size="big" :bottomRightCorner="false">
    <div class="content-form" :style="contentFormStyle">
      <slot></slot>
    </div>
  </Corners>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import Corners from '@/components/Corners.vue';

@Component({ components: { Corners } })
export default class ContentForm extends Vue {
  @Prop(Number) height!: number;

  get contentFormStyle() {
    const styles: Record<string, string> = {};

    if (this.height) styles.height = `${this.height}px`;

    return styles;
  }
}
</script>

<style lang="scss" scoped>
.content-form {
  display: flex;
  flex-direction: column;
  border: 1px solid $default-background-color;
  background-color: $secondary-background-color;
  clip-path: $big-clip-path-left-top;
  border-radius: 8px;
  z-index: 1;
  width: calc(100% - 1px);
}
</style>
