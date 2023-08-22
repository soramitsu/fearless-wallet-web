<template>
  <div class="story">
    <img :src="story.image" alt="story-img" />
    <h2>{{ story.title }}</h2>
    <p class="story__content">{{ story.description }}</p>
  </div>
</template>
<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import type { OnboardingStory } from '@/interfaces';

@Component({})
export default class OnboardingStoryCard extends Vue {
  @Prop(Object) story!: OnboardingStory;
}
</script>
<style lang="scss">
.story {
  display: flex;
  flex-flow: column;
  align-items: center;
  gap: 20px;

  &__content {
    max-width: 380px;
    height: 60px;
    flex-shrink: 0;
    font-size: 16px;
    font-style: normal;
    font-weight: 400;
    line-height: normal;
    color: $default-white;
  }
}
</style>
