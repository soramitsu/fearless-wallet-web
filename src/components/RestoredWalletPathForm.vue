<template>
  <form class="restored-path" data-testid="restoredWalletPathForm" @submit.prevent="submit">
    <template v-if="showIntro">
      <p class="restored-path__title">{{ t('restoreTitle') }}</p>
      <p class="restored-path__description">{{ t('restoreDescription') }}</p>
    </template>
    <label class="restored-path__field">
      <span>{{ t('pathLabel') }}</span>
      <input
        v-model="derivationPath"
        type="password"
        autocomplete="off"
        spellcheck="false"
        :placeholder="t('pathPlaceholder')"
        :readonly="busy"
        data-testid="restoredWalletPath"
      />
    </label>
    <p v-if="error" class="restored-path__error" role="alert">{{ t(error) }}</p>
    <div class="restored-path__actions">
      <button
        type="submit"
        class="restored-path__primary"
        :disabled="busy || !derivationPath.trim()"
        :aria-busy="busy"
        data-testid="restoredWalletPathContinue"
      >{{ t(busy ? 'switching' : 'continue') }}</button>
      <button type="button" class="restored-path__secondary" :disabled="busy" data-testid="restoredWalletPathSkip" @click="skip">
        {{ t('skip') }}
      </button>
    </div>
  </form>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { UniversalWalletPasswordStatus } from '@extension-base/background/types/types';
import { addUniversalWalletPasswordPath } from '@/extension/messaging';
import { universalWalletPasswordMessages } from '@/locales/universalWalletPassword';

type MessageKey = keyof (typeof universalWalletPasswordMessages)['en-EN'];

// Asks once, during or after a JSON or Google Drive restore, for the path a wallet's words open its key with.
const props = withDefaults(defineProps<{ address: string; showIntro?: boolean }>(), { showIntro: true });
const emit = defineEmits<{ done: [status: UniversalWalletPasswordStatus]; skip: [] }>();

const { t } = useI18n({
  useScope: 'local',
  inheritLocale: false,
  locale: 'en-EN',
  messages: universalWalletPasswordMessages,
  fallbackLocale: 'en-EN',
  fallbackWarn: false,
  missingWarn: false,
});

const derivationPath = ref('');
const busy = ref(false);
const error = ref<MessageKey | ''>('');
let revision = 0;

const reset = () => {
  revision += 1;
  derivationPath.value = '';
  busy.value = false;
  error.value = '';
};

const submit = async () => {
  if (busy.value || !derivationPath.value.trim()) return;
  const current = revision;
  busy.value = true;
  error.value = '';
  try {
    const result = await addUniversalWalletPasswordPath(props.address, derivationPath.value);

    if (current !== revision) return;
    if ('status' in result) {
      derivationPath.value = '';
      emit('done', result.status);
      return;
    }
    error.value = result.code === 'path_mismatch' ? 'pathMismatch' : 'failed';
  } catch {
    if (current === revision) error.value = 'failed';
  } finally {
    if (current === revision) busy.value = false;
  }
};

const skip = () => {
  if (busy.value) return;
  reset();
  emit('skip');
};

// An answer for an earlier wallet never reaches the next one.
watch(() => props.address, reset);
onBeforeUnmount(reset);
</script>

<style lang="scss" scoped>
.restored-path {
  display: grid;
  gap: 12px;
  width: 100%;
  font-family: var(--s-font-family-default);
  text-align: left;

  &__title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 700;
  }

  &__description,
  &__error {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.45;
  }

  &__error {
    color: var(--fw-danger);
  }

  &__field {
    display: grid;
    gap: 6px;
    font-size: 0.875rem;

    input {
      padding: 10px 12px;
      border: 1px solid var(--fw-divider);
      border-radius: 8px;
      background: var(--fw-raised);
      color: inherit;
      font: inherit;
    }
  }

  &__actions {
    display: grid;
    gap: 8px;
  }

  &__primary,
  &__secondary {
    min-height: 40px;
    border-radius: 20px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;

    &:disabled {
      opacity: 0.65;
      cursor: default;
    }
  }

  &__primary {
    border: 0;
    background: $fw-primary-fill;
    color: $fw-on-accent;

    &:hover:not(:disabled) { background: $fw-secondary-hover; }
  }

  &__secondary {
    border: 1px solid var(--fw-divider);
    background: transparent;
    color: $grayish-white;

    &:hover:not(:disabled) { background: $secondary-background-color; }
  }
}
</style>
