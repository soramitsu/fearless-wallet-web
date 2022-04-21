<template>
  <div class="finish">
    <Logo class="description" size="big" text="All done!" subtext="Stay Fearless!" />
    <div class="row">
      <ButtonWithIcon
        name="Follow on Twitter"
        iconType="twitter"
        :handler="redirect.bind(null, 'https://twitter.com/Soramitsu_co')"
      />

      <ButtonWithIcon
        name="Join on Telegram"
        iconType="telegram"
        :handler="redirect.bind(null, 'https://t.me/sora_xor')"
      />
    </div>
    <div class="row">
      <ButtonWithIcon name="Read on Medium" iconType="planet" :handler="redirect.bind(null, 'https://t.me/sora_xor')" />

      <ButtonWithIcon
        name="Learn on Wiki"
        iconType="question"
        :handler="redirect.bind(null, 'https://t.me/sora_xor')"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Logo from '../../components/Logo.vue';
import ButtonWithIcon from '../../components/ButtonWithIcon.vue';

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
