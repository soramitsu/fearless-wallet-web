<template>
  <div class="finish">
    <Logo class="description" size="big" text="All done!" subtext="Stay Fearless!" />
    <div class="row">
      <BorderButton
        text="Follow on Twitter"
        iconName="twitter-pink"
        class="follow-button"
        type="secondary"
        width="256px"
        @click="openPage('https://twitter.com/Soramitsu_co')"
      />

      <BorderButton
        text="Join on Telegram"
        iconName="telegram-pink"
        type="secondary"
        width="256px"
        @click="openPage('https://t.me/fearlesswallet')"
      />
    </div>
    <div class="row">
      <BorderButton
        text="Read on Medium"
        iconName="medium-pink"
        type="secondary"
        width="256px"
        @click="openPage('https://medium.com/fearlesswallet')"
      />

      <BorderButton
        text="Learn on Wiki"
        iconName="file-dock"
        type="secondary"
        width="256px"
        @click="openPage('https://wiki.sora.org/master')"
      />
    </div>
  </div>
</template>

<script lang="ts">
import Logo from '@/components/Logo.vue';
import BorderButton from '@/components/BorderButton.vue';
import { Component, Vue } from 'vue-property-decorator';

@Component({
  components: {
    Logo,
    BorderButton,
  },
})
export default class FinishForm extends Vue {
  openPage(url: string) {
    window.open(url);
  }
}
</script>

<style lang="scss" scoped>
.finish {
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
