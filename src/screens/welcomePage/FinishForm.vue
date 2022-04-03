<template>
  <div class="finish">
    <div class="logo-block">
      <div class="circle">
        <div class="circle-blur">
          <img src="../../assets/fw-logo.svg" class="logo" />
        </div>
      </div>
      <div class="text">All done!</div>
      <div class="subtext">Stay Fearless!</div>
    </div>
    <div>
      <div class="row">
        <s-button
          class="button"
          type="primary"
          border-radius="mini"
          @click="redirect('https://twitter.com/Soramitsu_co')"
        >
          <s-icon name="symbols-twitter-24" class="icon" />
          Follow on Twitter
        </s-button>
        <s-button class="button" type="primary" border-radius="mini" @click="redirect('https://t.me/sora_xor')">
          <s-icon name="symbols-telegram-24" class="icon" />
          Join on Telegram
        </s-button>
      </div>
      <div class="row">
        <s-button class="button" type="primary" border-radius="mini" @click="redirect('https://t.me/sora_xor')">
          <s-icon name="various-planet-24" class="icon" />
          Read on Medium
        </s-button>
        <s-button class="button" type="primary" border-radius="mini" @click="redirect('https://t.me/sora_xor')">
          <s-icon name="notifications-question-circle-24" class="icon" />
          Learn on Wiki
        </s-button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class extends Vue {
  redirect(url: string) {
    window.open(url);
  }
}
</script>

<style lang="scss" scoped>
.finish {
  .icon {
    color: #ee0077;
    margin-right: 8px;
  }

  .button {
    width: 256px;
    font-size: 16px;
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .row {
    display: flex;
    justify-content: space-between;
    margin-top: 15px;

    &:first-child {
      margin-top: 40px;
    }
  }

  .logo-block {
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin-top: 65px;

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

    .logo {
      height: 42px;
      width: 85px;
      margin: 0 auto;
    }

    .text {
      height: 60px;
      width: 374px;
      margin: 0 auto;
      font-weight: 700;
      font-size: 48px;
      line-height: 60px;
    }

    .subtext {
      height: 25px;
      width: 322px;
      margin: 0 auto;
      font-weight: 300;
      font-size: 20px;
      line-height: 25px;
      opacity: 0.8;
    }
  }
}
</style>
