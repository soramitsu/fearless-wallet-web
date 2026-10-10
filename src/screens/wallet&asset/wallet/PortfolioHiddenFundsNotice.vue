<template>
  <aside class="hidden-funds-notice" role="status" data-testid="hiddenFundsNotice">
    <strong class="notice-title">{{ tc('portfolioPage.hiddenFundsNotice', count, { count }) }}</strong>
    <span class="notice-description">{{ t('portfolioPage.hiddenFundsDescription') }}</span>

    <div class="notice-actions">
      <button type="button" class="notice-action" data-testid="reviewHiddenFunds" @click="$emit('review')">
        {{ t('portfolioPage.review') }}
      </button>
      <button type="button" class="notice-action secondary" data-testid="keepHiddenFunds" @click="$emit('keepHidden')">
        {{ t('portfolioPage.keepHidden') }}
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useI18n } from '@/locales/useI18n';

defineProps<{ count: number }>();

defineEmits<{ (event: 'review'): void; (event: 'keepHidden'): void }>();

const { t, tc } = useI18n();
</script>

<style lang="scss" scoped>
.hidden-funds-notice {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 16px 10px 0;
  padding: 12px;
  border: 1px solid rgba(187, 119, 255, 0.45);
  border-radius: $default-border-radius;
  background: $pink-purple-color;
}

.notice-title {
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}

.notice-description {
  color: $grayish-white;
  font-size: 0.72rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.notice-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.notice-action {
  border: 0;
  border-radius: 14px;
  padding: 6px 12px;
  background: $pink-lavender-color;
  color: #111;
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;

  &.secondary {
    background: $default-background-color;
    color: $grayish-white;
  }

  &:focus-visible {
    outline: 2px solid $plain-white;
    outline-offset: 2px;
  }
}
</style>
