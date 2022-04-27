<template>
  <s-input
    v-model="vModel"
    class="input"
    :type="type"
    :accept="accept"
    :placeholder="placeholder"
    :size="size"
    :maxlength="maxlength"
    :readonly="readonly"
    :show-password="showPassword"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';

type Size = 'small' | 'medium' | 'big';
type Type = 'text' | 'textarea' | 'text-file';

@Component
export default class extends Vue {
  @VModel({ type: String }) vModel!: string;
  @Prop(String) placeholder!: string;
  @Prop(String) accept!: string;
  @Prop({ default: 'medium' }) size!: Size;
  @Prop({ default: 'text' }) type!: Type;
  @Prop({ default: 25 }) maxlength!: number;
  @Prop({ default: false }) readonly!: boolean;
  @Prop({ default: false }) showPassword!: boolean;
}
</script>

<style lang="scss">
textarea,
input {
  color: var(--pink-lavender-color) !important;
}

.s-input {
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  background-color: rgba(255, 255, 255, 0.05) !important;
  clip-path: var(--default-clip-path-left-top-and-right-bottom);
  padding-left: 25px !important;
}

.el-input__inner {
  font-size: 16px !important;
}

.s-input .s-placeholder {
  color: rgba(255, 255, 255, 0.75) !important;
}

.s-placeholder + .el-input {
  padding-top: 15px !important;
}
</style>
