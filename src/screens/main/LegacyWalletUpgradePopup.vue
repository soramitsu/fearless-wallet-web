<template>
  <dialog
    ref="dialog"
    class="wallet-upgrade"
    :lang="noticeLocale === 'ru-RU' ? 'ru' : 'en'"
    aria-labelledby="wallet-upgrade-title"
    aria-describedby="wallet-upgrade-description"
    @cancel.prevent="emit('dismiss')"
  >
    <div class="wallet-upgrade__heading">
      <div class="wallet-upgrade__label">
        <Icon icon="wallet" width="20px" height="20px" :hover="false" />
        {{ t('label') }}
      </div>
      <button type="button" class="wallet-upgrade__close" :aria-label="t('close')" @click="emit('dismiss')">
        <Icon icon="close" width="20px" height="20px" :hover="false" />
      </button>
    </div>

    <h1 id="wallet-upgrade-title" ref="title" tabindex="-1">{{ t('title') }}</h1>
    <p id="wallet-upgrade-description" class="wallet-upgrade__description">{{ t('description') }}</p>

    <ol class="wallet-upgrade__steps">
      <li v-for="(step, index) in steps" :key="step">
        <span class="wallet-upgrade__number" aria-hidden="true">{{ index + 1 }}</span>
        <div>
          <h2>{{ t(`${step}Title`) }}</h2>
          <p>{{ t(`${step}Description`) }}</p>
        </div>
      </li>
    </ol>

    <p class="wallet-upgrade__note">{{ t('note') }}</p>

    <div class="wallet-upgrade__actions">
      <p v-if="navigationError" class="wallet-upgrade__error" role="alert">{{ t('navigationError') }}</p>
      <button
        type="button"
        class="wallet-upgrade__create"
        :disabled="opening"
        :aria-busy="opening"
        @click="emit('create')"
      >{{ t(opening ? 'opening' : 'create') }}</button>
      <button type="button" class="wallet-upgrade__later" @click="emit('dismiss')">{{ t('later') }}</button>
    </div>
  </dialog>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Icon from '@/components/Icon.vue';
import { legacyWalletUpgradeMessages } from '@/locales/legacyWalletUpgrade';

withDefaults(defineProps<{ opening?: boolean; navigationError?: boolean }>(), {
  opening: false,
  navigationError: false,
});
const emit = defineEmits<{ dismiss: []; create: [] }>();
const { locale: appLocale } = useI18n({ useScope: 'global' });
const { t, locale: noticeLocale } = useI18n({
  useScope: 'local',
  inheritLocale: false,
  locale: appLocale.value === 'ru-RU' ? 'ru-RU' : 'en-EN',
  messages: legacyWalletUpgradeMessages,
  fallbackLocale: 'en-EN',
  fallbackWarn: false,
  missingWarn: false,
});
watch(appLocale, (locale) => { noticeLocale.value = locale === 'ru-RU' ? 'ru-RU' : 'en-EN'; });
const steps = ['create', 'backup', 'transfer'] as const;
const dialog = ref<HTMLDialogElement>();
const title = ref<HTMLElement>();

onMounted(() => {
  // Native modal behavior traps focus, makes the portfolio inert, and restores
  // the previous focus when closed. Focus the heading before either action.
  dialog.value?.showModal();
  title.value?.focus();
});
const close = () => dialog.value?.close();
onBeforeUnmount(close);
onDeactivated(close);
</script>

<style lang="scss" scoped>
.wallet-upgrade {
  box-sizing: border-box;
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  margin: auto;
  padding: 20px 24px 12px;
  overflow-y: auto;
  border: 1px solid $fw-strong-edge;
  border-radius: 16px;
  background: $fw-panel-surface;
  color: $plain-white;
  font-family: var(--s-font-family-default);
  &:lang(ru) {
    font-family: system-ui, sans-serif;
    .wallet-upgrade__steps { margin: 16px 0 14px; gap: 12px; }
    .wallet-upgrade__actions { margin-top: 12px; }
  }
  text-align: left;
  box-shadow: 0 20px 64px var(--fw-scrim);

  &[open] {
    animation: wallet-upgrade-enter 180ms ease-out;
  }

  &::backdrop {
    background: var(--fw-scrim);
    backdrop-filter: blur(5px);
  }

  &__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: -8px -12px 2px 0;
  }

  &__label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: $pink-lavender-color;
    font-size: 12px;
    font-weight: 600;
  }

  button {
    appearance: none;
    border: 0;
    font: inherit;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;

    &:focus-visible {
      outline: 2px solid var(--fw-focus);
      outline-offset: 3px;
    }
  }

  &__close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 50%;
    background: transparent;
    color: $grayish-white;

    &:hover { background: $default-background-color; }
  }

  h1 {
    margin: 0 0 10px;
    outline: none;
    font-size: 24px;
    font-weight: 650;
    line-height: 1.25;
    letter-spacing: -0.6px;
  }

  p { margin: 0; }

  &__description {
    color: $grayish-white;
    font-size: 13px;
    line-height: 1.55;
  }

  &__steps {
    display: grid;
    gap: 14px;
    list-style: none;
    margin: 22px 0 18px;
    padding: 0;

    li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    h2 {
      margin: 0 0 3px;
      font-size: 13px;
      line-height: 1.4;
      font-weight: 600;
    }

    p {
      color: $grayish-white;
      font-size: 12px;
      line-height: 1.5;
    }
  }

  &__number {
    display: grid;
    place-items: center;
    flex: 0 0 28px;
    height: 28px;
    border: 1px solid $fw-accent-edge;
    border-radius: 50%;
    color: $pink-lavender-color;
    font-size: 12px;
    font-weight: 600;
  }

  &__note {
    padding-top: 14px;
    border-top: $default-border;
    color: $grayish-white;
    font-size: 11px;
    line-height: 1.55;
  }

  &__actions {
    display: grid;
    gap: 4px;
    margin-top: 18px;

    button {
      min-height: 44px;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
    }
  }

  &__create {
    background: $fw-primary-fill;
    color: $fw-on-accent;

    &:hover { background: $fw-secondary-hover; }
    &:disabled { opacity: 0.65; cursor: wait; }
  }

  &__error {
    padding-bottom: 8px;
    color: $reject-color;
    font-size: 12px;
    line-height: 1.5;
  }

  &__later {
    background: transparent;
    color: $grayish-white;

    &:hover { background: $secondary-background-color; }
  }

  @media (prefers-reduced-motion: reduce) {
    &[open] { animation: none; }
    button { transition: none; }
  }
}

@keyframes wallet-upgrade-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
