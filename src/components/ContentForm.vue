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
import BaseApi from '@/util/BaseApi';
import { EXTENSION_HEIGHT } from '@/consts/extensionInformation';

@Component({ components: { Corners } })
export default class ContentForm extends Vue {
  @Prop(Number) height!: number;

  get contentFormStyle() {
    const styles: Record<string, string> = {};

    if (this.height) {
      if (BaseApi.useIsPopup()) {
        styles.height = `${this.height}px`;
      } else {
        const subtractionNumber = EXTENSION_HEIGHT - this.height;

        styles.height = `calc(100vh - ${subtractionNumber}px)`;
      }
    }

    return styles;
  }
}
</script>

<style lang="scss" scoped>
.content-form {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background-color: rgba(255, 255, 255, 0.05);
  clip-path: $big-clip-path-left-top;
  border-radius: 8px;
  z-index: 1;
  width: calc(100% - 1px);
  min-height: 300px;
}
</style>
