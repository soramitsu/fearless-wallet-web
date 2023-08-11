<template>
  <svg :class="getSvgClasses" aria-hidden="true">
    <use :xlink:href="getIconName" :style="styles" :class="getUseClasses" v-on="$listeners" />
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
  @Prop({ default: true }) hover!: boolean;

  get getIconColor() {
    return `icon--${this.iconColor}`;
  }

  get styles() {
    return `width:${this.width}; height:${this.height};`;
  }

  get getSvgClasses() {
    const classes = [
      'svg-icon',
      {
        'svg-icon--hover': this.hover,
      },
      ...[this.className].flat(),
    ];

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

.svg-icon--hover {
  &:hover {
    opacity: 0.5;
  }
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

.icon--purple:hover {
  color: #7700ee50;
}

.icon--default {
  color: #ffffff;
}
</style>
