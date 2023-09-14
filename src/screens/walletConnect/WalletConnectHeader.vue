<template>
  <Fragment>
    <Favicon :url="url" width="80" class="auth-favicon" />
    <div class="header">{{ title }}</div>
  </Fragment>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Fragment } from 'vue-fragment';
import Favicon from '@/components/Favicon.vue';

const props = withDefaults(defineProps<{ url: string; name: string; isTx: boolean }>(), {
  isTx: false,
});

const title = computed(() => {
  if (props.isTx) return props.name;

  return `Connected to ${props.name}`;
});
</script>

<style scoped lang="scss">
.auth-favicon {
  margin: 30px;
}
.header {
  font-size: 22px;
  font-weight: 800px;
}
</style>
