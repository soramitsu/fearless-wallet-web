<template>
  <div :class="classes" :style="circleStyles">
    <ExternalLogo :name="icon" :width="width" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

const widthParams = {
  small: 60,
  medium: 87,
  big: 115,
};

const widthHighlightIconParams = {
  small: 10,
  medium: 25,
  big: 15,
};

type Props = {
  shadowColor: string;
  icon: string;
  size?: 'small' | 'medium' | 'big';
  moveHorizontalShadow?: 'left' | 'right';
};

const props = withDefaults(defineProps<Props>(), {
  size: 'medium',
});

const circleStyles = computed(() => {
  const moveHorizontal =
    props.moveHorizontalShadow === 'left' ? '-4px' : props.moveHorizontalShadow === 'right' ? '4px' : '0px';

  return {
    filter: `drop-shadow(${moveHorizontal} 0px ${widthHighlightIconParams[props.size]}px #${props.shadowColor})`,
  };
});

const classes = computed(() => ['background-circle', `size-${props.size}`]);
const width = computed(() => widthParams[props.size]);
</script>

<style lang="scss" scoped>
.background-circle {
  background-color: #111;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.size-small {
  width: 90px;
  height: 90px;
}

.size-medium {
  width: 90px;
  height: 90px;
}

.size-big {
  width: 130px;
  height: 130px;
}
</style>
