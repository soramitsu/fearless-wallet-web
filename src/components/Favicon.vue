<template>
  <ExternalLogo :name="faviconURl" :alt="t('common.favicon')" :width="width" />
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from '@/locales/useI18n';

const { url } = defineProps<{ url: string; width?: number }>();
const { t } = useI18n();

const faviconURl = computed(() => {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return '';
    return `https://icons.duckduckgo.com/ip3/${parsed.hostname}.ico`;
  } catch {
    return '';
  }
});
</script>
