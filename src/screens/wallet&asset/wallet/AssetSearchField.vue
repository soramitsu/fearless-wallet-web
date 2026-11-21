<template>
  <!-- Always on screen above the list: it finds tokens by symbol or name and networks by name. -->
  <SearchInput
    class="asset-search"
    :class="{ 'asset-search--filled': Boolean(value) }"
    :value="value"
    width="100%"
    placeholder="walletHome.toolbar.searchPlaceholder"
    @change="emit('change', $event)"
  />
</template>

<script setup lang="ts">
defineProps<{ value: string }>();

const emit = defineEmits<{ (event: 'change', value: string): void }>();
</script>

<style lang="scss" scoped>
.asset-search {
  width: 100%;

  // The field says what it finds inside it, as a placeholder would, and steps aside once something is typed. It stays
  // the field's label for screen readers either way.
  :deep(.s-placeholder) {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 42px;
    z-index: 1;
    display: flex;
    align-items: center;
    margin: 0;
    color: var(--fw-text-2) !important;
    font-weight: 400;
    pointer-events: none;
  }
}

.asset-search--filled :deep(.s-placeholder) {
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
