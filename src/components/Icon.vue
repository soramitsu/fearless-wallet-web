<template>
  <svg class="svg-icon" :class="className" aria-hidden="true" v-on="$listeners">
    <use :xlink:href="getIconName" />
  </svg>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class Icon extends Vue {
  @Prop(String) icon!: string;
  @Prop(String) refName?: string;
  @Prop({ type: Array, default: () => [] }) className!: string[];

  readonly baseClass = 'svg-icon';

  get getIconName() {
    return `#icon-${this.icon}`; //icon-class='.svg file name' ==> '#icon-.svg file name'
  }
}
</script>

<style lang="scss" scoped>
.svg-icon {
  width: 1em;
  height: 1em;
  vertical-align: -0.15em;
  fill: currentColor;
  overflow: hidden;
}
</style>
