<script setup lang="ts">
const links = [{
  title: 'Telegram',
  href: 'https://t.me/fearlesswallet',
  icon: 'telegram',
  description: 'Join our Telegram community for real-time discussions, support, and updates about Fearless Wallet.',
}, {
  title: 'X',
  href: 'https://x.com/fearlesswallet',
  icon: 'x',
  description: 'Follow us on X (formerly Twitter) for the latest updates, tips, and news about Fearless Wallet.'
}, {
  title: 'GitHub',
  href: 'https://github.com/soramitsu',
  icon: 'github',
  description: 'Explore our GitHub repository for the latest code, updates, and contributions to the Fearless Wallet project.'
}, {
  title: 'YouTube',
  href: 'https://www.youtube.com/fearlesswallet',
  icon: 'youtube',
  description: 'Subscribe to our YouTube channel for tutorials, updates, and insights about Fearless Wallet.'
}, {
  title: 'Medium',
  href: 'https://medium.com/fearlesswallet',
  icon: 'medium',
  description: 'Read our in-depth articles, updates, and stories about Fearless Wallet on Medium.'
}]

const title = 'Fearless Wallet - Crypto Community Hub',
  description =
    'Join the vibrant Fearless Wallet community to connect with crypto enthusiasts, stay updated on the latest news, and access support across multiple platforms. Enhancing your crypto experience with Fearless Wallet!',
  keywords =
    'Fearless Wallet, cryptocurrency community, crypto wallet support, blockchain enthusiasts, Fearless Wallet Telegram, crypto discussions, digital wallet news, Fearless Wallet updates, crypto education, Fearless Wallet GitHub, crypto tutorials, Fearless Wallet YouTube, crypto community, secure crypto transactions, multi-chain wallet, DeFi, wallet security tips, crypto investment strategies, Fearless Wallet features, peer-to-peer crypto support'

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
    name: 'Fearless Wallet Community',
    description: 'Join the Fearless Wallet community for real-time discussions, support, and updates.',
    mainEntity: {
      "@type": "WebPageElement",
      "name": "Community Platforms",
      "description": "Connect with us across various platforms to stay informed, get support, and engage with other users.",
      "hasPart": [
        {
          "@type": "SocialMediaPosting",
          "headline": "Telegram Community",
          "name": "Telegram Community",
          "url": "https://t.me/fearlesswallet",
          "description": "Join our Telegram community for real-time discussions, support, and updates about Fearless Wallet.",
          "interactionStatistic": {
            "@type": "InteractionCounter",
            "interactionType": "https://schema.org/JoinAction",
            "userInteractionCount": 1000
          },
          "datePublished": new Date('2024-07-31').toISOString(),
          "author": {
            "@type": "Person",
            "name": "Fearless Wallet Team"
          }
        },
        {
          "@type": "SocialMediaPosting",
          "headline": "Telegram Announcements",
          "name": "Telegram Announcements",
          "url": "https://t.me/fearless_announcements",
          "description": "Stay up-to-date with the latest news and announcements from the Fearless Wallet team on Telegram.",
          "datePublished": new Date('2024-07-31').toISOString(),
          "author": {
            "@type": "Person",
            "name": "Fearless Wallet Team"
          }
        },
        {
          "@type": "SocialMediaPosting",
          "headline": "Follow us on X",
          "name": "Follow us on X",
          "url": "https://x.com/fearlesswallet",
          "description": "Follow us on X (formerly Twitter) for the latest updates, tips, and news about Fearless Wallet.",
          "datePublished": new Date('2024-07-31').toISOString(),
          "author": {
            "@type": "Person",
            "name": "Fearless Wallet Team"
          }
        },
        {
          "@type": "SocialMediaPosting",
          "headline": "GitHub Repository",
          "name": "GitHub Repository",
          "url": "https://github.com/soramitsu",
          "description": "Explore our GitHub repository for the latest code, updates, and contributions to the Fearless Wallet project.",
          "datePublished": new Date('2024-07-31').toISOString(),
          "author": {
            "@type": "Person",
            "name": "Fearless Wallet Team"
          }
        },
        {
          "@type": "SocialMediaPosting",
          "headline": "YouTube Channel",
          "name": "YouTube Channel",
          "url": "https://www.youtube.com/fearlesswallet",
          "description": "Subscribe to our YouTube channel for tutorials, updates, and insights about Fearless Wallet.",
          "datePublished": new Date('2024-07-31').toISOString(),
          "author": {
            "@type": "Person",
            "name": "Fearless Wallet Team"
          }
        },
        {
          "@type": "SocialMediaPosting",
          "headline": "Medium Articles",
          "name": "Medium Articles",
          "url": "https://medium.com/fearlesswallet",
          "description": "Read our in-depth articles, updates, and stories about Fearless Wallet on Medium.",
          "datePublished": new Date('2024-07-31').toISOString(),
          "author": {
            "@type": "Person",
            "name": "Fearless Wallet Team"
          }
        }
      ]
    },
  }
])
</script>

<template>
  <h1 class="w-narrow px-l pt-3xl text-center">
    Join the <span class="color-accent">Fearless Community</span>
  </h1>

  <LinkTilesWithIconsSection :links="links" :columns="3" class="my-xxl" />

  <p class="w-narrow px-l mb-m">
    Welcome to the Fearless Wallet Community Hub!
  </p>
  <p class="w-narrow px-l mb-m">
    Join the thriving Fearless Wallet community and connect with fellow users across multiple platforms. Stay updated on
    the latest Fearless Wallet news, receive support, and engage in meaningful discussions. Whether you enjoy real-time
    chats on Telegram, following updates on X (formerly Twitter), exploring our GitHub codebase, or watching informative
    videos on YouTube, we have a space tailored just for you.
  </p>
  <p class="w-narrow px-l mb-xxl">
    Become a valued member of the Fearless Wallet community today and unlock the full potential of your crypto
    experience!
  </p>
</template>
