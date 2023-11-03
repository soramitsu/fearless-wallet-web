<template>
  <div class="FCorners">
    <div :class="slotContainerClasses">
      <slot></slot>
    </div>

    <div v-if="topLeftCorner" :class="topLeftCornerClasses"></div>
    <div v-if="bottomRightCorner" :class="bottomRightCornerClasses"></div>
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
    border-top: 1px solid $default-background-color;
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
