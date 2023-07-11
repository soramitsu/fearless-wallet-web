<template>
  <svg :class="getSvgClasses" aria-hidden="true" v-on="$listeners">
    <use :xlink:href="getIconName" :style="styles" :class="getUseClasses" />
  </svg>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class Icon extends Vue {
  @Prop(String) icon!: string;
  @Prop(String) iconColor?: string;
  @Prop({ type: String, default: '32px' }) width!: string;
  @Prop({ type: String, default: '32px' }) height!: string;
  @Prop({ default: '' }) className!: string[] | string;

  get getIconColor() {
    return `icon--${this.iconColor}`;
  }

  get styles() {
    return `width:${this.width}; height:${this.height};`;
  }

  get getSvgClasses() {
    const classes = ['svg-icon', ...[this.className].flat()];

    if (this.iconColor) classes.push(this.getIconColor);

    return classes;
  }

  get getUseClasses() {
    return ['icon__inner', this.icon];
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

.icon--success {
  color: $success-color;
}
.icon--purple {
  color: #7700ee;
}

.icon--default {
  color: #ffffff;
}
</style>
