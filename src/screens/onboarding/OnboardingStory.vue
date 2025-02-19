<template>
  <div class="story">
    <img class="story__image" :src="story.image" alt="story-img" />
    <h2 class="story__title">{{ story.title }}</h2>
    <p class="story__content">{{ story.description }}</p>
  </div>
</template>

<script lang="ts" setup>
import type { OnboardingStory } from '@/interfaces';

defineProps<{ story: OnboardingStory }>();
</script>

<style lang="scss" scoped>
@font-face {
  font-family: 'Unbounded';
  src: local('Unbounded'), url('@/assets/fonts/Unbounded-Bold.ttf') format('truetype');
}

.story {
  display: flex;
  flex-flow: column;
  align-items: center;
  gap: 10px;

  &__image {
    max-height: 330px;
  }

  &__title {
    font-family: Unbounded, sans-serif;
    font-size: 1.5em;
    font-weight: 700;
  }

  &__content {
    max-width: 380px;
    height: 60px;
    flex-shrink: 0;
    font-size: 1em;
    font-style: normal;
    font-weight: 400;
    line-height: normal;
    color: $default-white;
  }
}
</style>
