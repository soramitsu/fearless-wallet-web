<template>
  <FCorners size="big" :bottomRightCorner="bottomRightCorner" :class="{ 'fill-height': fillHeight }">
    <div :class="contentClasses" :style="contentFormStyle">
      <slot></slot>
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { APP_HEIGHT, IS_EXTENSION } from '@/consts/global';

type BackgroundType = 'black' | 'light-black';

type Props = {
  height?: number;
  isStaticHeight?: boolean;
  // Take the rest of a flex-column page instead of a height derived from the window, so banners above the
  // page shrink the form rather than push its end under the menu.
  fillHeight?: boolean;
  bottomRightCorner?: boolean;
  backgroundColor?: BackgroundType;
};

const props = withDefaults(defineProps<Props>(), {
  isStaticHeight: false,
  fillHeight: false,
  bottomRightCorner: false,
  backgroundColor: 'light-black',
});

const contentFormStyle = computed(() => {
  const styles: Record<string, string> = {};

  if (props.fillHeight) return styles;
  if (!(IS_EXTENSION || props.height)) return { height: '100%' };

  if (props.isStaticHeight) styles.height = `${props.height}px`;
  else if (props.height !== undefined) {
    const subtractionNumber = APP_HEIGHT - props.height;

    styles.height = `calc(100vh - ${subtractionNumber}px)`;
    styles.minHeight = `${props.height}px`;
  }

  return styles;
});

const contentClasses = computed(() => {
  return [
    'content-form',
    `background-${props.backgroundColor}`,
    props.bottomRightCorner ? 'corner-left-top-right-bottom' : 'corner-left-top',
  ];
});
</script>

<style lang="scss" scoped>
.content-form {
  display: flex;
  flex-direction: column;
  border: $default-border;
  border-radius: $default-border-radius;
  z-index: 1;
}

// The corners wrapper (this component's root) shares the page with its header; the form fills what is left
// and its own scroll area keeps the overflow.
.fill-height {
  flex: 1 1 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);

  .content-form {
    height: 100%;
  }
}

.corner-left-top {
  clip-path: $big-clip-path-left-top;
}

.corner-left-top-right-bottom {
  clip-path: $big-clip-path-left-top-and-right-bottom;
}

.background-black {
  background-color: $fw-form-surface;
}

.background-light-black {
  background-color: $secondary-background-color;
}

@include v1-palette {
  .content-form {
    border-radius: 16px;
    border-color: var(--fw-stroke-strong);
  }
}
</style>
