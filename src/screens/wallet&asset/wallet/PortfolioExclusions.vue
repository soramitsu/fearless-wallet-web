<template>
  <footer v-if="hiddenCount || unpricedCount || poolStakesExcluded" class="portfolio-exclusions" data-testid="portfolioExclusions">
    <button v-if="hiddenCount" class="exclusion manage-link" type="button" data-testid="hiddenNotIncluded" @click="$emit('manageHidden')">
      {{ tc('portfolioPage.hiddenNotIncluded', hiddenCount, { count: hiddenCount }) }}
    </button>
    <span v-if="unpricedCount" class="exclusion" data-testid="unpricedNotIncluded">
      {{ tc('portfolioPage.unpricedNotIncluded', unpricedCount, { count: unpricedCount }) }}
    </span>
    <span v-if="poolStakesExcluded" class="exclusion" data-testid="poolStakesNotIncluded">
      {{ t('portfolioPage.poolStakesNotIncluded') }}
    </span>
  </footer>
</template>

<script setup lang="ts">
import { useI18n } from '@/locales/useI18n';

defineProps<{
  hiddenCount: number;
  unpricedCount: number;
  poolStakesExcluded: boolean;
}>();

defineEmits<{ (event: 'manageHidden'): void }>();

const { t, tc } = useI18n();
</script>

<style lang="scss" scoped>
.portfolio-exclusions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px 16px 8px 0;
  color: $gray-color;
  font-size: 0.72rem;
  line-height: 1.35;
}

.exclusion {
  overflow-wrap: anywhere;
}

.manage-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: $pink-lavender-color;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid $pink-lavender-color;
    outline-offset: 2px;
  }
}
</style>
