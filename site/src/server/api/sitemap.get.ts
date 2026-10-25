import { serverQueryContent } from '#content/server'
import networks from '~/lib/networks'

export default defineEventHandler(async (event) => {
  const blogArticles = await serverQueryContent(event, '/blog').find()

  return [
    ...blogArticles.map((el) => el._path),
    ...Object.keys(networks).map((el) => `/${el}-wallet`),
    '/release-notes/ios',
    '/release-notes/android',
  ]
})
