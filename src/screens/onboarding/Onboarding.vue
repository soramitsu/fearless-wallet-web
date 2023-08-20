<template>
  <Fragment>
    <div class="onboarding">
      <OnboardingStory v-if="currentStory" :story="currentStory" />

      <StoryCounter :count="storiesLength" :activeIndex="activeStory" />

      <div class="controls">
        <BorderButton text="Skip" @click="onSkip" />
        <Button class="button__continue" text="Next" @click="onContinue" />
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
import { getOnboardingStories, setOnboardingSeen } from '@/extension/messaging';

@Component({
  components: {
    OnboardingStory,
    StoryCounter,
  },
})
export default class Onboarding extends Vue {
  stories: OnboardingStories = [];
  activeStory = 1;

  get storiesLength() {
    return this.stories.length;
  }

  get currentStory() {
    return this.stories[this.activeStory - 1];
  }

  async mounted() {
    const { stories, userType } = await getOnboardingStories();

    const fallbackLocale = this.$i18n.fallbackLocale.toString();
    const currentLocale = this.$i18n.locale;

    const localizedStories = stories[currentLocale] ?? stories[fallbackLocale];

    this.stories = localizedStories[userType];
  }

  onSkip() {
    this.completeOnboarding();
  }

  onContinue() {
    if (this.storiesLength === this.activeStory - 1) {
      this.completeOnboarding();

      return;
    }

    this.activeStory += 1;
  }

  completeOnboarding() {
    setOnboardingSeen();
    this.$router.push(Components.Welcome);
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
