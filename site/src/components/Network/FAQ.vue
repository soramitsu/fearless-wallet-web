<script setup lang="ts">
const { fullName, shortName } = defineProps<{
  fullName: string
  shortName: string
}>()

const data = computed(() => [
  {
    question: `How do I secure my ${fullName} wallet?`,
    answer: `With Fearless Wallet, securing your ${fullName} wallet is simple yet robust. You have full control over your private keys, and the wallet ensures your seed phrase is safely stored offline. To enhance security, we recommend enabling biometric login, setting up a strong password, and always backing up your recovery phrase. Fearless Wallet also offers regular updates to keep your assets protected from the latest threats, so you can rest easy knowing your ${fullName} assets is secure.`,
  },
  {
    question: "Which tokens are supported in Fearless Wallet?",
    answer: `Fearless Wallet supports a wide range of tokens across multiple blockchains. In addition to ${fullName} (${shortName}) network, you can store, send, and receive assets on 80+ blockchains. As a multi-chain wallet, Fearless continues to add new networks and tokens, giving you flexibility to manage various assets all in one place.`,
  },
  {
    question: `What are the transaction fees for ${fullName} in Fearless Wallet?`,
    answer: `Transaction fees for ${fullName} in Fearless Wallet depend on the network’s current gas fees. Fearless Wallet ensures you're always aware of the estimated fees before confirming any transaction, so you can make informed decisions. While the wallet itself doesn’t charge fees, the ${fullName} network requires a small fee to process transactions, which varies based on network activity.`,
  },
  {
    question: "What should I do if I lost access to my wallet?",
    answer: "If you lose access to your Fearless Wallet, don’t worry—your recovery phrase is your key to regaining access. Simply use the backup seed phrase you saved when setting up your wallet to restore your account. It's essential to keep this phrase secure and offline, as only you have control over it. Fearless Wallet cannot recover your wallet for you, so safeguarding your recovery phrase is critical for ensuring access to your assets.",
  },
])

const activeItem = ref<number>()

const toggleAccordion = (id: number) => {
  if (activeItem.value === id) {
    activeItem.value = undefined
  } else {
    activeItem.value = id
  }
}
</script>

<template>
  <h2 class="w-narrow px-l mt-3xl text-center text-xxl">
    FAQ
  </h2>
  <AccordionContainer class="w-narrow px-3xs mt-xl mb-3xl">
    <AccordionItem v-for="(item, i) in data" :title="item.question" :key="i" :id="i" @toggle="toggleAccordion"
      :open="i === activeItem">
      {{ item.answer }}
    </AccordionItem>
  </AccordionContainer>
</template>