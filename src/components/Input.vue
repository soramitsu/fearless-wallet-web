<template>
  <div :class="styleClasses">
    <s-input
      v-model="vModel"
      :class="inputClasses"
      :type="type"
      :accept="accept"
      :placeholder="placeholder"
      :size="size"
      :maxlength="maxlength"
      :readonly="readonly"
      :show-password="showPassword"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';

type Size = 'small' | 'medium' | 'big';
type Type = 'text' | 'textarea' | 'text-file';
type Style = 'default' | 'pink';

@Component
export default class extends Vue {
  @VModel({ type: String }) vModel!: string;
  @Prop(String) placeholder!: string;
  @Prop(String) accept!: string;
  @Prop({ default: 'medium' }) size!: Size;
  @Prop({ default: 'text' }) type!: Type;
  @Prop({ default: 100 }) maxlength!: number;
  @Prop({ default: false }) readonly!: boolean;
  @Prop({ default: false }) showPassword!: boolean;
  @Prop({ default: 'default' }) styleInput!: Style;
  @Prop({ default: false }) isError!: boolean;

  get styleClasses() {
    return [`input-style-${this.styleInput}`];
  }

  get inputClasses() {
    return [
      'input',
      {
        'error-input': this.isError,
      },
    ];
  }
}
</script>

<style lang="scss">
.input-style-default {
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

  .error-input {
    border: 1px solid #ee7700 !important;
  }
}

.input-style-pink {
  textarea,
  input {
    color: #ffffff !important;
  }

  .s-input {
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    background-color: var(--pink-purple-color) !important;
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

  .error-input {
    border: 1px solid #ee7700 !important;
  }
}
</style>
