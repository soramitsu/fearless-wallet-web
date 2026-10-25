<template>
  <!-- Above the whole popup: the wallet screen clips and scrolls, a sheet inside it would be cut off. -->
  <Teleport to="body">
    <div class="sheet-backdrop" data-testid="portfolioSheetBackdrop" @click.self="close">
      <section
        ref="dialog"
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        :data-testid="testid"
        @keydown="onKeydown"
      >
        <header class="sheet-header">
          <h2 :id="titleId" class="sheet-title">{{ title }}</h2>
          <button type="button" class="sheet-close" :aria-label="t('common.close')" data-testid="portfolioSheetClose" @click="close">
            <Icon icon="close" width="20px" height="20px" :hover="false" />
          </button>
        </header>

        <div class="sheet-body">
          <slot />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useModalFocus } from '@/components/useModalFocus';
import { useI18n } from '@/locales/useI18n';

defineProps<{ title: string; testid?: string }>();

const emit = defineEmits<{ (event: 'close'): void }>();

const { t } = useI18n();
const dialog = ref<HTMLElement | null>(null);
const titleId = `portfolio-sheet-${Math.random().toString(36).slice(2, 8)}`;

const close = () => emit('close');

// Focus moves into the sheet, stays there while it is open, and returns to the control that opened it.
const onKeydown = useModalFocus(
  dialog,
  () => true,
  () => {
    close();

    return true;
  }
);
</script>

<style lang="scss" scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
  background: var(--fw-scrim);
  @include fw-scrim-tiers;
}

.sheet {
  width: min(100%, 480px);
  max-height: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--fw-stroke-strong);
  border-radius: 16px;
  // A sheet over the page is opaque raised paint (design-system 3.2).
  background: var(--fw-raised);
  box-shadow: 0 12px 40px var(--fw-scrim);
  // Teleported out of the app: set what the app would otherwise pass down.
  color: var(--fw-text-1);
  font-family: var(--s-font-family-default, inherit);
  text-align: left;

  &:focus {
    outline: none;
  }
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sheet-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.sheet-close {
  flex: none;
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--fw-text-2);
  cursor: pointer;
}

.sheet-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 0.8rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
</style>
