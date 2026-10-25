<script setup lang="ts">
const { fullName, shortName } = defineProps<{
  fullName: string
  shortName: string
  description: string[]
  icon: string
}>()
</script>

<template>
  <section class="mt-xxl mb-3xl w-narrow px-l rich">
    <img :src="icon" :alt="`${fullName} icon`" class="mx-auto icon mb-xl" />
    <h2>About {{ fullName }}</h2>
    <p v-for="line in description">
      {{ line }}
    </p>
    <h2>
      Using {{ fullName }} in Fearless Wallet
    </h2>
    <ol>
      <li>
        <b>Store:</b>
        Keep your {{ fullName }} ({{ shortName }}) assets safe with cutting-edge security features in Fearless Wallet
      </li>
      <li>
        <b>Send and Receive:</b>
        Send and receive {{ fullName }} seamlessly using an {{ fullName }} address or by scanning a QR code
      </li>
      <li>
        <b>Private and Secure:</b>
        Take full control of your {{ fullName }} assets while we ensure your security — fearlessly
      </li>
      <li>
        <b>Simple and user-friendly:</b>
        Enjoy an intuitive interface designed for smooth and easy {{ fullName }} asset management
      </li>
    </ol>
  </section>
</template>

<style scoped>
.icon {
  width: var(--space-3xl);
  height: var(--space-3xl);
}
</style>