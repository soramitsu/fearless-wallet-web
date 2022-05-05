<template>
  <div class="select-style-default">
    <s-select v-model="vModel" :placeholder="placeholder" :size="size">
      <s-option v-for="{ value, label } in options" :key="value" :value="value" :label="label" />
    </s-select>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';

type Size = 'small' | 'medium' | 'big';

interface Options {
  label: string;
  value: string;
}

@Component
export default class extends Vue {
  @VModel({ type: String }) vModel!: string;
  @Prop(String) placeholder!: string;
  @Prop(Array) options!: Options[];
  @Prop({ default: 'medium' }) size!: Size;
}
</script>

<style lang="scss">
.select-style-default {
  input {
    color: var(--pink-lavender-color) !important;
  }

  .s-select {
    clip-path: var(--default-clip-path-left-top-and-right-bottom);
  }

  .s-select .el-input__inner {
    background-color: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    padding-top: 25px !important;
  }

  .s-select .s-placeholder {
    color: rgba(255, 255, 255, 0.75) !important;
    margin-top: 12px !important;
    padding-left: 25px !important;
  }

  .s-select input {
    padding-left: 25px !important;
  }

  .s-select .el-select i.el-icon-arrow-up:before {
    color: rgba(255, 255, 255, 0.5) !important;
  }
}
</style>
