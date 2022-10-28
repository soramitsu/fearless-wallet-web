<template>
  <svg :class="getSvgClass" aria-hidden="true" v-on="$listeners">
    <use :xlink:href="getIconName" />
  </svg>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class SvgIcon extends Vue {
  @Prop(String) icon!: string;
  @Prop({ type: String, default: '' }) className!: string;

  get getIconName() {
    return `#icon-${this.icon}`; //icon-class='.svg file name' ==> '#icon-.svg file name'
  }
  get getSvgClass() {
    if (this.className) {
      return 'svg-icon ' + this.className; //className for the added style
    } else {
      return 'svg-icon';
    }
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
