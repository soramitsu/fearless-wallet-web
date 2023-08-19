<template>
  <Fragment>
    <div class="onboarding">
      <OnboardingStory />

      <StoryCounter :count="3" :activeIndex="1" />

      <div class="controls">
        <BorderButton text="Skip" />
        <Button class="button__continue" text="Next" />
      </div>
    </div>
  </Fragment>
</template>
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import OnboardingStory from './OnboardingStory.vue';
import StoryCounter from './StoryCounter.vue';

import { Components } from '@/router/routes';
import { OnboardingStories } from '@/interfaces/ui';
@Component({
  components: {
    OnboardingStory,
    StoryCounter,
  },
})
export default class Onboarding extends Vue {
  stories: OnboardingStories = [
    {
      title: 'Story title',
      description:
        'All your assets available within your desktop, quickly access your assets on any parachain or solochain with a few clicks',
      image: 'https://cdn.elearningindustry.com/wp-content/uploads/2023/01/Pocket-Guide-For-Onboarding-New-Hires.jpg',
    },
  ];
  activeStory = 0;

  onSkip() {
    this.$router.push(Components.Welcome);
  }

  onContinue() {
    this.activeStory += 1;
  }
  async mounted() {
    // this.stories = onboardingMocks[this.$i18n.locale] ?? onboardingMocks['en-EN'];
  }
}
</script>

<style lang="scss" scoped>
.onboarding {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  align-items: center;
  height: 100%;
}
.controls {
  display: flex;
  flex-flow: row nowrap;
  gap: 5px;
  width: 100%;
  .button__continue {
    flex-grow: 2;
  }
}
</style>
