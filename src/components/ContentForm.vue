<template>
  <Corners size="big" :bottomRightCorner="bottomRightCorner">
    <div :class="contentClasses" :style="contentFormStyle">
      <slot></slot>
    </div>
  </Corners>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { EXTENSION_HEIGHT } from '@/consts/extensionInformation';

type BackgroundType = 'black' | 'light-black';

@Component
export default class ContentForm extends Vue {
  @Prop(Number) height!: number;
  @Prop({ default: false }) isStaticHeight!: boolean;
  @Prop({ default: false }) bottomRightCorner!: boolean;
  @Prop({ default: 'light-black' }) backgroundColor!: BackgroundType;

  get contentFormStyle() {
    const styles: Record<string, string> = {};

    if (this.isStaticHeight) styles.height = `${this.height}px`;
    else {
      const subtractionNumber = EXTENSION_HEIGHT - this.height;

      styles.height = `calc(100vh - ${subtractionNumber}px)`;
      styles.minHeight = `${this.height}px`;
    }

    return styles;
  }

  get contentClasses() {
    return [
      'content-form',
      `background-${this.backgroundColor}`,
      this.bottomRightCorner ? 'corner-left-top-right-bottom' : 'corner-left-top',
    ];
  }
}
</script>

<style lang="scss" scoped>
.content-form {
  display: flex;
  flex-direction: column;
  border: 1px solid $default-background-color;
  border-radius: 8px;
  z-index: 1;
}

.corner-left-top {
  clip-path: $big-clip-path-left-top;
}

.corner-left-top-right-bottom {
  clip-path: $big-clip-path-left-top-and-right-bottom;
}

.background-black {
  background-color: #1c1c1c;
}

.background-light-black {
  background-color: $secondary-background-color;
}
</style>
