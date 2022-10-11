<template>
  <Corners v-if="!readonly" :isError="isError" :size="size">
    <div :class="containerInputClasses">
      <s-float-input
        v-model="vModel"
        :class="inputClasses"
        :placeholder="placeholder"
        :size="size"
        :style="inputStyle"
        @input="$emit('change', $event)"
      />
    </div>
  </Corners>

  <!-- float input cannot be made readonly, so here is such a crutch -->
  <Input v-else v-model="vModel" :placeholder="placeholder" :size="size" :styleInput="styleInput" :readonly="true" />
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';
import Corners from '@/components/Corners.vue';
import Input from '@/components/Input.vue';

type Size = 'small' | 'medium' | 'big';
type Style = 'default' | 'pink';

@Component({
  components: { Corners, Input },
})
export default class FloatInput extends Vue {
  @VModel({ type: String || Number }) vModel!: string | number;
  @Prop(String) placeholder!: string;
  @Prop(Number) height!: number;
  @Prop({ default: false }) readonly!: boolean;
  @Prop({ default: 'medium' }) size!: Size;
  @Prop({ default: 'default' }) styleInput!: Style;
  @Prop({ default: false }) isError!: boolean;

  get containerInputClasses() {
    // for "small" and "mini" sizes also medium
    const sizeName = this.size === 'big' ? 'big' : 'medium';

    return ['float-input', `float-input-style-${this.styleInput}`, `float-input-size-${sizeName}`];
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
.float-input {
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

.float-input-style-default {
  textarea,
  input {
    color: $pink-lavender-color !important;
  }

  .s-input {
    background-color: $secondary-background-color !important;
  }
}

.float-input-style-pink {
  textarea,
  input {
    color: #ffffff !important;
  }

  .s-input {
    background-color: $pink-purple-color !important;
  }
}

.float-input-size-big {
  .s-input {
    clip-path: $big-clip-path-left-top-and-right-bottom;
  }
}

.float-input-size-medium {
  .s-input {
    clip-path: $medium-clip-path-left-top-and-right-bottom;
  }
}
</style>
