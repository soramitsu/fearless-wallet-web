<template>
  <Corners :hover="hover" :size="size" :topLeftCorner="topLeftCorner" :bottomRightCorner="bottomRightCorner">
    <Button
      :border="true"
      :borderRadius="borderRadius"
      :disabled="disabled"
      :hover="hover"
      :icon="icon"
      :size="size"
      :text="text"
      :type="type"
      :width="width"
      @click="$emit('click')"
    />
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { IconType } from '@/util/iconName';
import Corners from './Corners.vue';
import Button from './Button.vue';

type Size = 'mini' | 'small' | 'medium' | 'big';
type Type = 'primary' | 'secondary';

@Component({
  components: {
    Corners,
    Button,
  },
})
export default class extends Vue {
  @Prop(String) text!: string;
  @Prop(String) width!: string;
  @Prop({ default: 'primary' }) type!: Type;
  @Prop({ default: 'medium' }) size!: Size;
  @Prop({ default: 'medium' }) borderRadius!: Size;
  @Prop({ default: '' }) icon!: IconType;
  @Prop({ default: false }) disabled!: boolean;
  @Prop({ default: true }) hover!: boolean;
  @Prop({ default: true }) topLeftCorner!: boolean;
  @Prop({ default: true }) bottomRightCorner!: boolean;
}
</script>

<style lang="scss" scoped></style>
