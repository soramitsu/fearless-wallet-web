<template>
    <div class="onboarding" :class="{ 'onboarding--start': showStartingScreen }">
      <template v-if="showStartingScreen">
        <link v-for="(story, index) in stories" rel="preload" as="image" :href="story.image" :key="index" />
        <WelcomeHero />
        <div class="onboarding__brand">
          <img class="onboarding__logo" src="@/assets/brand/fearless-lockup-stacked.svg" :alt="$t('common.fearlessLogo')" />
          <BrandSignature as="h1" animated :text="`${$t('onboarding.titleFirst')} ${$t('onboarding.titleLast')}`" />
        </div>
      </template>

      <template v-else>
        <OnboardingStory :story="currentStory" />

        <StoryCounter :count="storiesLength" :activeIndex="activeStory" />
      </template>

      <div class="onboarding__controls">
        <FButton
          v-show="showSkip"
          text="common.skip"
          type="secondary"
          :border="false"
          size="big"
          data-testid="skipBtn"
          @click="onSkip"
        />
        <FButton class="button-main" size="big" :text="buttonText" data-testid="continueBtn" @click="onContinue" />
      </div>
      <RecoveryDataLink />
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import OnboardingStory from './OnboardingStory.vue';
import StoryCounter from './StoryCounter.vue';
import RecoveryDataLink from '@/components/RecoveryDataLink.vue';
import BrandSignature from '@/components/BrandSignature.vue';
import WelcomeHero from '@/components/WelcomeHero.vue';
import { Components } from '@/router/routes';
import { getOnboardingStories, setOnboardingComplete } from '@/extension/messaging';

export default defineComponent({
  name: 'Onboarding',
  components: {
    OnboardingStory,
    StoryCounter,
    RecoveryDataLink,
    BrandSignature,
    WelcomeHero,
  },
  data() {
    return {
      stories: [],
      showStartingScreen: true,
      activeStory: 1,
    };
  },
  computed: {
    storiesLength() {
      return this.stories.length;
    },
    showSkip() {
      return !this.showStartingScreen;
    },
    buttonText() {
      if (this.showStartingScreen) return 'common.start';

      return 'common.next';
    },
    currentStory() {
      return this.stories[this.activeStory - 1];
    },
  },
  async mounted() {
    const stories = await getOnboardingStories(this.$i18n.locale);

    this.stories = stories;

    if (stories.length === 0) this.$router.back();
  },
  methods: {
    onSkip() {
      this.completeOnboarding();
    },
    onContinue() {
      if (this.showStartingScreen) this.showStartingScreen = false;
      else if (this.storiesLength === this.activeStory) this.completeOnboarding();
      else this.activeStory += 1;
    },
    completeOnboarding() {
      setOnboardingComplete();

      this.$router.push({ name: Components.Wallet });
    },
  },
});
</script>

<style lang="scss" scoped>
.onboarding {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  min-width: 0;
  overflow-y: auto;
  overflow-wrap: anywhere;

  > * {
    flex-shrink: 0;
    min-width: 0;
    max-width: 100%;
  }

  // The start screen sits over the Yatagarasu hero: the crow fills the top, the lockup and actions the dark lower part.
  &--start {
    position: relative;
    isolation: isolate;
    justify-content: flex-end;

    > :not(.welcome-hero) {
      position: relative;
      z-index: 1;
    }
  }

  &__brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: auto;
  }

  &__logo {
    display: block;
    width: 168px;
    max-width: 60%;
    height: auto;
  }

  &--start &__controls {
    margin-top: 20px;
  }

  &__controls {
    display: flex;
    flex-flow: row wrap;
    gap: 10px;
    width: 100%;

    .button-main {
      flex-grow: 2;
    }

    > * {
      min-width: 0;
      flex: 1 1 120px;
    }
  }
}
</style>
