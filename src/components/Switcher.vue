<template>
  <SSwitch
    v-model="vModel"
    class="switch"
    data-testid="switch"
    :activeText="activeText"
    :inactiveText="inactiveText"
    :disabled="disabled"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';

@Component
export default class Switcher extends Vue {
  @VModel({ type: Boolean }) vModel!: boolean;
  @Prop({ default: '' }) activeText!: string;
  @Prop({ default: '' }) inactiveText!: string;
  @Prop({ default: false }) disabled!: boolean;
}
</script>

<style lang="scss">
.el-switch__core {
  background-color: #422539 !important;
  border: 1px solid $default-background-color !important;
}

.is-checked {
  .el-switch__core {
    background-color: #7700ee !important;
    border: 1px solid $default-background-color !important;
  }
}
</style>
