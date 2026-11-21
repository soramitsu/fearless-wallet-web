<template>
  <aside class="layout-note" role="status" data-testid="portfolioLayoutNote">
    <strong class="note-title">{{ t('walletHome.layoutNote.title') }}</strong>
    <span class="note-description">{{ t('walletHome.layoutNote.description') }}</span>
    <span v-if="customOrderKept" class="note-description" data-testid="customOrderKept">
      {{ t('portfolioPage.layoutNote.customOrderKept') }}
    </span>

    <div class="note-actions">
      <button type="button" class="note-action" data-testid="layoutNoteDismiss" @click="$emit('dismiss')">
        {{ t('walletHome.layoutNote.gotIt') }}
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useI18n } from '@/locales/useI18n';

defineProps<{ customOrderKept?: boolean }>();

defineEmits<{ (event: 'dismiss'): void }>();

const { t } = useI18n();
</script>

<style lang="scss" scoped>
.layout-note {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 16px 10px 0;
  padding: 12px;
  border: 1px solid $fw-accent-edge;
  border-radius: $default-border-radius;
  background: $pink-purple-color;
  text-align: left;
}

.note-title {
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}

.note-description {
  color: $grayish-white;
  font-size: 0.72rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.note-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.note-action {
  border: 0;
  border-radius: 14px;
  padding: 6px 12px;
  background: $pink-lavender-color;
  color: #111;
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;

  &:focus-visible {
    outline: 2px solid palette($plain-white, var(--fw-focus));
    outline-offset: 2px;
  }
}
</style>
