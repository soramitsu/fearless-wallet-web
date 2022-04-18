<template>
  <div class="logo">
    <div class="circle">
      <div class="circle-blur">
        <img src="../assets/fw-logo.svg" class="img" />
      </div>
    </div>

    <div v-show="text" class="text">{{ text }}</div>
    <div v-show="subtext" class="subtext">{{ subtext }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class extends Vue {
  @Prop(String) text!: string;
  @Prop(String) subtext!: string;
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
    height: 96px;
    width: 96px;
    margin: 0 auto;
  }

  .circle-blur {
    backdrop-filter: blur(10px);
    height: 100%;
    width: 100%;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .img {
    height: 42px;
    width: 85px;
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
