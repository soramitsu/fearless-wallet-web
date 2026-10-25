<script setup lang="ts">
const route = useRoute()

const { data } = await useAsyncData(`/blog/${route.params.slug}`, () => queryContent(`/blog/${route.params.slug}`).findOne())

if (!data.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Page Not Found',
    fatal: true
  })
}

const title = data.value.title
const ogImage = data.value.og
const description = data.value.description
const keywords = data.value.keywords
const date = data.value.date

const { baseUrl } = useRuntimeConfig().public

const meta = {
  ...(title ? {
    title: title,
    ogTitle: title,
    twitterTitle: title,
  } : {}),
  ...(ogImage ? {
    ogImage: `${baseUrl}${ogImage}`,
    ogImageSecureUrl: `${baseUrl}${ogImage}`,
    twitterImage: `${baseUrl}${ogImage}`
  } : {}),
  ...(description ? {
    description: description,
    ogDescription: description,
    twitterDescription: description
  } : {}),
  ...(keywords ? {
    keywords: keywords
  } : {})
}

const schema = [
  defineArticle({
    inLanguage: "en-US",
    ...(title ? { headline: title } : {}),
    ...(ogImage ? {
      image: `${baseUrl}${ogImage}`,
    } : {}),
    ...(date ? { datePublished: date } : {}),
    ...(description ? { description: description } : {}),
    ...(keywords ? { keywords: keywords } : {}),
    author: {
      "@type": "Person",
      name: "Fearless Wallet Team"
    }
  })
]

useSeoMeta(meta)
useSchemaOrg(schema)
</script>

<template>
  <ContentRenderer v-if="data" :value="data">
    <article class="w py-3xl mx-auto">
      <div class="px-xs">
        <h1 class="mb-m text-center">{{ data.title }}</h1>
        <p class="text-xs color-secondary text-center mb-l px-m">{{ (new Date(date)).toDateString() }}</p>
        <img :src="data.cover" alt="Article cover" class="w-narrow rounded-s mb-xxl cover ">
      </div>

      <ContentRendererMarkdown :value="data" class="w-narrow rich px-m" />
    </article>
    <template #empty>
      <article class="py-xxl rich mx-auto px-m">
        <h1 class="mb-xs">Content not found</h1>
      </article>
    </template>
  </ContentRenderer>
</template>

<style scoped>
.cover {
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
}
</style>