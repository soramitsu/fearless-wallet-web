<script setup lang="ts">
import { type Link } from '~/lib/constants/types'
defineProps<{ content: (string | Link)[] }>()
</script>

<template>
  <template v-for="item in content">
    <template v-if="typeof item === 'string'">{{ item }}</template>
    <template v-else>
      <NuxtLink :href="item.href" :target="item.href.startsWith('https://') ? '_blank' : undefined">
        {{ item.title }}
      </NuxtLink>
    </template>
  </template>
</template>