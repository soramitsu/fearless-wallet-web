<template>
  <FCorners size="big" :bottomRightCorner="bottomRightCorner">
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
  bottomRightCorner?: boolean;
  backgroundColor?: BackgroundType;
};

const props = withDefaults(defineProps<Props>(), {
  isStaticHeight: false,
  bottomRightCorner: false,
  backgroundColor: 'light-black',
});

const contentFormStyle = computed(() => {
  const styles: Record<string, string> = {};

  if (!IS_EXTENSION && props.height === 0) {
    return {
      height: '100%',
    };
  }

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

.corner-left-top {
  clip-path: $big-clip-path-left-top;
}

.corner-left-top-right-bottom {
  clip-path: $big-clip-path-left-top-and-right-bottom;
}

.background-black {
  background-color: #1c1c1c;
}

.background-light-black {
  background-color: $secondary-background-color;
}
</style>
