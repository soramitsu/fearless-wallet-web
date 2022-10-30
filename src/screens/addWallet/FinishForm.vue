<template>
  <div class="finish">
    <Logo class="description" size="big" text="All done!" subtext="Stay Fearless!" />
    <div class="row">
      <BorderButton
        text="Follow on Twitter"
        iconName="twitter"
        iconColor="pink"
        class="follow-button"
        width="256px"
        @click="openPage(URLS.TWITTER)"
      />

      <BorderButton
        text="Join on Telegram"
        iconName="telegram"
        iconColor="pink"
        width="256px"
        @click="openPage(URLS.TELEGRAM)"
      />
    </div>
    <div class="row">
      <BorderButton
        text="Read on Medium"
        iconName="medium"
        iconColor="pink"
        width="256px"
        @click="openPage(URLS.MEDIUM)"
      />

      <BorderButton text="Learn on Wiki" iconName="file-dock" width="256px" @click="openPage(URLS.WIKI)" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Logo from '@/components/Logo.vue';
import BorderButton from '@/components/BorderButton.vue';
import URLS from '@/consts/urls';

@Component({
  components: {
    Logo,
    BorderButton,
  },
})
export default class FinishForm extends Vue {
  readonly URLS = URLS;

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
