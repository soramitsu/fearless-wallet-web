<script setup lang="ts">
type Link = {
  title: string
  href: string
  icon?: string
  external?: boolean
}

const community: Link[] = [{
  title: 'Telegram',
  href: 'https://t.me/fearlesswallet',
  icon: 'telegram'
}, {
  title: 'X',
  href: 'https://x.com/fearlesswallet',
  icon: 'x'
}, {
  title: 'GitHub',
  href: 'https://github.com/soramitsu',
  icon: 'github'
}, {
  title: 'YouTube',
  href: 'https://www.youtube.com/fearlesswallet',
  icon: 'youtube'
}, {
  title: 'Medium',
  href: 'https://medium.com/fearlesswallet',
  icon: 'medium'
}]

const downloadLinks: Link[] = [{
  title: 'Chrome extension',
  href: 'https://chrome.google.com/webstore/detail/fearless-wallet/nhlnehondigmgckngjomcpcefcdplmgc',
  icon: 'chrome'
}, {
  title: 'iOS (App Store)',
  href: 'https://apps.apple.com/us/app/fearless-wallet/id1537251089',
  icon: 'appstore'
}, {
  title: 'Android (Play Market)',
  href: 'https://play.google.com/store/apps/details?id=jp.co.soramitsu.fearless',
  icon: 'playmarket'
}, {
  title: 'Android (APK)',
  href: 'https://github.com/soramitsu/fearless-Android/releases',
  icon: 'github'
}]

const aboutLinks: Link[] = [{
  title: 'Fearless Wallet',
  href: '/'
}, {
  title: 'Roadmap',
  href: '/roadmap'
}, {
  title: 'FAQ',
  href: '/faq'
}, {
  title: 'Blog',
  href: '/blog'
}]

const resourcesLinks: Link[] = [{
  title: 'Help & Support',
  href: '/support/',
}, {
  title: "Release notes",
  href: '/release-notes',
}, {
  title: "Wiki",
  href: 'https://wiki.fearlesswallet.io/',
  external: true
},
{
  title: "GitHub iOS",
  href: 'https://github.com/soramitsu/fearless-iOS',
  external: true
},
{
  title: "GitHub iOS Utils",
  href: 'https://github.com/soramitsu/fearless-utils-iOS',
  external: true
},
{
  title: "Github Android",
  href: 'https://github.com/soramitsu/fearless-Android',
  external: true
},
{
  title: "Github Android Utils",
  href: 'https://github.com/soramitsu/fearless-utils-Android',
  external: true
},
{
  title: "Brand Assets",
  href: 'https://github.com/sora-xor/sora-branding/tree/master/Fearless-Wallet-brand',
  external: true
},]
</script>

