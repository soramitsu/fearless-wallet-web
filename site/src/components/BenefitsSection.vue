<script setup lang="ts">
const benefits = [
  {
    title: 'Self-custody',
    description: 'You and only you own your crypto. No access or control over your assets!',
    icon: 'user'
  },
  {
    title: '100% open source',
    description: 'Our website,T&Cs, GitHub repositories, are all accessible within the app—as are roadmap and dev status information on upcoming features.',
    icon: 'github'
  },
  {
    title: 'Encryption',
    description: 'Fearless Wallet ensures top-tier security with up-to-date crypto protocols for Ethereum and Polkadot, providing robust encryption to safeguard your assets.',
    icon: 'lock'
  },
  {
    title: 'Zero tracking',
    description: 'Fearless Wallet generates passwords and keys on your device, so only you have access to your accounts and data.',
    icon: 'fingerprint'
  },
  {
    title: 'Wallet management',
    description: "You can select any wallet controlled by Fearless, and import or create new ones.",
    icon: 'wallet'
  },
]
</script>

<template>
  <section class="w px-3xs">
    <h2 class="text-center px-m w-narrow mb-s">
      <span class="color-accent">Security</span> You Can Trust, <span class="color-accent">Privacy</span> You Control
    </h2>
    <p class="color-secondary text-s text-center px-m w-narrow mb-l">
      Own you funds and data while we take care of your security - fearlessly.
    </p>
    <div class="grid rounded-s o-hidden">
      <div v-for="benefit, i in benefits" :key="benefit.title" class="bg-block p-l benefit"
        :class="{ accent: i === 0 }">
        <div class="head">
          <div class="icon">
            <img :src="`/icons/${benefit.icon}.svg`" :alt="`${benefit.icon} icon`">
          </div>
          <h3 :class="{ 'text-m': i }">
            {{ benefit.title }}
          </h3>
        </div>
        <p class="color-secondary" :class="{ 'text-xs': i }">
          {{ benefit.description }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.grid {
  display: grid;
  gap: 1px;
}

.benefit {
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

.accent .head {
  flex-direction: column;
  flex: 1;
  gap: var(--space-m);
}

.accent .icon {
  width: var(--space-3xl);
  height: var(--space-3xl);
  margin: auto;
}

.accent h3 {
  width: 100%;
  order: -1;
}

@media (min-width: 640px) and (max-width: 799px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .accent {
    grid-column-end: span 2;
  }
}

@media (min-width: 800px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: 1fr;
  }

  .accent {
    grid-row-end: span 2;
  }

  .accent .icon {
    width: 16rem;
    height: 16rem;
  }
}
</style>