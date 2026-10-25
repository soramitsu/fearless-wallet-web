import { readFile } from 'node:fs/promises'
import type { NetworkInfo } from '~/lib/constants/types'
import featuredNetworks from './src/lib/networks'

const featuredNetworkNames: { [key: string]: true } = {}
const resultNetworks = Object.keys(featuredNetworks).reduce((acc, key) => {
  featuredNetworkNames[featuredNetworks[key].fullName] = true
  acc.push({
    ...featuredNetworks[key],
    slug: key,
  })
  return acc
}, [] as (NetworkInfo & { slug?: string })[])

const networks: {
  name: string
  icon: string
  disabled?: boolean
}[] = JSON.parse(await readFile(new URL('../remote-config/production/chains/v13/chains.json', import.meta.url), 'utf8'))

networks
  .filter((network) => !network.disabled)
  .forEach((network) => {
    if (!featuredNetworkNames[network.name]) {
      resultNetworks.push({
        fullName: network.name,
        icon: `/networks/${network.icon.replace(/.*\/(.*)\.svg/g, '$1')}.svg`,
      })
    }
  })

console.log('export const networks =', resultNetworks)
