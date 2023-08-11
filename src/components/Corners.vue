<template>
  <div :class="cornersClasses">
    <div :class="slotContainerClasses">
      <slot></slot>
    </div>

    <div v-if="topLeftCorner" :class="topLeftCornerClasses"></div>
    <div v-if="bottomRightCorner" :class="bottomRightCornerClasses"></div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

type Size = 'mini' | 'small' | 'medium' | 'big';

@Component
export default class Corners extends Vue {
  @Prop({ default: false }) isError!: boolean;
  @Prop({ default: false }) isSelected!: boolean;
  @Prop({ default: false }) hover!: boolean;
  @Prop({ default: true }) topLeftCorner!: boolean;
  @Prop({ default: true }) bottomRightCorner!: boolean;
  @Prop({ default: 'medium' }) size!: Size;

  get cornersClasses() {
    return [
      {
        corners: this.topLeftCorner || this.bottomRightCorner,
      },
    ];
  }

  get slotContainerClasses() {
    return [
      {
        hover: this.hover,
      },
    ];
  }

  get topLeftCornerClasses() {
    return [...this.cornerClasses, 'top-left'];
  }

  get bottomRightCornerClasses() {
    return [...this.cornerClasses, 'bottom-right'];
  }

  get cornerClasses() {
    // for "small" and "mini" sizes also medium
    const sizeName = this.size === 'big' ? 'big' : 'medium';

    const classes = [
      `corner-size-${sizeName}`,
      {
        'corner-border-error': this.isError,
        'corner-border-selected': this.isSelected && !this.isError,
        'corner-border': !this.isError && !this.isSelected,
      },
    ];

    return classes;
  }
}
</script>

<style lang="scss" scoped>
.corners {
  position: relative;
  margin-bottom: 3px;
  height: fit-content;

  .corner-size-big {
    position: absolute;
    clip-path: polygon(6.8px 0, calc(100% - 7px) 0, 100% calc(100% - 30px), 0 calc(100% - 30px));
    width: 40px;
    height: 40px;
  }

  .corner-size-medium {
    position: absolute;
    clip-path: polygon(5.8px 0, calc(100% - 6px) 0, 100% calc(100% - 16px), 0 calc(100% - 16px));
    width: 20px;
    height: 20px;
  }

  .corner-border {
    border-top: $default-border;
  }

  .hover:hover ~ .corner-border {
    border-top: 1px solid rgba(255, 255, 255, 0.2);
  }
}

.corner-border-error {
  border-top: 1px solid $simple-orange-color;
}

.corner-border-selected {
  border-top: 1px solid #7700ee;
}

.top-left[class~='corner-size-big'] {
  transform: rotate(315deg);
  top: 4px;
  left: 4px;
}

.bottom-right[class~='corner-size-big'] {
  transform: rotate(135deg);
  bottom: 4px;
  right: 4px;
}

.top-left[class~='corner-size-medium'] {
  transform: rotate(315deg);
  top: 1px;
  left: 1px;
}

.bottom-right[class~='corner-size-medium'] {
  transform: rotate(135deg);
  bottom: 1px;
  right: 1px;
}
</style>
