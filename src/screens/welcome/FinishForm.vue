<template>
  <div class="finish">
    <Logo class="description" size="big" text="All done!" subtext="Stay Fearless!" />
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
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Logo from '../../components/Logo.vue';

@Component({
  components: { Logo },
})
export default class extends Vue {
  redirect(url: string) {
    window.open(url);
  }
}
</script>

<style lang="scss" scoped>
.finish {
  .icon {
    color: var(--pink-color);
    margin-right: 8px;
  }

  .button {
    width: 100%;
    font-size: 16px;
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .row {
    display: flex;
    justify-content: space-between;
    margin-top: 15px;
  }

  .description {
    margin: 37px 0 60px;
  }
}
</style>
