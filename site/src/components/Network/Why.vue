<script setup lang="ts">
defineProps<{
  fullName: string
}>()

const data = [{
  title: 'Security',
  description: 'High level of protection for your assets',
  icon: 'shield'
}, {
  title: 'Scam Protection',
  description: 'Our scam warning feature alerts you to fraudulent activities',
  icon: 'networks'
}, {
  title: 'Convenience',
  description: 'Easily access and manage all of your assets within a single app',
  icon: 'lock'
}, {
  title: 'User-Friendly Interface',
  description: 'Simple and intuitive design for users of all levels',
  icon: 'star'
},]
</script>

<template>
  <section class="w px-3xs">
    <div class="rounded-s grid">
      <h2 class="p-xl text-center bg-block">
        <span class="color-accent">Why Fearless Wallet</span> is the Best Wallet for {{ fullName }}
      </h2>
      <div v-for="item in data" class="p-l bg-block">
        <div class="icon mb-m">
          <img :src="`/icons/${item.icon}.svg`" :alt="`${item.icon} icon`">
        </div>
        <h3 class="text-m mb-xxs">{{ item.title }}</h3>
        <p class="text-xs color-secondary">{{ item.description }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.grid {
  display: grid;
  gap: 1px;
  overflow: hidden;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.grid>h2 {
  grid-column-start: 1;
  grid-column-end: -1;
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
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>