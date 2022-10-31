<template>
  <svg class="svg-icon" :class="getClasses" aria-hidden="true" v-on="$listeners">
    <use :xlink:href="getIconName" />
  </svg>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class Icon extends Vue {
  @Prop(String) icon!: string;
  @Prop(String) iconColor?: string;
  @Prop(String) refName?: string;
  @Prop({ default: '' }) className!: string[] | string;

  readonly baseClass = 'svg-icon';

  get getIconColor() {
    return `icon--${this.iconColor}`;
  }

  get getClasses() {
    if (!Array.isArray(this.className)) {
      return [this.className];
    }

    const classes = [...this.className];
    if (this.iconColor) classes.push(this.getIconColor);

    return classes;
  }

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
.settings {
  width: 18px;
  height: 18px;
}
</style>
