<script setup lang="ts">
const { title, href, icon, external } = defineProps<{
  title: string
  href: string
  icon?: string
  external?: boolean
}>()
</script>

<template>
  <NuxtLink :href="href" class="banner outline-block rounded-s p-m bold" :target="external ? '_blank' : undefined">
    <div class="title">
      {{ title }}
    </div>
    <img :src="`/icons/${icon || external ? 'arrow' : 'arrow-right'}.svg`" :alt="`${icon} icon`" class="icon">
  </NuxtLink>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-m);
  transition: border .3s ease;
}

.banner>.title {
  flex: 1;
}

.icon {
  width: 1em;
  height: 1em;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, .6);
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0;
}

@media (hover: hover) {
  .banner:hover {
    border: 1px solid rgba(255, 255, 255, 0.25);
  }
}
</style>