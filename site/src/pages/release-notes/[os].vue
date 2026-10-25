<script setup lang="ts">
const platforms = {
  ios: {
    name: 'iOS',
    title: 'Fearless Wallet Release Notes for iOS - Latest Features & Updates',
    description: 'Explore the latest features and updates for the Fearless Wallet on iOS. Stay up-to-date with our detailed release notes.',
    keywords: 'Fearless Wallet iOS, iOS updates, release notes, features, DeFi wallet'
  },
  android: {
    name: 'Android',
    title: 'Fearless Wallet Release Notes for Android - New Features & Updates',
    description: 'Check out the latest features and updates for the Fearless Wallet on Android. Stay informed with our comprehensive release notes.',
    keywords: 'Fearless Wallet Android, Android updates, release notes, features, DeFi wallet'
  },
}

const os = useRoute().params.os

if (!(typeof os === 'string') || !(os in platforms)) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Page Not Found',
    fatal: true
  })
}

const { name, title, description, keywords } = platforms[os as keyof typeof platforms]
const { data } = await useAsyncData(`release-notes-${os}`, () => queryContent(`/release-notes/${os}`).sort({ date: -1 }).find())

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
    name: `Fearless Release Notes for ${name}`,
    description: `Explore the latest features and updates for the Fearless Wallet on ${name}. Stay up-to-date with our detailed release notes.`,
  })
])
</script>

<template>
  <h1 class="w-narrow px-l pt-3xl text-center">
    <span class="color-accent">Fearless</span> Release Notes
  </h1>
  <nav class="subnav mt-s outline-block rounded-s p-3xs mx-auto text-xxs">
    <NuxtLink v-for="platform in Object.keys(platforms)" :href="`/release-notes/${platform}`"
      class="px-xs py-xxs rounded-xs text-center">
      {{ platforms[platform as keyof typeof platforms].name }}
    </NuxtLink>
  </nav>
  <section class="w-narrow px-3xs mt-xl mb-xxl releases">
    <article v-for="(release, i) in data" class="bg-block rounded-s p-l o-hidden" :key="i">
      <div class="flex meta mb-m text-xs">
        <div class="bg-block rounded-xs px-xs py-3xs">{{ new Date(release.date).toDateString() }}</div>
        <div class="bg-block rounded-xs px-xs py-3xs">{{ release.tag }}</div>
        <div v-if="release.prerelease" class="outline-block rounded-xs px-xs py-3xs">Pre-release</div>
      </div>
      <h2 class="text-l mb-m">{{ release.name }}</h2>
      <hr>
      <ContentRenderer :value="release" class="rich text-s my-l" />
      <div class="flex downloads text-xs mt-xl">
        <a v-for="asset in release.assets" :href="asset.download_url" class="download py-4xs color-secondary">
          <img src="/icons/download.svg" alt="download icon" class="icon">
          <div class="name">{{ asset.name }}</div>
        </a>
        <a :href="release.zipball_url" class="download py-4xs color-secondary">
          <img src="/icons/download.svg" alt="download icon" class="icon">
          <div class="name">Source Code (zip)</div>
        </a>
        <a :href="release.tarball_url" class="download py-4xs color-secondary">
          <img src="/icons/download.svg" alt="download icon" class="icon">
          <div class="name">Source Code (tar.gz)</div>
        </a>
      </div>
    </article>
  </section>
</template>

<style scoped>
.subnav {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  width: fit-content;
}

.subnav>.router-link-exact-active {
  background-color: #191919;
  cursor: default;
}

.subnav>a {
  transition: opacity 0.3s ease, background-color 0.3s ease;
}

.releases {
  display: grid;
  gap: var(--space-l);
}

.flex {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.meta {
  gap: var(--space-3xs);
}

.downloads {
  gap: var(--space-3xs) var(--space-m);
}

.download {
  display: flex;
  gap: var(--space-xxs);
  transition: color 0.3s ease;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-link);
}

.download>.name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
}

.download>.icon {
  display: block;
  width: 1.3em;
  height: 1.3em;
  min-width: 0;
}

@media (hover:hover) {
  .subnav>a:not(.router-link-exact-active):hover {
    opacity: 0.7;
  }

  .download:hover {
    color: var(--color-primary);
  }
}
</style>