import { writeFile } from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'

const OS = [
  {
    osName: 'ios',
    repoName: 'fearless-iOS',
  },
  {
    osName: 'android',
    repoName: 'fearless-Android',
  },
]

const saveToMarkdown = async (path, release) =>
  writeFile(
    `${path}/${release.tag_name.replaceAll('/', '_')}.md`,
    `---
tag: ${release.tag_name}
name: ${release.name}
date: ${release.published_at}
prerelease: ${release.prerelease}
link: ${release.html_url}
tarball_url: ${release.tarball_url}
zipball_url: ${release.zipball_url}
${
  release.assets?.length > 0
    ? `assets: ${release.assets
        .map(
          (asset) => `
  - name: ${asset.name}
    download_url: ${asset.browser_download_url}
    content_type: ${asset.content_type}
    size: ${asset.size}`,
        )
        .join('')}
`
    : ''
}---

${release.body.replaceAll(/(#{1,2} )/g, '### ')}
`,
  )

const data = await Promise.all(
  OS.map(({ osName, repoName }) =>
    fetch(`https://api.github.com/repos/soramitsu/${repoName}/releases?per_page=100`).then(
      async (res) => ({
        title: osName,
        releases: await res.json(),
      }),
    ),
  ),
)

await Promise.all(
  data
    .map(({ title, releases }) => {
      const path = `./src/content/release-notes/${title}`
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true })
      }

      return releases.map((release) => {
        if (!release.draft) {
          return saveToMarkdown(path, release)
        }
      })
    })
    .flat(),
)
