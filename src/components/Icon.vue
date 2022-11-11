<template>
  <svg :class="getClasses" aria-hidden="true" v-on="$listeners">
    <use :xlink:href="getIconName" class="icon__inner" :class="icon" />
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

  get getIconColor() {
    return `icon--${this.iconColor}`;
  }

  get getClasses() {
    const classes = ['svg-icon', ...[this.className].flat()];

    if (this.iconColor) classes.push(this.getIconColor);

    return classes;
  }

  get getIconName() {
    return `#icon-${this.icon}`;
  }
}
</script>

<style lang="scss" scoped>
.svg-icon {
  vertical-align: -0.15em;
  fill: currentColor;
  overflow: hidden;
  outline: none;
}

.icon__inner {
  outline: none;
}

.settings {
  width: 18px;
  height: 18px;
}
</style>
