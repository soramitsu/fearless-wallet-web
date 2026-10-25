<script setup lang="ts">
const title = 'Fearless Wallet The DeFi Crypto Wallet for Multi-Chain Future',
  description =
    'Fearless Wallet is an open-source self-custody wallet for browser, iOS, and Android. One Universal Wallet phrase restores Bitcoin, Solana, TON, EVM, Polkadot, and SORA accounts.',
  keywords =
    'crypto wallet apps, wallet app, wallet web, browser wallet, crypto wallet, blockchain wallet app, bitcoin wallet, solana wallet, ton wallet, SORA Nexus wallet'

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
  defineWebPage({
    inLanguage: "en-US",
    name: title,
    description: description
  }),
  {
    "@type": "SoftwareApplication",
    applicationCategory: "http://schema.org/FinanceApplication",
    name: "Fearless Wallet",
    operatingSystem: "WINDOWS, OSX, IOS, ANDROID",
    downloadUrl: "https://fearlesswallet.io/",
    aggregateRating: {
      ratingValue: "4.6",
      ratingCount: "6459"
    },
    offers: {
      price: "0",
      priceCurrency: "USD"
    }
  }
])
</script>

<template>
  <HeroSection class="pb-xl" />
  <NetworkSection class="mb-xxl" />
  <FeaturesSection class="mb-3xl" />
  <section class="w px-3xs mb-3xl">
    <div class="rounded-s bg-block px-l py-xxl">
      <h2 class="text-xl mb-s">
        One Universal Wallet for the supported ecosystems
      </h2>
      <p class="text-s color-secondary mb-l">
        Create or import one recovery phrase and use it across the maintained Fearless Wallet apps: iOS, Android, and
        the browser extension. The wallet roadmap covers Bitcoin, Solana, TON, EVM, Polkadot/Substrate, and SORA
        Nexus/Taira accounts with open-source wallet core code.
      </p>
      <ul class="ecosystems text-s color-secondary">
        <li>Bitcoin native SegWit accounts for BTC receive, send, balance, and history.</li>
        <li>Solana accounts, SPL Token visibility, and browser-extension dApp connection support.</li>
        <li>TON wallet support using the public TI indexer at ti.soramitsu.io.</li>
        <li>SORA Nexus and Taira Iroha account support with Nexus mainnet gated until production Torii is confirmed.</li>
      </ul>
    </div>
  </section>
  <BannerSection title="Earn with Staking"
    description="Stake across 7+ networks, earn rewards, and contribute to network security." :img="{
      src: '/features/stake.svg',
      alt: 'Staking'
    }" class="mb-3xl" />
  <BenefitsSection class="mb-3xl" />
  <ManifestSection class="mb-3xl" />
</template>

<style scoped>
.ecosystems {
  display: grid;
  gap: var(--space-xs);
}

@media (min-width: 800px) {
  .ecosystems {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
