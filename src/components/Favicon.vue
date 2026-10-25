<template>
  <ExternalLogo :name="faviconURl" :alt="t('common.favicon')" :width="width" />
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from '@/locales/useI18n';

const { url } = defineProps<{ url: string; width?: number }>();
const { t } = useI18n();

const faviconURl = computed(() => {
  const host = new URL(url).host;

  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
});
</script>
