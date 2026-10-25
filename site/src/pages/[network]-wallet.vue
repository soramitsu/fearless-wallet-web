<script setup lang="ts">
import networks from '~/lib/networks'

const route = useRoute()

if (!(typeof route.params.network === 'string' && route.params.network in networks)) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Page Not Found',
    fatal: true
  })
}

const network = networks[route.params.network]
if (!network) throw createError({ statusCode: 404, statusMessage: 'Page Not Found', fatal: true })
const { fullName, shortName, icon, description } = network

if (!(fullName && shortName && icon && description)) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Page Not Found',
    fatal: true
  })
}

const title = `Fearless Wallet: The Secure ${fullName} Wallet for Easy Storage and Management`,
  metaDescription = `Fearless Wallet is the best ${fullName} wallet for securing, managing, and accessing your ${shortName} with ease. Enjoy high-level protection, simple DeFi integration, and a user-friendly interface.`,
  keywords = `${fullName} wallet, ${shortName} wallet, secure ${fullName} wallet, DeFi ${fullName} wallet, best ${fullName} wallet, Fearless Wallet, cryptocurrency wallet, ERC-20 tokens, Polkaswap`

useSeoMeta({
  title,
  ogTitle: title,
  twitterTitle: title,
  description: metaDescription,
  ogDescription: metaDescription,
  twitterDescription: metaDescription,
})

useHead({ meta: [{ name: 'keywords', content: keywords }] })

useSchemaOrg([
  defineArticle({
    inLanguage: "en-US",
    "headline": `Fearless Wallet: The Secure ${fullName} Wallet for Easy Storage and Management`,
    "alternativeHeadline": `Store, send, receive, and swap ${shortName} with high-level protection, DeFi access, and a user-friendly interface.`,
    "description": `Fearless Wallet is the best ${fullName} wallet for securing, managing, and accessing your ${shortName} with ease. Enjoy high-level protection, simple DeFi integration, and a user-friendly interface.`,
    "keywords": [`${fullName} wallet`, `${shortName} wallet`, `secure ${fullName} wallet`, `DeFi ${fullName} wallet`, `best ${fullName} wallet`, "Fearless Wallet", "cryptocurrency wallet", "ERC-20 tokens", "Polkaswap"],
    "author": {
      "@type": "Organization",
      "name": "Fearless Wallet"
    }
  })
])
</script>

<template>
  <NetworkHero :fullName="fullName" />
  <NetworkWhy :fullName="fullName" />
  <NetworkInfo :fullName="fullName" :shortName="shortName" :description="description" :icon="icon" />
  <NetworkFAQ :fullName="fullName" :shortName="shortName" />
  <hr>
  <NetworkList title="Explore Other Networks" :networks="networks" />
</template>