<template>
  <footer class="w px-3xs pt-xxl">
    <div class="community outline-block rounded-s p-s text-xs">
      Join our community
      <div class="buttons">
        <Button v-for="item in community" :key="item.title" :href="item.href" :icon="item.icon" small />
      </div>
    </div>
    <div class="soramitsu color-secondary text-xs p-s">
      <svg width="241" height="29" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 241 29">
        <path fill="#fff" d="M28.1079 9.98175c.451 1.39895.714 2.91135.714 4.49935 0 1.588-.0751 1.6258-.1879 2.4198-4.1711.7184-8.8307 1.0965-13.7909 1.0965-4.96023 0-10.29623-.4537-14.69279-1.2477C.0751555 16.1447 0 15.5398 0 14.897h7.29003c.67639 0 1.24006-.5671 1.24006-1.2477h3.87051c.6764 0 1.24-.5672 1.24-1.2477 0-.6806-.5636-1.2478-1.24-1.2478H.375775C1.87887 4.76402 7.59065 0 14.3922 0c6.8015 0 9.244 2.49544 11.8744 6.2764h-9.3943c-.6764 0-1.2401.56715-1.2401 1.24772 0 .68057.5637 1.24772 1.2401 1.24772h3.8705c0 .68057.5636 1.24776 1.24 1.24776h6.0876l.0375-.03785ZM5.41116 25.824C7.89127 27.7901 11.0102 29 14.3922 29c3.3819 0 6.5384-1.1721 8.981-3.176v-1.3612H5.37358v1.3612h.03758Zm7.47794-4.8396c-3.68262 0-7.2149.1512-10.48414.3402v1.2856s.03757.0756.07515.1134H12.8891v-1.7392Zm2.9686 1.7014h10.4089s.0376-.0756.0752-.1134v-1.2856c-3.2692-.189-6.8015-.3024-10.4841-.3403v1.7393Zm28.2207-9.4524-1.7286-.1513c-1.8789-.1512-2.7807-1.1721-2.7807-2.382 0-1.20988 1.0897-2.8735 3.4571-2.8735s3.4571 1.47457 3.4571 3.0248h3.1941c0-3.55414-2.6304-5.86053-6.6512-5.86053s-6.6136 2.26858-6.6136 5.70923c0 3.4407 2.217 5.0287 5.6742 5.2934l1.7285.1512c2.3674.2269 3.5323 1.0965 3.5323 2.4955 0 1.3989-1.3152 2.9869-4.1711 2.9869s-4.2462-1.588-4.2462-3.176h-3.1941c0 3.4785 2.668 6.0117 7.4403 6.0117 4.4717 0 7.3652-2.382 7.3652-5.8605 0-3.4784-2.5553-5.0286-6.4258-5.4067l-.0375.0378Zm28.1455 1.1721v.5671c0 4.0835-3.0438 9.4902-9.6198 9.4902-6.6137 0-9.6199-5.4067-9.6199-9.4902v-.5671c0-4.49937 3.1941-9.45244 9.6199-9.45244 6.4257 0 9.6198 4.95307 9.6198 9.45244Zm-3.3068.3403c0-3.781-2.4426-6.69235-6.3506-6.69235-3.9081 0-6.3506 2.91135-6.3506 6.69235 0 3.7809 2.4425 6.6923 6.3506 6.6923 3.908 0 6.3506-3.1004 6.3506-6.6923Zm16.9474 2.382 5.0354 6.8435H87.067l-4.5093-6.3142H79.063v6.3142h-3.2317V5.36897h6.5761c4.2838 0 7.027 1.89048 7.027 5.93613v.4159c0 2.7979-1.3152 4.575-3.5699 5.4068Zm.3006-5.5202c0-2.00395-1.3152-3.40291-3.3819-3.40291H79.063v6.76791h3.7202c2.0667 0 3.3819-1.3611 3.3819-3.365Zm17.4739-6.08739 6.576 18.48889h-3.345l-1.766-5.1043h-8.1917l-1.7286 5.1043h-3.2316l6.3506-18.48889h5.3363Zm.488 10.58669-2.705-7.82659h-.94l-2.6303 7.82659h6.2753Zm18.676.8318h-.451l-4.847-11.41849h-4.397V24.0091h2.969V9.22555l4.659 11.00265h3.458l4.697-11.04045V24.0091h3.231V5.52021h-4.471l-4.848 11.41849Zm14.129 7.0704h3.232V5.52021h-3.232V24.0091Zm11.649-15.61536V23.9713h3.232V8.39374h5.374V5.52021H143.17v2.87353h5.411Zm18.225 4.83966-1.728-.1513c-1.879-.1512-2.781-1.1721-2.781-2.382 0-1.20988 1.09-2.8735 3.457-2.8735 2.368 0 3.457 1.47457 3.457 3.0248h3.194c0-3.55414-2.63-5.86053-6.651-5.86053s-6.613 2.26858-6.613 5.70923c0 3.4407 2.217 5.0287 5.674 5.2934l1.728.1512c2.368.2269 3.533 1.0965 3.533 2.4955 0 1.3989-1.316 2.9869-4.172 2.9869-2.855 0-4.246-1.588-4.246-3.176h-3.194c0 3.4785 2.668 6.0117 7.44 6.0117 4.472 0 7.366-2.382 7.366-5.8605 0-3.4784-2.556-5.0286-6.426-5.4067l-.038.0378Zm22.021 3.5541c0 2.8357-1.654 4.6506-4.547 4.6506-2.894 0-4.585-1.8149-4.585-4.6506V5.4824h-3.231v11.0782c0 4.764 2.705 7.9022 7.816 7.9022 5.11 0 7.816-3.1382 7.816-7.9022V5.4824h-3.232v11.3051h-.037Zm17.398 1.1343c-.225.9074-.601 1.6258-1.09 2.2307-.488.605-1.127 1.0587-1.878 1.399-.752.3025-1.729.5671-2.894.7184l.301 1.4367c1.803-.2268 3.269-.6805 4.321-1.3233 1.052-.6428 1.841-1.588 2.367-2.8357.527-1.2477.79-2.9114.865-4.9531l-1.579-.0756c-.037 1.3612-.187 2.4954-.375 3.3651l-.038.0378Zm-4.096.8696c-.601-1.3612-1.202-2.7601-1.879-4.1213l-1.465.6428c.714 1.5502 1.353 2.9114 1.841 4.0835l1.503-.5672v-.0378Zm16.008-4.1969h-7.703v1.399h7.703v-1.399Zm-8.567 4.4994h7.553c-.226 1.1343-.865 1.9661-1.842 2.4954-.977.5293-2.329.8696-4.058.9453l.225 1.4367c2.518-.1512 4.359-.6806 5.562-1.7014 1.202-.9831 1.804-2.4576 1.804-4.3103v-.2647h-9.244v1.4368-.0378Zm18.262 1.0208.226-1.5502c-2.443-.4159-4.735-.6805-6.877-.7562l-.113 1.5881c2.217.1134 4.472.3402 6.764.7561v-.0378Zm.902-4.9152c-2.668-.3781-5.374-.605-8.117-.7184l-.075 1.5124c2.631.1134 5.299.3403 8.004.7184l.188-1.5124Zm-8.718 7.751c2.894.1134 5.862.4159 8.944.9452l.15-1.5502c-3.044-.5293-6.05-.8318-9.019-.9452l-.075 1.5502Zm16.196-4.1969c-.376-1.5124-.714-2.8735-1.052-4.0835l-1.541.3403c.376 1.3234.714 2.6467 1.052 4.0457l1.541-.3403v.0378Zm2.292-4.0456c0 1.3611-.15 2.4954-.376 3.365-.225.9074-.563 1.6636-1.052 2.2308-.488.6049-1.127 1.0587-1.879 1.3611-.751.3025-1.766.5294-2.968.6806l.3 1.4368c1.842-.1891 3.27-.6428 4.359-1.2856 1.09-.6427 1.879-1.588 2.405-2.8357.526-1.2477.789-2.9113.827-4.953l-1.578-.1135-.038.1135Zm-6.576.3781-1.465.3402c.3 1.0965.638 2.4199 1.014 3.9322l1.541-.3402c-.376-1.5502-.752-2.8358-1.052-3.9322h-.038Z"/>
      </svg>
      <div>Made with ♥ by <a href="https://soramitsu.co.jp/" target="_blank">Soramitsu</a> for the multi-chain future</div>
    </div>
    <div class="navigation px-s py-l">
      <div class="about">
        <h3 class="py-xs text-xs color-secondary">About</h3>
        <NuxtLink v-for="item in aboutLinks" :key="item.title" :href="item.href"
          :target="item.external ? '_blank' : undefined" class="link text-xs">
          {{ item.title }}
          <img v-if="item.external" :src="`/icons/arrow.svg`" :alt="`arrow icon`" class="s" />
        </NuxtLink>
      </div>

      <div class="resources">
        <h3 class="py-xs text-xs color-secondary">Resources</h3>
        <NuxtLink v-for="item in resourcesLinks" :key="item.title" :href="item.href"
          :target="item.external ? '_blank' : undefined" class="link text-xs">
          {{ item.title }}
          <img v-if="item.external" :src="`/icons/arrow.svg`" :alt="`arrow icon`" class="s" />
        </NuxtLink>
      </div>

      <div class="chainlink">
        <a href="https://chain.link/badge" target="_blank" class="badge">
          <img src="https://chain.link/badge-market-data-black" alt="market data secured with chainlink" loading="lazy"
            width="180" height="50">
        </a>
      </div>

      <div class="downloads">
        <h3 class="py-xs text-xs color-secondary">Get our Apps</h3>
        <a v-for="item in downloadLinks" :key="item.title" :href="item.href" target="_blank" class="link text-xs">
          <img :src="`/icons/${item.icon}.svg`" :alt="`${item.icon} icon`" />
          {{ item.title }}
        </a>
      </div>
    </div>
    <div class="logo py-m px-xl">
      <img src="/elements/fearless-logo.svg" alt="Fearless Wallet logo" loading="lazy" />
    </div>
    <div class="legal p-m text-xs">
      © 2020-{{ new Date().getFullYear() }} Soramitsu
      <NuxtLink href="/privacy" class="link">Privacy Policy</NuxtLink>
      <NuxtLink href="/terms" class="link">Terms of Service</NuxtLink>
    </div>
  </footer>
