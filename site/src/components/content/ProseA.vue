<script setup lang="ts">
import { computed, type PropType } from 'vue'

const { href, target } = defineProps({
  href: {
    type: String,
    default: ''
  },
  target: {
    type: String as PropType<'_blank' | '_parent' | '_self' | '_top' | (string & {}) | null | undefined>,
    default: undefined,
    required: false
  }
})

const smartTarget = computed(() => {
  if (target) {
    return target
  }
  if (href.startsWith('http')) {
    return '_blank'
  }
  return undefined
})
</script>

<template>
  <NuxtLink :href="href" :target="smartTarget">
    <slot />
  </NuxtLink>
</template>