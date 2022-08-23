<template>
  <s-checkbox class="fw-checkbox" v-model="value" :size="size" :label="label" />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

enum CheckboxSizes {
  'medium' = '24',
}

@Component
export default class Checkbox extends Vue {
  // @VModel({ type: Boolean }) vModel!: boolean;
  @Prop(String) label!: string;
  @Prop({ default: 'medium' }) size!: CheckboxSizes;
  value = true;
}
</script>

<style lang="scss">
.fw-checkbox {
  border-color: $default-white !important;
  border-radius: 3px !important;

  .el-checkbox__inner {
    background-color: transparent;
  }
  .el-checkbox__label {
    color: $default-white !important;
  }
}
</style>
