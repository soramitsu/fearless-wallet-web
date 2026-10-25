<template>
  <div :class="cornersClasses">
    <div :class="slotContainerClasses">
      <slot></slot>
    </div>

    <div v-if="topLeftCorner" :class="topLeftCornerClasses" aria-hidden="true"></div>
    <div v-if="bottomRightCorner" :class="bottomRightCornerClasses" aria-hidden="true"></div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type Size = 'mini' | 'small' | 'medium' | 'big';
type Props = {
  isError?: boolean;
  isSelected?: boolean;
  hover?: boolean;
  topLeftCorner?: boolean;
  bottomRightCorner?: boolean;
  size?: Size;
};

const props = withDefaults(defineProps<Props>(), {
  isError: false,
  isSelected: false,
  hover: false,
  topLeftCorner: true,
  bottomRightCorner: true,
  size: 'medium',
});

const cornerClasses = computed(() => {
  // for "small" and "mini" sizes also medium
  const sizeName = props.size === 'big' ? 'big' : 'medium';

  const classes = [
    `corner-size-${sizeName}`,
    {
      'corner-border-error': props.isError,
      'corner-border-selected': props.isSelected && !props.isError,
      'corner-border': !props.isError && !props.isSelected,
    },
  ];

  return classes;
});

const slotContainerClasses = computed(() => [{ hover: props.hover }]);
const topLeftCornerClasses = computed(() => [...cornerClasses.value, 'top-left']);
const bottomRightCornerClasses = computed(() => [...cornerClasses.value, 'bottom-right']);
const cornersClasses = computed(() => [
  {
    FCorners: props.topLeftCorner || props.bottomRightCorner,
  },
]);
</script>

<style lang="scss" scoped>
.FCorners {
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
  border-top: 1px solid $fw-focus-ring;
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
@include v1-palette {
  .FCorners .corner-size-big,
  .FCorners .corner-size-medium {
    pointer-events: none;
    width: 8px;
    height: 8px;
    clip-path: none;
    transform: none;
    border: 0;
    &.top-left {
      top: 0;
      left: 0;
      border-top: 1px solid var(--fw-hud-tick);
      border-left: 1px solid var(--fw-hud-tick);
    }
    &.bottom-right {
      bottom: 0;
      right: 0;
      border-bottom: 1px solid var(--fw-hud-tick);
      border-right: 1px solid var(--fw-hud-tick);
    }
  }
  // Inputs, small controls and calm screens have a complete control edge; decorative ticks belong to large panels.
  .FCorners .corner-size-medium,
  .fw-calm .FCorners .corner-size-big {
    display: none;
  }
}
</style>
