<template>
  <STabs v-model="vModel" type="rounded" position="top">
    <STab v-for="{ name, label } in tabs" class="button" :label="$t(label)" :name="name" :key="name" />
  </STabs>
</template>
<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';
import type { Tab } from '@/types';

@Component({})
export default class Tabs extends Vue {
  @VModel({ type: String }) vModel!: string;
  @Prop(Object) tabs!: Tab[];
}
</script>

<style lang="scss">
.el-tabs__nav {
  background: #111111 !important;
  color: $default-white !important;
  gap: 14px;
  &-wrap {
    background: #111111 !important;
  }
}

.el-tabs__item {
  text-transform: uppercase;

  &.is-active {
    border-radius: 30px !important;
    background-color: #7700ee40 !important;
    color: #ffffff75 !important;
  }

  &:not(.is-active) {
    border-radius: 30px !important;
    background-color: $default-background-color !important;
    color: #ffffff50 !important;
  }
}

.el-tab-pane {
  background-color: #111111 !important;
  height: 100% !important;
  width: 100% !important;
  border-radius: 0 !important;

  &.button {
    padding: 0;
    display: block;
    text-transform: none;
  }
}
</style>
