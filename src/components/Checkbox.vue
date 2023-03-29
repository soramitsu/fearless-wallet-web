<template>
  <SCheckbox class="fw-checkbox" v-model.lazy="vModel" :size="size" :label="$t(label)" @change="onChange" />
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';

enum CheckboxSizes {
  'medium' = '24',
}

@Component
export default class Checkbox extends Vue {
  @VModel({ type: Boolean }) vModel!: boolean;
  @Prop(String) label!: string;
  @Prop({ default: 'medium' }) size!: CheckboxSizes;

  onChange(value: boolean) {
    this.$emit('change', value);
  }
}
</script>

<style lang="scss">
.fw-checkbox {
  border-color: $default-white !important;
  border-radius: 3px !important;

  .el-checkbox__input > .el-checkbox__inner {
    border-color: transparent;
    border-radius: 5px;
  }

  .el-checkbox__input.is-focus > .el-checkbox__inner {
    border-color: $purple-color;
  }

  .el-checkbox__inner:hover {
    border-color: $purple-color;
  }

  .el-checkbox__input.is-checked > .el-checkbox__inner {
    background-color: $purple-color;
    border-color: $purple-color;
  }

  .el-checkbox__inner {
    background-color: $default-background-color;
  }

  .el-checkbox__label {
    color: $default-white !important;
  }
}
</style>
