<template>
  <s-dropdown type="button" buttonType="secondary" trigger="click" class="dropdown" size="mini" @select="handler">
    {{ label }}
    <template slot="menu">
      <s-dropdown-item v-for="{ label, value } in options" :key="label" :value="value">{{ label }}</s-dropdown-item>
    </template>
  </s-dropdown>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class extends Vue {
  @Prop(String) value!: string;
  @Prop(Array) options!: Record<string, string>[];
  @Prop(Function) handler!: VoidFunction;

  get label() {
    return this.options.find(({ value }) => value === this.value)!.label;
  }
}
</script>

<style lang="scss">
.dropdown {
  .el-button {
    clip-path: var(--mini-clip-path-left-top-and-right-bottom) !important;
    background: none !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    color: white !important;
  }

  .el-button span {
    font-feature-settings: var(--s-font-feature-settings-heading);
    font-weight: 400;
    font-size: 14px;
  }
}
</style>
