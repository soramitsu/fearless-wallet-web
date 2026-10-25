<script setup lang="ts">
const title = 'Help & Support | Fearless Wallet'
const description = 'Get help with Fearless Wallet for Android, iOS, and the browser extension. Find guides or contact our support team.'

useSeoMeta({
  title,
  ogTitle: title,
  twitterTitle: title,
  description,
  ogDescription: description,
  twitterDescription: description,
  ogUrl: 'https://fearlesswallet.io/support/'
})
</script>

<template>
  <div class="w-narrow px-l pt-3xl mb-xxl support-page">
    <h1 class="text-center">Help <span class="color-accent">&amp; Support</span></h1>
    <p class="my-l">
      Get help with Fearless Wallet on Android, iOS, or your browser.
    </p>

    <section aria-labelledby="contact-support" class="my-xl">
      <h2 id="contact-support" class="mb-m">Contact support</h2>
      <p class="mb-m">
        For app issues, feedback, and feature requests, email
        <a href="mailto:fearless@soramitsu.co.jp">fearless@soramitsu.co.jp</a>.
      </p>
      <p>
        You can also visit our
        <a href="https://t.me/fearlesshappiness" target="_blank" rel="noopener noreferrer">Telegram support chat</a>.
      </p>
    </section>

    <section aria-labelledby="support-guides" class="my-xl">
      <h2 id="support-guides" class="mb-m">Find an answer</h2>
      <p>
        Browse the <NuxtLink to="/faq">frequently asked questions</NuxtLink> or read the
        <a href="https://wiki.fearlesswallet.io/" target="_blank" rel="noopener noreferrer">Fearless Wallet guides</a>.
      </p>
    </section>

    <section aria-labelledby="support-details" class="my-xl">
      <h2 id="support-details" class="mb-m">Tell us what happened</h2>
      <p class="mb-m">
        Include your app version, device or browser, the network involved, and the steps that led to the issue.
      </p>
      <p>
        Never share your recovery phrase, private keys, passwords, or backup files with anyone, including support.
      </p>
    </section>
  </div>
</template>

<style scoped>
.support-page a {
  overflow-wrap: anywhere;
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
</style>
