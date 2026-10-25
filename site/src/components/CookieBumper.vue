<script setup lang="ts">
const isVisible = ref(false)

const handleCLick = () => {
  try {
    window.localStorage.cookieMessageAccepted = true
  } catch (e) {
    console.warn('No access to localSotage')
  }
  isVisible.value = false
}

onMounted(() => {
  if (!window?.localStorage?.cookieMessageAccepted) {
    setTimeout(() => isVisible.value = true, 1000)
  }
})
</script>

<template>
  <div class="bumper bg-block p-m text-s rounded-xs" :class="{ visible: isVisible }">
    <p class="text-xs text-center">
      We use only necessary cookies to give you the most relevant experience.
    </p>
    <Button href="/privacy" title="Learn more" small />
    <Button @click="handleCLick" title="Accept" small accent />
  </div>
</template>

<style scoped>
.bumper {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-m) var(--space-3xs);
  backdrop-filter: blur(4rem);
  position: fixed;
  bottom: var(--space-3xs);
  right: var(--space-3xs);
  transition: transform 0.6s ease, opacity 0.6s ease, visibility 0.6s ease;
  transform: translateY(var(--space-m));
  opacity: 0;
  visibility: hidden;
  z-index: 666;
  width: calc(100% - var(--space-3xs) * 2);
  max-width: 46rem;
}

.bumper p {
  grid-column: 1 / -1;
}

.bumper.visible {
  transform: translateY(0);
  opacity: 1;
  visibility: visible;
}
</style>