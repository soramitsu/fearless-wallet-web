<template>
  <Corners :isError="isError" :size="size">
    <div :class="containerInputClasses" spellcheck="false">
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
        :style="inputStyle"
        @blur="$emit('blur', $event)"
        @input="$emit('change', $event)"
      />
    </div>
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';
import Corners from '@/components/Corners.vue';

type Size = 'small' | 'medium' | 'big';
type Type = 'text' | 'textarea' | 'text-file' | 'number';
type Style = 'default' | 'pink';

@Component({
  components: { Corners },
})
export default class Input extends Vue {
  @VModel({ type: String || Number }) vModel!: string | number;
  @Prop(String) placeholder!: string;
  @Prop(String) accept!: string;
  @Prop(Number) height!: number;
  @Prop({ default: 'medium' }) size!: Size;
  @Prop({ default: 'text' }) type!: Type;
  @Prop({ default: 100 }) maxlength!: number;
  @Prop({ default: false }) readonly!: boolean;
  @Prop({ default: false }) showPassword!: boolean;
  @Prop({ default: 'default' }) styleInput!: Style;
  @Prop({ default: false }) isError!: boolean;

  get containerInputClasses() {
    // for "small" and "mini" sizes also medium
    const sizeName = this.size === 'big' ? 'big' : 'medium';

    return ['input', `input-style-${this.styleInput}`, `input-size-${sizeName}`];
  }

  get inputStyle() {
    const styles: Record<string, string> = {};

    if (this.height) styles.height = `${this.height}px`;

    return styles;
  }

  get inputClasses() {
    return [
      {
        'error-input': this.isError,
      },
    ];
  }
}
</script>

<style lang="scss">
.input {
  position: relative;

  .s-input {
    border: 1px solid $default-background-color !important;
    padding-left: 25px !important;
  }

  .el-input__inner {
    font-size: 16px !important;
  }

  .s-input .s-placeholder {
    color: $default-white !important;
  }

  .s-placeholder + .el-input {
    padding-top: 15px !important;
  }

  .error-input {
    border: 1px solid $error-color !important;
  }
}

.input-style-default {
  textarea,
  input {
    color: $pink-lavender-color !important;
  }

  .s-input {
    background-color: $secondary-background-color !important;
  }
}

.input-style-pink {
  textarea,
  input {
    color: #ffffff !important;
  }

  .s-input {
    background-color: $pink-purple-color !important;
  }
}

.input-size-big {
  .s-input {
    clip-path: $big-clip-path-left-top-and-right-bottom;
  }
}

.input-size-medium {
  .s-input {
    clip-path: $medium-clip-path-left-top-and-right-bottom;
  }
}
</style>
