<template>
  <div class="logo">
    <div class="circle" :style="styleCircle">
      <div class="circle-blur">
        <img src="../assets/fw-logo.svg" class="img" :style="styleIconLogo" />
      </div>
    </div>

    <div v-show="text" class="text">{{ text }}</div>
    <div v-show="subtext" class="subtext">{{ subtext }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

type SizeLogo = 'small' | 'medium' | 'big';

@Component
export default class extends Vue {
  @Prop(String) text!: string;
  @Prop(String) subtext!: string;
  @Prop({ default: 'medium' }) size!: SizeLogo;

  get styleCircle() {
    return { height: this.toPx(this.sizeCircle), width: this.toPx(this.sizeCircle) };
  }

  get styleIconLogo() {
    const { height, width } = this.sizeIconLogo;

    return { height: this.toPx(height), width: this.toPx(width) };
  }

  get sizeCircle() {
    switch (this.size) {
      case 'small':
        return 48;
      case 'medium':
        return 72;
      case 'big':
        return 96;
      default:
        return 72;
    }
  }

  get sizeIconLogo() {
    switch (this.size) {
      case 'small':
        return {
          height: 21,
          width: 42,
        };
      case 'medium':
        return {
          height: 32,
          width: 64,
        };
      case 'big':
        return {
          height: 42,
          width: 85,
        };
      default:
        return {
          height: 32,
          width: 64,
        };
    }
  }

  toPx(value: number) {
    return `${value}px`;
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
    background: conic-gradient(from 180deg at 50% 50%, #ee7777 0deg, #ee0077 187.5deg, #7777ee 360deg);
    margin: 0 auto;
  }

  .circle-blur {
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    height: 100%;
    width: 100%;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .img {
    margin: 0 auto;
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
