<template>
  <Corners :hover="hover" :size="size" :topLeftCorner="topLeftCorner" :bottomRightCorner="bottomRightCorner">
    <Button
      type="secondary"
      :border="true"
      :borderRadius="borderRadius"
      :disabled="disabled"
      :hover="hover"
      :iconName="iconName"
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
import Corners from './Corners.vue';
import Button from './Button.vue';

type Size = 'mini' | 'small' | 'medium' | 'big';
type FontSize = 'small' | 'medium' | 'big';
type Type = 'primary' | 'secondary';

@Component({
  components: {
    Corners,
    Button,
  },
})
export default class BorderButton extends Vue {
  @Prop(String) text!: string;
  @Prop(String) width!: string;
  @Prop(String) iconName!: string;
  @Prop({ default: 'primary' }) type!: Type;
  @Prop({ default: 'medium' }) size!: Size;
  @Prop({ default: 'medium' }) fontSize!: FontSize;
  @Prop({ default: 'medium' }) borderRadius!: Size;
  @Prop({ default: false }) disabled!: boolean;
  @Prop({ default: true }) hover!: boolean;
  @Prop({ default: true }) topLeftCorner!: boolean;
  @Prop({ default: true }) bottomRightCorner!: boolean;
}
</script>

<style lang="scss" scoped></style>
