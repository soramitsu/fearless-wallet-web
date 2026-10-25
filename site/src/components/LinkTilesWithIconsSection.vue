<script setup lang="ts">
type Link = {
  icon: string
  title: string
  description: string
  href: string
  internal?: boolean
}

defineProps<{ links: Link[], columns?: 2 | 3 }>()
</script>

<template>
  <section class="w px-3xs grid" :style="`--cols: ${columns || 2}`">
    <NuxtLink v-for="link in links" :key="link.title" class="bg-block rounded-s p-l link" :href="link.href"
      :target="link.internal ? undefined : '_blank'">
      <div class="head">
        <div class="icon">
          <img :src="`/icons/${link.icon}.svg`" :alt="`${link.icon} icon`">
        </div>
        <h2 class="text-m">
          {{ link.title }}
        </h2>
      </div>
      <p class="color-secondary text-s">{{ link.description }}</p>
    </NuxtLink>
  </section>
</template>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-m);
}

.link {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  min-height: 20rem;
  justify-content: space-between;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.head>h2 {
  flex: 1;
}

.icon {
  width: var(--space-xl);
  height: var(--space-xl);
  border-radius: 50%;
  background-color: rgba(0, 0, 0, .6);
  display: flex;
  justify-content: center;
  align-items: center;
}

.icon img {
  width: 50%;
  height: 50%;
}

@media (min-width: 800px) {
  .grid {
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-auto-rows: 1fr;
  }
}

@media (hover:hover) {
  .link {
    transition: background-color .3s ease;
  }

  .link:hover {
    background-color: rgba(255, 255, 255, .1);
  }
}
</style>