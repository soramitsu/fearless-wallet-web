<template>
  <Corners :hover="hover" :size="size" :topLeftCorner="topLeftCorner" :bottomRightCorner="bottomRightCorner">
    <Button
      type="secondary"
      :border="true"
      :borderRadius="borderRadius"
      :disabled="disabled"
      :hover="hover"
      :iconName="iconName"
      :iconColor="iconColor"
      :size="size"
      :fontSize="fontSize"
      :text="text"
      :width="width"
      @click="$emit('click')"
    />
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { ComponentText } from '@/interfaces';

type Size = 'mini' | 'small' | 'medium' | 'big';
type FontSize = 'small' | 'medium' | 'big';

@Component
export default class BorderButton extends Vue {
  @Prop({ default: '' }) text!: ComponentText;
  @Prop(String) width!: string;
  @Prop(String) iconName!: string;
  @Prop(String) iconColor!: string;
  @Prop({ default: 'medium' }) size!: Size;
  @Prop({ default: 'medium' }) fontSize!: FontSize;
  @Prop({ default: 'medium' }) borderRadius!: Size;
  @Prop({ default: false }) disabled!: boolean;
  @Prop({ default: true }) hover!: boolean;
  @Prop({ default: true }) topLeftCorner!: boolean;
  @Prop({ default: true }) bottomRightCorner!: boolean;
}
</script>
