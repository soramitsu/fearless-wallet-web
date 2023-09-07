<template>
  <ExternalLogo :name="faviconURl" alt="favicon" :width="width" />
</template>

<script lang="ts" setup>
import { computed } from 'vue';

const { url } = defineProps<{ url: string; width?: string }>();

const faviconURl = computed(() => {
  const host = new URL(url).host;

  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
});
</script>
