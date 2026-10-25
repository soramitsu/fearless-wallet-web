<script setup lang="ts">
const links = [{
  icon: "chrome",
  title: "Fearless Wallet for Chrome",
  description: "Easily access and manage your Fearless Wallet directly from your browser with our Chrome extension.",
  href: 'https://chrome.google.com/webstore/detail/fearless-wallet/nhlnehondigmgckngjomcpcefcdplmgc',
},
{
  icon: "appstore",
  title: "Fearless Wallet for iOS",
  description: "Download Fearless Wallet from the App Store for a seamless and secure crypto experience on your iPhone or iPad.",
  href: 'https://apps.apple.com/us/app/fearless-wallet/id1537251089',
},
{
  icon: "playmarket",
  title: "Fearless Wallet for Android",
  description: "Get Fearless Wallet on your Android device from the Play Market.",
  href: 'https://play.google.com/store/apps/details?id=jp.co.soramitsu.fearless',
},
{
  icon: "github",
  title: "Fearless Wallet APK for Android",
  description: "Download the Fearless Wallet APK directly from GitHub for your Android device.",
  href: 'https://github.com/soramitsu/fearless-Android/releases',
}]

const title = 'Download Fearless Wallet - Open-Source Self-Custody Multichain Wallet',
  description =
    'Download the latest version of Fearless Wallet for browser, iOS, and Android. Use one Universal Wallet phrase for supported Bitcoin, Solana, TON, EVM, Polkadot, and SORA accounts.',
  keywords =
    'crypto wallet apps, wallet app, wallet web, download, browser wallet, cryptowallet, crypto, multichain wallet, cryptowallet, crypto wallet, wallet, blockchain, buy, sell, bitcoin, btc, ethereum, eth, shiba inu, doge, self custody, web3 ,digital art, nft, exchange, swap, bridge'

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
    name: 'Download Fearless Wallet',
    description: 'Download the Fearless Wallet app to securely manage your cryptocurrencies and digital assets.',
    mainEntity: {
      "@type": "SoftwareApplication",
      name: "Fearless Wallet",
      operatingSystem: "iOS, Android",
      applicationCategory: "Wallet",
      description: "Fearless Wallet is an open-source self-custody wallet for managing supported cryptocurrencies.",
      downloadUrl: "https://www.fearlesswallet.io/download",
      softwareVersion: "1.0.0",
      releaseNotes: "Universal Wallet release track with Bitcoin, Solana, TON, EVM, Polkadot, and SORA ecosystem support.",
      offers: {
        "@type": "Offer",
        url: "https://www.fearlesswallet.io/download",
        priceCurrency: "USD",
        price: "0.00",
        itemCondition: "https://schema.org/NewCondition",
        availability: "https://schema.org/InStock"
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: "1200"
      },
      image: {
        "@type": "ImageObject",
        url: "https://fearlesswallet.io/og.jpg",
        width: 1200,
        height: 630
      }
    }
  }
])
</script>

<template>
  <h1 class="w-narrow px-l pt-3xl text-center">
    <span class="color-accent">Download</span> Fearless Wallet
  </h1>
  <LinkTilesWithIconsSection :links="links" class="my-xxl" />
  <section class="w-narrow px-l mb-xxl rich">
    <BannerButton href="/release-notes" class="mb-xl" title="Release notes" />

    <h2 class="text-l mb-m">
      Download Fearless Wallet: Open-Source Self-Custody on Every Supported Platform
    </h2>

    <p>
      Welcome to the official download page for Fearless Wallet. The maintained wallet apps are the browser extension,
      the iOS app, and the Android app. Each app is being aligned around Universal Wallet support so one recovery phrase
      can restore your supported accounts across Bitcoin, Solana, TON, EVM, Polkadot/Substrate, and SORA ecosystems.
    </p>

    <hr>

    <h2 class="text-l mb-m">
      Why Choose Fearless Wallet?
    </h2>

    <ul>
      <li>
        <b class="color-accent">Cross-Platform Compatibility:</b> Manage your wallet in the browser extension, on iOS,
        or on Android.
      </li>
      <li>
        <b class="color-accent">Self-Custody:</b> Your wallet is controlled by your recovery phrase. Fearless Wallet
        does not custody your funds.
      </li>
      <li>
        <b class="color-accent">Open-Source Wallet Core:</b> Public wallet code, registry defaults, and indexer clients
        can be reviewed by the community.
      </li>
    </ul>

    <hr>

    <h2 class="text-l mb-m">
      Join the Fearless Community
    </h2>

    <p>
      Download Fearless Wallet today and take control of your cryptocurrency investments with confidence. Join a rapidly
      growing community of users who trust Fearless Wallet for self-custody digital asset management.
    </p>
    <p>
      Start Your Fearless Journey Now!<br />
      Choose your preferred platform to get started.<br />
      Take charge of your cryptocurrency with Fearless Wallet—where security meets efficiency!
    </p>
  </section>
</template>
