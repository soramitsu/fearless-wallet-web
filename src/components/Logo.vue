<template>
  <div class="logo">
    <div :class="circleClasses" :style="styleCircle">
      <div :class="circleBlurClasses">
        <Icon icon="fw-logo" className="img" :style="sizeIconLogo" />
      </div>
    </div>

    <div v-show="text" class="text">{{ $t(text) }}</div>
    <div v-show="subtext" class="subtext">{{ $t(subtext) }}</div>
  </div>
</template>

<script lang="ts" setup>
import { defineProps, withDefaults, computed } from 'vue';

type SizeLogo = 'mini' | 'small' | 'medium' | 'big';
type TypeLogo = 'primary' | 'secondary';

interface Props {
  text: string;
  subtext: string;
  size?: SizeLogo;
  typeLogo?: TypeLogo;
}

const props = withDefaults(defineProps<Props>(), {
  text: '',
  subtext: '',
  size: 'medium',
  typeLogo: 'primary',
});

const circleSizes = {
  mini: '38px',
  small: '48px',
  medium: '72px',
  big: '96px',
};
const iconSizes = {
  mini: {
    height: '18px',
    width: '32px',
  },
  small: {
    height: '21px',
    width: '42px',
  },
  medium: {
    height: '32px',
    width: '64px',
  },
  big: {
    height: '42px',
    width: '85px',
  },
};

const circleClasses = computed(() => ['circle', `circle-${props.typeLogo}`]);

const circleBlurClasses = computed(() => [
  'circle-blur',
  {
    'circle-blur-primary': props.typeLogo === 'primary',
  },
]);

const sizeCircle = computed(() => circleSizes[props.size] ?? circleSizes.medium);

const styleCircle = computed(() => ({ height: sizeCircle.value, width: sizeCircle.value }));

const sizeIconLogo = computed(() => iconSizes[props.size] ?? iconSizes.medium);
</script>

<style lang="scss" scoped>
.logo {
  display: flex;
  flex-direction: column;
  justify-content: center;

  .circle {
    border-radius: 50%;
    margin: 0 auto;
  }

  .circle-primary {
    background-color: $pink-color;
  }

  .circle-secondary {
    background-color: $secondary-background-color;
  }

  .circle-blur {
    height: 100%;
    width: 100%;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .circle-blur-primary {
    border: $default-border;
  }

  .img {
    margin: 0 auto;
    user-select: none;
  }

  .text {
    margin-top: 17px;
    font-weight: 700;
    font-size: 48px;
    line-height: 120%;
  }

  .subtext {
    font-size: 18px;
    line-height: 150%;
    margin-top: 6px;
  }
}
</style>
