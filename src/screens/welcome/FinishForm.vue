<template>
  <div class="finish">
    <Logo class="description" size="big" text="All done!" subtext="Stay Fearless!" />
    <div class="row">
      <ButtonWithIcon
        text="Follow on Twitter"
        iconType="twitter"
        class="follow-button"
        width="256px"
        @click="redirect('https://twitter.com/Soramitsu_co')"
      />

      <ButtonWithIcon
        text="Join on Telegram"
        iconType="telegram"
        width="256px"
        @click="redirect('https://t.me/sora_xor')"
      />
    </div>
    <div class="row">
      <ButtonWithIcon
        text="Read on Medium"
        iconType="planet"
        width="256px"
        @click="redirect('https://t.me/sora_xor')"
      />

      <ButtonWithIcon
        text="Learn on Wiki"
        iconType="question"
        width="256px"
        @click="redirect('https://t.me/sora_xor')"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Logo from '@/components/Logo.vue';
import ButtonWithIcon from '@/components/ButtonWithIcon.vue';

@Component({
  components: { Logo, ButtonWithIcon },
})
export default class extends Vue {
  redirect(url: string) {
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
