<template>
  <div class="onboarding">
    <template v-if="showStartingScreen">
      <link v-for="(story, index) in stories" rel="preload" as="image" :href="story.image" :key="index" />
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
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import OnboardingStory from './OnboardingStory.vue';
import StoryCounter from './StoryCounter.vue';
import type { OnboardingStories } from '@/interfaces';
import { Components } from '@/router/routes';
import { getOnboardingStories, setOnboardingComplete } from '@/extension/messaging';

defineOptions({
  name: 'Onboarding',
});

const router = useRouter();
const { locale } = useI18n();

const title = {
  first: 'The DeFi Wallet for the',
  last: 'Future',
} as const;

const stories = ref<OnboardingStories>([]);
const showStartingScreen = ref(true);
const activeStory = ref(1);

const storiesLength = computed(() => stories.value.length);
const showSkip = computed(() => !showStartingScreen.value);
const buttonText = computed(() => (showStartingScreen.value ? 'common.start' : 'common.next'));
const currentStory = computed(() => stories.value[activeStory.value - 1]);

const loadStories = async () => {
  const fetchedStories = await getOnboardingStories(locale.value);

  stories.value = fetchedStories;

  if (fetchedStories.length === 0) router.back();
};

const completeOnboarding = () => {
  setOnboardingComplete();
  router.push({ name: Components.Wallet });
};

const onSkip = () => {
  completeOnboarding();
};

const onContinue = () => {
  if (showStartingScreen.value) {
    showStartingScreen.value = false;
  } else if (storiesLength.value === activeStory.value) {
    completeOnboarding();
  } else {
    activeStory.value += 1;
  }
};

onMounted(() => {
  loadStories();
});
</script>

<style lang="scss" scoped>
.onboarding {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  align-items: center;
  height: 100%;

  &__logo {
    width: 100%;
  }

  &__header {
    font-family: 'Sora', sans-serif;
    font-size: 2.875em;
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
    gap: 10px;
    width: 100%;

    .button-main {
      flex-grow: 2;
    }
  }
}
</style>
