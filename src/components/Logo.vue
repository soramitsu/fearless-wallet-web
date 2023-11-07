<template>
  <div class="logo">
    <div :class="circleClasses" :style="styleCircle">
      <div :class="circleBlurClasses">
        <Icon icon="fw-logo" :className="iconClass" :style="sizeIconLogo" />
      </div>
    </div>

    <div v-show="text" class="text">{{ $t(text) }}</div>
    <div v-show="subtext" class="subtext">{{ $t(subtext) }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

type SizeLogo = 'mini' | 'small' | 'medium' | 'big';
type TypeLogo = 'primary' | 'secondary';

@Component
export default class Logo extends Vue {
  @Prop(String) text!: string;
  @Prop(String) subtext!: string;
  @Prop({ default: 'medium' }) size!: SizeLogo;
  @Prop({ default: 'primary' }) typeLogo!: TypeLogo;
  iconClass = ['img'];
  readonly circleSizes = {
    mini: '38px',
    small: '48px',
    medium: '72px',
    big: '96px',
  };
  readonly iconSizes = {
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

  get circleClasses() {
    return ['circle', `circle-${this.typeLogo}`];
  }

  get circleBlurClasses() {
    return [
      'circle-blur',
      {
        'circle-blur-primary': this.typeLogo === 'primary',
      },
    ];
  }

  get styleCircle() {
    return { height: this.sizeCircle, width: this.sizeCircle };
  }

  get sizeCircle() {
    return this.circleSizes[this.size] ? this.circleSizes[this.size] : this.circleSizes.medium;
  }

  get sizeIconLogo() {
    return this.iconSizes[this.size] ? this.iconSizes[this.size] : this.iconSizes.medium;
  }
}
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
