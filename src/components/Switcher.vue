<template>
  <s-switch
    :value="value"
    @change="onChange"
    class="switch"
    :activeText="activeText"
    :inactiveText="inactiveText"
    :disabled="disabled"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class Switcher extends Vue {
  //  @VModel({ type: Boolean }) vModel!: boolean;
  @Prop(Function) onChange!: () => void;
  @Prop(Boolean) value!: boolean;
  @Prop({ default: '' }) activeText!: string;
  @Prop({ default: '' }) inactiveText!: string;
  @Prop({ default: false }) disabled!: boolean;
}
</script>

<style lang="scss">
.el-switch__core {
  background-color: #422539 !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.is-checked {
  .el-switch__core {
    background-color: #7700ee !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
  }
}
</style>
