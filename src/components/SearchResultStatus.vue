<template>
  <span class="search-result-status" role="status" aria-live="polite" aria-atomic="true" data-testid="searchResultStatus">
    {{ announcedCount === null ? '' : `${$t(label)}: ${announcedCount}` }}
  </span>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ label: string; count?: number | null; active?: boolean }>(), {
  count: null,
  active: true,
});
const announcedCount = ref<number | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

watch(() => [props.count, props.active], () => {
  clearTimeout(timer);
  if (!props.active || props.count === null || !Number.isSafeInteger(props.count) || props.count < 0) {
    announcedCount.value = null;
    return;
  }
  // Wait for the final filter result instead of announcing each intermediate keystroke.
  timer = setTimeout(() => { announcedCount.value = props.count; }, 200);
}, { immediate: true });

onBeforeUnmount(() => clearTimeout(timer));
</script>

<style scoped>
.search-result-status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
