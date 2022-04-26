<template>
  <s-button class="button-with-icon" type="primary" border-radius="mini" @click="handler">
    <s-icon :name="iconName" class="icon" />
    {{ name }}
  </s-button>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { IconType } from '@/util/iconName';
import getIconName from '@/util/iconName';

@Component
export default class extends Vue {
  @Prop(String) name!: string;
  @Prop(String) iconType!: IconType;
  @Prop(Function) handler!: VoidFunction;

  get iconName() {
    return getIconName(this.iconType);
  }
}
</script>

<style lang="scss" scoped>
.button-with-icon {
  clip-path: var(--mini-clip-path-left-top-and-right-bottom);
  background-color: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  width: 100%;
  font-weight: 600;
  font-size: 16px;

  .icon {
    color: var(--pink-color);
    margin-right: 8px;
    color: #ee0077;
  }

  &:hover {
    background-color: rgba(255, 255, 255, 0.1) !important;
    border: 1px solid rgba(255, 255, 255, 0.3) !important;
  }
}
</style>
