<script setup lang="ts">
const benefits = [
  { icon: 'networks', accent: '80+', subline: ' networks' },
  { icon: 'user', accent: '250k+', subline: ' users' },
  { icon: 'star', accent: '4+', subline: 'rating' },
]

const isTrailerOpen = ref(false)
</script>

<template>
  <section class="o-hidden">
    <div class="w hero">
      <div class="text">
        <h1 class="mb-s">
          Open-Source Universal Wallet
        </h1>
        <p class="color-secondary text-s mb-m">
          One self-custody wallet for browser, iOS, and Android, with one phrase for Bitcoin, Solana, TON, EVM,
          Polkadot, and SORA accounts.
        </p>
        <div class="buttons mb-l">
          <Button href="https://qrcodes.pro/5FVEPa" title="Get extension" icon="desktop" target="_blank" accent />
          <Button href="https://qrcodes.pro/9cSnKW " title="Get mobile app" icon="mobile" target="_blank" accent />
        </div>
        <div class="benefits">
          <div v-for="benefit in benefits" class="text-s px-xs py-xs outline-block rounded-xs">
            <img :src="`/icons/${benefit.icon}.svg`" :alt="`${benefit.icon} icon`" class="icon mb-xxs" />
            <span class="bold color-accent">{{ benefit.accent }}</span><br>
            {{ benefit.subline }}
          </div>
        </div>
      </div>
      <div class="image">
        <HeroVisual class="inner" />
      </div>
      <button class="trailer-button px-s py-xs text-s" @click="isTrailerOpen = true">Trailer</button>
    </div>
    <Modal :open="isTrailerOpen" @close="isTrailerOpen = false">
      <div class="w video">
        <iframe v-if="isTrailerOpen" width="560" height="315"
          src="https://www.youtube-nocookie.com/embed/J0rAxcni6cs?autoplay=1" title="YouTube video player"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin" allowfullscreen class="rounded-s outline-block"
          loading="lazy"></iframe>
      </div>
    </Modal>
  </section>
</template>

<style scoped>
.hero {
  padding-top: var(--space-3xl);
  padding-bottom: var(--space-l);
  position: relative;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3xs);
}

.benefits {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4xs);
}

.icon {
  width: 2.4rem;
  height: 2.4rem;
}

.image {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  pointer-events: none;
  margin: 0 -10% 0 0;
  position: relative;
}

.image .inner {
  height: 110vw;
}

.text {
  padding: 0 0 var(--space-l) 0;
  min-height: 56rem;
}

.text>* {
  padding-left: var(--space-l);
  padding-right: var(--space-l);
}

.trailer-button {
  position: absolute;
  bottom: var(--space-m);
  right: var(--space-xs);
  background-color: rgba(40, 40, 40, .96);
  display: flex;
  gap: var(--space-xs);
  border-radius: var(--space-xl);
  align-items: center;
}

.trailer-button::before {
  content: '';
  background-image: url('/icons/play.svg');
  background-size: contain;
  background-repeat: no-repeat;
  width: 1em;
  height: 1em;
}

.trailer-button {
  transition: background-color 0.3s ease, transform 0.3s ease;
}

.trailer-button:active {
  transform: scale(0.95);
}

.video {
  aspect-ratio: 16 / 9;
  width: 100%;
}

.video>iframe {
  width: 100%;
  height: 100%;
}

@media (hover:hover) {
  .trailer-button:hover {
    background-color: rgba(50, 50, 50, 1);
  }
}

@media (min-width: 800px) {
  .hero {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding-top: var(--space-xxl);
  }

  .text {
    padding: var(--space-xl) var(--space-xs);
  }

  .text>* {
    padding-left: unset;
    padding-right: unset;
  }

  .benefits {
    max-width: 49rem;
  }

  .image {
    align-self: center;
    aspect-ratio: unset;
    margin: 0;
  }

  .image .inner {
    height: 100%;
    min-height: 80rem;
  }
}
</style>
