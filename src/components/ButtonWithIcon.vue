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
  width: 100%;
  font-size: 16px;
  background-color: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  font-weight: 600;
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px) !important;

  .icon {
    color: var(--pink-color);
    margin-right: 8px;
    color: #ee0077;
  }

  &:hover {
    background-color: rgba(255, 255, 255, 0.1) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
  }
}
</style>
