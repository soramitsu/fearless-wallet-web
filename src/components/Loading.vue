<template>
  <MirrorLoader class="spinner" :size="width" tone="current" />
</template>

<script lang="ts" setup>
// A small loader inside a line or a control: the mirror's three comets (brand kit v4) in the text colour around it.
import MirrorLoader from '@/components/MirrorLoader.vue';

withDefaults(defineProps<{ width?: number }>(), { width: 21 });
</script>
