<script setup lang="ts">
import { computed, useRuntimeConfig } from '#imports'

const props = defineProps<{ id?: string }>()

const { headings } = useRuntimeConfig().public.mdc
const generate = computed(() => props.id && ((typeof headings?.anchorLinks === 'boolean' && headings?.anchorLinks === true) || (typeof headings?.anchorLinks === 'object' && headings?.anchorLinks?.h6)))
</script>

<template>
  <h6 :id="id">
    <slot />
    <a v-if="id && generate" :href="`#${id}`" class="anchor">🔗</a>
  </h6>
</template>

<style scoped>
h6>.anchor {
  display: none;
}

@media (hover:hover) {
  h6 {
    position: relative;
  }

  h6>.anchor {
    position: absolute;
    display: inline-block;
    top: 0;
    left: 0;
    transform: translateX(-85%) scale(0.75);
    transform-origin: right;
    opacity: 0;
    visibility: hidden;
    transition: opacity .3s ease, visibility .3s ease, transform .3s ease;
    padding-right: .75em;
  }

  h6:hover>.anchor {
    opacity: 1;
    visibility: visible;
    transform: translateX(-100%) scale(0.75);
  }
}
</style>