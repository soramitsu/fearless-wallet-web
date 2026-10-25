<script setup lang="ts">
import { networks } from './networks'

const searchTerm = ref('')

const filteredNetworks = computed(() => {
  return networks.filter(network =>
    network.fullName.toLowerCase().includes(searchTerm.value.toLowerCase())
  )
})
</script>

<template>
  <div class="search">
    <input v-model="searchTerm" placeholder="Search supported networks" class="input text-xs rounded-xs" />
    <div class="list p-3xs rounded-xs text-xs">
      <ul v-if="filteredNetworks.length">
        <li v-for="network in filteredNetworks" :key="network.fullName">
          <template v-if="network.slug">
            <NuxtLink v-if="network.slug" :to="`/${network.slug}-wallet`" class="rounded-xs">
              <span class="icon"><img :src="network.icon" alt="Network logo" loading="lazy" /></span>
              <span class="name">{{ network.fullName }}</span>
              <img :src="`/icons/arrow-right-inverse.svg`" :alt="`arrow`" loading="lazy" class="arrow" />
            </NuxtLink>
          </template>
          <template v-else>
            <div>
              <span class="icon"><img :src="network.icon" alt="Network logo" loading="lazy" /></span>
              <span class="name">{{ network.fullName }}</span>
            </div>
          </template>
        </li>
      </ul>
      <p v-else class="text-center p-4xs">No networks found :-(</p>
    </div>
  </div>
</template>

<style scoped>
.search {
  max-width: 42rem;
  position: relative;
}

.input {
  padding: var(--space-xs) var(--space-l) var(--space-xs) var(--space-xs);
  border: none;
  width: 100%;
  color: var(--color-text-primary);
  background-color: rgba(0, 0, 0, .75);
  backdrop-filter: blur(10px);
  background-image: url('/icons/search.svg');
  background-size: 1.2em;
  background-repeat: no-repeat;
  background-position: 96% center;
}

.list {
  background-color: #fff;
  color: #000;
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  max-height: 24rem;
  overflow-y: auto;
  box-shadow: 0px 1rem 3rem 0 rgba(0, 0, 0, 0.50);
  visibility: hidden;
  opacity: 0;
  transform: scaleY(1.02) translateY(.4rem);
  transform-origin: top center;
  transition: opacity .3s ease, visibility .3s ease, transform .3s ease;
}

.list ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
}

.list li div,
.list li a {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-3xs);
}

.list li a {
  transition: background-color .3s ease;
}

.list .icon {
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  position: relative;
  overflow: hidden;
}

.list .icon img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.list .name {
  flex: 1;
  text-align: left;
}

.list .arrow {
  opacity: 0.25;
  width: 1em;
  height: 1em;
  transition: transform .3s ease, opacity .3s ease;
}

.search:has(.input:focus) .list,
.list:hover {
  visibility: visible;
  opacity: 1;
  transform: scaleY(1);
}

@media (hover: hover) {
  .list li a:hover {
    background-color: #f2f2f2;
  }

  .list li a:hover .arrow {
    transform: translateX(-0.3em);
    opacity: 1;
  }
}
</style>