<template>
  <div class="auth-content" width="100%">
    <div class="row">
      <button type="button" class="row-content" :disabled="props.disabled" @click="onOpenDetails">
        <span class="col">
          <ExternalLogo :name="faviconURl" :alt="t('common.favicon')" />

          <span class="auth-item-name">{{ stripedUrl }}</span>
        </span>

        <span class="authorized-account__count">{{ authAccounts }}</span>
      </button>

      <button
        type="button"
        class="remove-connection"
        :disabled="props.disabled"
        :aria-label="`${t('common.delete')} ${stripedUrl}`"
        @click="onRemoveAuth"
      >
        <Icon className="trash row-controls" icon="trash" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { stripUrl } from '@/extension/background/extension-base/src/background/helpers';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{
  url: string;
  authorizedAccounts: string[];
  disabled?: boolean;
}>();
const emits = defineEmits(['openAuthDetails', 'remove']);
const { t, tc } = useI18n();

const stripedUrl = computed(() => stripUrl(props.url));

const faviconURl = computed(() => {
  const host = new URL(props.url).host;

  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
});

const authAccounts = computed(() => {
  const authListLength = props.authorizedAccounts.length;

  return tc('authorize.accountCount', authListLength, { count: authListLength });
});

const onRemoveAuth = () => {
  if (!props.disabled) emits('remove', stripedUrl.value);
};
const onOpenDetails = () => {
  if (!props.disabled) emits('openAuthDetails', stripedUrl.value);
};
</script>

<style lang="scss" scoped>
.divider {
  background-color: $default-background-color;
  margin: 17px 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;

  &-content {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    text-align: left;
  }
}

button {
  min-height: 44px;
  border: 0;
  padding: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
  &:focus-visible {
    outline: 2px solid palette(white, var(--fw-focus));
    outline-offset: -2px;
  }
}
.remove-connection {
  min-width: 44px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.auth-item-name {
  font-size: 1em;
  overflow-wrap: anywhere;
}

.auth-content {
  cursor: pointer;
  padding: 16px 0;
  border-bottom: $default-border;
}

.authorized-account__count {
  overflow-wrap: anywhere;
  color: rgba(0, 238, 119, 1);
}

.trash {
  height: 16px;
  width: 16px;
}
.icon-duck {
  display: inline-block;
  width: 24px;
  height: 24px;
}
.col {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
</style>
