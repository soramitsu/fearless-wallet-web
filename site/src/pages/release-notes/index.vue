<script setup lang="ts">
const links = [{
  icon: "appstore",
  title: "Fearless Wallet for iOS",
  description: "Stay updated with the latest features and improvements in Fearless Wallet for iOS.",
  href: '/release-notes/ios',
  internal: true
},
{
  icon: "android",
  title: "Fearless Wallet for Android",
  description: "Stay updated with the latest features and improvements in Fearless Wallet for Android.",
  href: '/release-notes/android',
  internal: true
}]

const title = 'Fearless Wallet Release Notes - Latest Updates & Features',
  description =
    'Discover the latest updates and features of Fearless Wallet. Stay informed with our comprehensive release notes for all platforms.',
  keywords =
    'Fearless Wallet, release notes, updates, features, DeFi, crypto wallet'

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
    name: 'Fearless Release Notes',
    description: 'Discover the latest updates and features of Fearless Wallet. Stay informed with our comprehensive release notes for all platforms.',
  })
])
</script>

<template>
  <h1 class="w-narrow px-l pt-3xl text-center">
    <span class="color-accent">Fearless</span> Release Notes
  </h1>
  <LinkTilesWithIconsSection :links="links" class="my-xxl" />
  <section class="w-narrow px-l mb-xxl rich">
    <p>Welcome to the Fearless Wallet Release Notes! Discover the latest enhancements, including improved security,
      performance upgrades, and essential bug fixes in our newest release.</p>

    <hr>
    <h2 class="text-l">Key Highlights</h2>

    <ul>
      <li>Enhanced Security: We’ve implemented advanced measures to protect your digital assets.</li>
      <li>Performance Upgrades: Enjoy faster transaction speeds and a smoother user experience.</li>
      <li>Bug Fixes: We've resolved minor issues to enhance app stability and reliability.</li>
    </ul>
    <hr>
    <h2 class="text-l">Stay Updated</h2>

    <p>To ensure you’re getting the best experience, keep your app up-to-date. Check for the latest version in the App
      Store or Google Play Store.</p>
    <p>Thank you for choosing Fearless Wallet. Your security and satisfaction are our top priorities!"</p>
  </section>
</template>