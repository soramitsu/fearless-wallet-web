<template>
  <Fragment>
    <div class="onboarding">
      <template v-if="showStartingScreen">
        <img class="onboarding__logo" src="@/assets/fearless-logo-animated.gif" alt="fearless-logo" />
        <h1 class="onboarding__header">
          {{ title.first }} <span class="onboarding__header--red">{{ title.last }}</span>
        </h1>
      </template>

      <template v-else>
        <OnboardingStory :story="currentStory" />

        <StoryCounter :count="storiesLength" :activeIndex="activeStory" />
      </template>

      <div class="onboarding__controls">
        <BorderButton v-show="showSkip" text="common.skip" size="big" @click="onSkip" />
        <Button class="button-main" size="big" :text="buttonText" @click="onContinue" />
      </div>
    </div>
  </Fragment>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import OnboardingStory from './OnboardingStory.vue';
import StoryCounter from './StoryCounter.vue';
import type { OnboardingStories } from '@/interfaces';
import { Components } from '@/router/routes';
import { getOnboardingStories, setOnboardingSeen } from '@/extension/messaging';

@Component({
  components: {
    OnboardingStory,
    StoryCounter,
  },
})
export default class Onboarding extends Vue {
  readonly title = {
    first: 'The DeFi Wallet for the',
    last: 'Future',
  };
  stories: OnboardingStories = [];
  showStartingScreen = true;
  activeStory = 1;

  get storiesLength() {
    return this.stories.length;
  }

  get showSkip() {
    return !this.showStartingScreen;
  }

  get buttonText() {
    if (this.showStartingScreen) return 'common.start';

    return 'common.next';
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
    if (this.showStartingScreen) {
      this.showStartingScreen = false;

      return;
    }

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
  gap: 30px;

  &__logo {
    width: 100%;
  }

  &__header {
    font-size: 46px;
    font-weight: 700;
    letter-spacing: 0.54px;
    margin: 0;

    &--red {
      color: $pink-color;
    }
  }

  &__controls {
    display: flex;
    flex-flow: row nowrap;
    gap: 5px;
    width: 100%;

    .button-main {
      flex-grow: 2;
    }
  }
}
</style>