</template>

<style scoped>
.soramitsu,
.community {
  display: flex;
  justify-content: space-between;
  gap: var(--space-s);
  flex-direction: column;
  align-items: flex-start;
}

.community {
  text-wrap: nowrap;
  justify-content: center;
}

.soramitsu svg {
  height: 3rem;
  width: auto;
}

.buttons {
  display: flex;
  gap: var(--space-4xs);
  flex-wrap: wrap;
}

.link {
  display: flex;
  align-items: center;
  gap: var(--space-xxs);
  transition: opacity 0.3s ease;
  height: 2.6em;
}

.link img {
  height: 1.5em;
  width: 1.5em;
}

.link img.s {
  height: 1em;
  width: 1em;
}

.navigation {
  display: grid;
  gap: var(--space-m);
  grid-template-columns: auto auto;
}

.downloads {
  display: grid;
  align-items: stretch;
}

.chainlink .badge img {
  display: flex;
  width: 18rem;
  height: 5rem;
  object-fit: contain;
  aspect-ratio: 18/5;
}

.logo {
  opacity: 0.1;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.logo>img {
  max-width: 34rem;
  width: 100%;
  aspect-ratio: 34/17;
}

.legal {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0 var(--space-m);
  flex-wrap: wrap;
}

@media (hover: hover) {
  .link:hover {
    opacity: 0.7;
  }
}

@media (max-width: 799px) {
  .downloads {
    order: -1;
    grid-column-end: span 2;
  }

  .chainlink {
    grid-column-end: span 2;
    display: flex;
    justify-content: center;
  }
}

@media (min-width: 800px) {
  .navigation {
    grid-template-columns: repeat(2, minmax(15rem, auto)) 1fr minmax(24rem, auto);
    align-items: start;
  }

  .community {
    flex-direction: row;
    align-items: center;
  }

  .soramitsu {
    flex-direction: row;
    align-items: center;
  }

  .logo {
    margin-top: -18rem;
  }
}
</style>
