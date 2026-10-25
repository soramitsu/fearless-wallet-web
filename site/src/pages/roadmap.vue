<script setup lang="ts">
const roadmap = [{
  title: 'Universal Wallet',
  items: [
    'Align the browser extension, iOS app, and Android app around one Universal Wallet phrase',
    'Keep legacy wallets available for export and recovery while new versions use Universal Wallet by default',
    'Keep wallet core, registry defaults, and indexer clients open source',
  ]
}, {
  title: 'New Ecosystems',
  items: [
    'Add Bitcoin native SegWit wallet support',
    'Add Solana accounts, token visibility, and browser-extension dApp connection support',
    'Standardize TON wallet reads on ti.soramitsu.io and Solana wallet reads on si.soramitsu.io',
  ]
}, {
  title: 'SORA Nexus and Taira',
  items: [
    'Enable Taira testnet account support for Iroha-based wallet validation',
    'Gate SORA Nexus mainnet until a production Torii TLS endpoint is confirmed',
    'Add Nexus transfer, offline cash, SCCP, and governance entry points as they become release-ready',
  ]
}]

const title = 'Fearless Wallet Universal Wallet Roadmap',
  description =
    'The Fearless Wallet roadmap summarizes Universal Wallet, Bitcoin, Solana, TON, and SORA Nexus work across the maintained browser, iOS, and Android apps.',
  keywords =
    'Fearless Wallet roadmap, crypto wallet apps, wallet app, wallet web, krypto wallet, browser wallet, crypto wallet, blockchain wallet app'

useSeoMeta({
  title,
  ogTitle: title,
  twitterTitle: title,
  description,
  ogDescription: description,
  twitterDescription: description,
})

useHead({ meta: [{ name: 'keywords', content: keywords }] })

useSchemaOrg([
  {
    "@type": "WebPage",
    inLanguage: "en-US",
    name: 'Fearless Wallet Roadmap',
    description: 'Roadmap for Universal Wallet, Bitcoin, Solana, TON, and SORA Nexus work in Fearless Wallet.',
    mainEntity: {
      "@type": "ItemList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          item: {
            "@type": "Thing",
            name: "Universal Wallet",
            description: "One recovery phrase across the maintained Fearless Wallet browser, iOS, and Android apps."
          }
        },
        {
          "@type": "ListItem",
          position: 2,
          item: {
            "@type": "Thing",
            name: "Bitcoin",
            description: "Native SegWit Bitcoin account support."
          }
        },
        {
          "@type": "ListItem",
          position: 3,
          item: {
            "@type": "Thing",
            name: "Solana",
            description: "Solana account, token, history, and browser dApp support."
          }
        },
        {
          "@type": "ListItem",
          position: 4,
          item: {
            "@type": "Thing",
            name: "SORA Nexus and Taira",
            description: "Iroha-based account support with Taira enabled and Nexus mainnet gated until production endpoint confirmation."
          }
        },
        {
          "@type": "ListItem",
          position: 5,
          item: {
            "@type": "Thing",
            name: "Open-source wallet core",
            description: "Public wallet code, registry defaults, and indexer clients."
          }
        },
        {
          "@type": "ListItem",
          position: 6,
          item: {
            "@type": "Thing",
            name: "Indexer standardization",
            description: "TON reads through ti.soramitsu.io and Solana reads through si.soramitsu.io."
          }
        },
        {
          "@type": "ListItem",
          position: 7,
          item: {
            "@type": "Thing",
            name: "Migration and recovery",
            description: "Hard-cutoff migration to Universal Wallet while preserving legacy export and fund recovery paths."
          }
        },
        {
          "@type": "ListItem",
          position: 8,
          item: {
            "@type": "Thing",
            name: "Production readiness",
            description: "Cross-platform CI, negative tests, adversarial checks, and release hardening."
          }
        }
      ]
    },
  }
])
</script>

<template>
  <h1 class="w-narrow px-l pt-3xl text-center">
    Roadmap for <span class="color-accent">Universal Wallet</span>
  </h1>

  <div class="w grid px-3xs py-xxl">
    <div v-for="item in roadmap" :key="item.title" class="p-l bg-block rounded-s rich">
      <h2 class="text-m mb-m">{{ item.title }}</h2>
      <ul class="color-secondary text-s">
        <li v-for="subitem in item.items" :key="subitem">{{ subitem }}</li>
      </ul>
    </div>
  </div>

  <p class="w-narrow px-l mb-m">
    Welcome to the Fearless Wallet Roadmap
  </p>
  <p class="w-narrow px-l mb-m">
    This roadmap highlights the current production-readiness work for the maintained wallet apps: the browser
    extension, iOS app, and Android app. The focus is one Universal Wallet, open-source wallet core code, and support
    for Bitcoin, Solana, TON, EVM, Polkadot/Substrate, Taira, and SORA Nexus.
  </p>
  <p class="w-narrow px-l mb-xxl">
    Nexus mainnet remains gated until the production Torii endpoint is confirmed. Taira testnet support is used to
    validate Iroha-based wallet behavior before Nexus mainnet release.
  </p>
</template>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-m);
}

@media (min-width: 800px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: 1fr;
  }
}
</style>
