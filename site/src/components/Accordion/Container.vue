<template>
  <div class="accordion">
    <slot />
  </div>
</template>

<style scoped>
.accordion {
  display: grid;
  gap: var(--space-xs);
}
</style>